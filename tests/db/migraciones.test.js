// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { crearBase, aplicarMigraciones, MIGRACIONES } from '../helpers/base-de-datos.js';

/**
 * El README de supabase/ promete que las migraciones se pueden volver a
 * correr sobre una base al día sin cambiar nada. Hasta acá era una promesa:
 * esto la comprueba corriéndolas dos veces sobre un Postgres real.
 */

// Todo lo que una migración puede dejar distinto: tablas y filas, políticas,
// funciones con su firma, triggers y privilegios de columna.
async function fotografia(db) {
  const consultas = {
    tablas: `
      SELECT c.relname AS nombre, c.relrowsecurity AS rls
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY 1`,
    politicas: `
      SELECT tablename, policyname, cmd, roles::text, qual, with_check
        FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2`,
    funciones: `
      SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' ORDER BY 1, 2`,
    triggers: `
      SELECT c.relname, t.tgname
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       WHERE NOT t.tgisinternal ORDER BY 1, 2`,
    privilegios_de_columna: `
      SELECT table_name, column_name, grantee, privilege_type
        FROM information_schema.column_privileges
       WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
       ORDER BY 1, 2, 3, 4`
  };

  const resultado = {};
  for (const [clave, sql] of Object.entries(consultas)) {
    resultado[clave] = (await db.query(sql)).rows;
  }

  // Conteo exacto por tabla: si una migración duplica filas al repetirse,
  // acá se nota.
  resultado.filas = {};
  for (const { nombre } of resultado.tablas) {
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM ${nombre}`);
    resultado.filas[nombre] = rows[0].n;
  }

  return resultado;
}

let db;

beforeAll(async () => {
  db = await crearBase();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('migraciones', () => {
  it('se aplican todas, en orden, sobre una base vacía', async () => {
    const { rows } = await db.query('SELECT version FROM schema_migraciones ORDER BY version');

    expect(rows.map((fila) => fila.version)).toEqual(MIGRACIONES.map((_, i) => i));
  });

  it('volver a correrlas no da error ni cambia nada', async () => {
    const antes = await fotografia(db);

    await aplicarMigraciones(db);

    expect(await fotografia(db)).toEqual(antes);
  });

  it('dejan RLS activo en todas las tablas', async () => {
    const { tablas } = await fotografia(db);

    expect(tablas.filter((tabla) => !tabla.rls)).toEqual([]);
  });
});
