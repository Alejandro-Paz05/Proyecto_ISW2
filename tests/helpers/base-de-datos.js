import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

/**
 * Una base Postgres de verdad, en memoria, para probar las migraciones.
 *
 * PGlite es Postgres compilado a WebAssembly: no es un simulacro del motor,
 * así que las funciones en PL/pgSQL, los triggers y las políticas de RLS se
 * ejecutan igual que en Supabase. Hasta acá esa parte del sistema solo se
 * verificaba a mano contra la base real (lo dice la propia ADR-001).
 *
 * Lo que PGlite no trae es lo que agrega Supabase alrededor de Postgres: el
 * esquema `auth`, los roles de la API y los privilegios que esos roles
 * reciben por defecto. ENTORNO_SUPABASE lo reproduce en lo mínimo que las
 * migraciones usan. Los privilegios importan: la 005 los recorta, y sin el
 * punto de partida real ese recorte no probaría nada.
 */

const DIRECTORIO = fileURLToPath(new URL('../../supabase/migraciones/', import.meta.url));

export const MIGRACIONES = readdirSync(DIRECTORIO)
  .filter((archivo) => archivo.endsWith('.sql'))
  .sort();

const ENTORNO_SUPABASE = `
  -- Los tres roles con los que llega una petición a la API de Supabase.
  -- service_role salta RLS, igual que la clave secreta.
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;

  -- Supabase les da todo sobre lo que se crea en public. Las migraciones
  -- recortan desde ahí.
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  -- Lo mínimo del esquema auth que usan las migraciones.
  CREATE SCHEMA auth;

  CREATE TABLE auth.users (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email              TEXT UNIQUE,
    raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- En Supabase, auth.uid() lee el usuario del JWT de la petición. Acá lo
  -- lee de un ajuste de la transacción, que las pruebas fijan con como().
  CREATE FUNCTION auth.uid() RETURNS UUID
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

  -- Lo mínimo del esquema storage: el registro de buckets y la tabla de
  -- archivos, con RLS activa como en Supabase. Alcanza para que la 007 se
  -- aplique igual acá que allá, incluida su política de lectura.
  CREATE SCHEMA storage;

  CREATE TABLE storage.buckets (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    public             BOOLEAN NOT NULL DEFAULT FALSE,
    file_size_limit    BIGINT,
    allowed_mime_types TEXT[],
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE storage.objects (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id  TEXT REFERENCES storage.buckets (id),
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

  GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
  GRANT ALL ON storage.buckets, storage.objects TO anon, authenticated, service_role;
`;

export async function aplicarMigraciones(db) {
  for (const archivo of MIGRACIONES) {
    await db.exec(readFileSync(`${DIRECTORIO}${archivo}`, 'utf8'));
  }
}

/** Una base nueva, con el entorno de Supabase y todas las migraciones. */
export async function crearBase() {
  const db = new PGlite();
  await db.exec(ENTORNO_SUPABASE);
  await aplicarMigraciones(db);
  return db;
}

// Error con identidad propia para distinguir "deshacer a propósito" de un
// fallo real dentro de la transacción.
const DESHACER = new Error('deshacer la transacción de prueba');

/**
 * Ejecuta `fn` como lo haría una petición de ese rol y deshace todo al
 * terminar, así cada prueba ve la base intacta.
 *
 * `usuario` es el id de auth.users que devolvería auth.uid(); se omite para
 * anon.
 */
export async function como(db, { rol, usuario = null }, fn) {
  let resultado;

  try {
    await db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${rol}`);
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [usuario ?? '']);
      resultado = await fn(tx);
      throw DESHACER;
    });
  } catch (error) {
    if (error !== DESHACER) throw error;
  }

  return resultado;
}

/**
 * Da de alta una cuenta como lo haría Supabase Auth: insertando en
 * auth.users, que dispara el trigger del perfil. El rol, si no es clienta,
 * se sube después, que es como pasa en la realidad.
 */
export async function crearUsuario(db, { email, metadatos = {}, rol = 'clienta' }) {
  const {
    rows: [{ id }]
  } = await db.query(
    'INSERT INTO auth.users (email, raw_user_meta_data) VALUES ($1, $2::jsonb) RETURNING id',
    [email, JSON.stringify(metadatos)]
  );

  if (rol !== 'clienta') {
    await db.query('UPDATE profiles SET role = $1 WHERE id = $2', [rol, id]);
  }

  return id;
}

/** Un producto con stock, para poder crear pedidos. */
export async function crearProducto(db, { stock = 10 } = {}) {
  const {
    rows: [{ id }]
  } = await db.query(
    `INSERT INTO products (name, category, price, stock) VALUES ('Kit de prueba', 'unas', 850, $1) RETURNING id`,
    [stock]
  );
  return id;
}

/** Un pedido hecho por create_order, con cuenta o como invitada. */
export async function crearPedido(db, { producto, usuario = null, cantidad = 1 }) {
  const {
    rows: [{ pedido }]
  } = await db.query(
    'SELECT create_order($1, $2, $3, $4, $5, $6::jsonb, $7::uuid) AS pedido',
    [
      'María López',
      'maria@ejemplo.com',
      '+504 9999-0000',
      'San Pedro Sula, Bosques de Jucutuma 1',
      'efectivo',
      JSON.stringify([{ id: producto, qty: cantidad }]),
      usuario
    ]
  );
  return pedido;
}
