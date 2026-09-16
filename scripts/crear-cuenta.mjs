/**
 * Crea una cuenta con rol, o le cambia el rol a una que ya existe.
 *
 *   npm run cuentas:crear -- --correo persona@gmail.com --rol admin --nombre "Nombre"
 *
 * Las cuentas del personal no se pueden crear desde la tienda: toda cuenta
 * que se registra nace clienta (migración 005), y subirle el rol exige la
 * clave secreta. Este script es la forma de dar de alta las primeras.
 *
 * Por defecto la cuenta se crea SIN contraseña: se entra con "Continuar con
 * Google" usando el mismo correo. Supabase une la identidad de Google a la
 * cuenta existente porque el correo ya está confirmado, así que el rol se
 * conserva. La ventaja es que nunca existe una contraseña que haya que
 * mandarle a nadie.
 *
 * Con --mostrar-contrasena se genera una al azar y se muestra UNA sola vez,
 * para quien no tenga Google. En ese caso, correlo en tu propia terminal y no
 * pegues la salida en ningún chat.
 *
 * Idempotente: si la cuenta ya existe, actualiza el rol y el nombre, y NO
 * toca la contraseña.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { leerEnv } from './comun.mjs';

// Deben coincidir con el CHECK de profiles.role en
// supabase/migraciones/005_perfiles_y_roles.sql. No se importan de
// lib/sesion.js porque ese módulo usa los alias de Next, que Node no resuelve.
const ROLES = ['clienta', 'duena', 'admin', 'super_admin'];

// Las partes del dominio no pueden contener otro punto: así cada punto es un
// separador sin ambigüedad y la expresión se evalúa en tiempo lineal. La
// versión obvia, [^@\s]+\.[^@\s]+, retrocede de forma cuadrática ante una
// cadena larga sin punto final.
const CORREO_VALIDO = /^[^@\s]+@[^@\s.]+(?:\.[^@\s.]+)+$/;
const TAMANO_DE_PAGINA = 200;

function leerArgumentos() {
  const { values } = parseArgs({
    options: {
      correo: { type: 'string' },
      rol: { type: 'string' },
      nombre: { type: 'string' },
      'mostrar-contrasena': { type: 'boolean', default: false }
    }
  });

  const correo = values.correo?.trim().toLowerCase();

  if (!correo || !CORREO_VALIDO.test(correo)) {
    throw new Error('Falta --correo, o no es un correo válido.');
  }
  if (!ROLES.includes(values.rol)) {
    throw new Error(`--rol tiene que ser uno de: ${ROLES.join(', ')}.`);
  }

  return {
    correo,
    rol: values.rol,
    nombre: values.nombre?.trim() || null,
    conContrasena: values['mostrar-contrasena']
  };
}

function clienteDeApi(env) {
  // Solo la cabecera apikey. Las claves secretas nuevas no son un JWT, y Auth
  // las rechaza si además van en Authorization.
  const cabeceras = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };

  return async function pedir(ruta, opciones = {}) {
    const res = await fetch(`${env.SUPABASE_URL}${ruta}`, {
      ...opciones,
      headers: { ...cabeceras, ...opciones.headers }
    });

    const texto = await res.text();
    const cuerpo = texto ? JSON.parse(texto) : null;

    if (!res.ok) {
      const detalle = cuerpo?.msg ?? cuerpo?.message ?? texto;
      throw new Error(`${opciones.method ?? 'GET'} ${ruta} respondió ${res.status}: ${detalle}`);
    }

    return cuerpo;
  };
}

// La API de administración no busca por correo, así que se recorren las
// páginas. Con las cuentas de un salón son una o dos.
async function buscarCuenta(pedir, correo) {
  for (let pagina = 1; ; pagina += 1) {
    const { users } = await pedir(
      `/auth/v1/admin/users?page=${pagina}&per_page=${TAMANO_DE_PAGINA}`
    );

    const encontrada = users.find((usuario) => usuario.email?.toLowerCase() === correo);
    if (encontrada) return encontrada;
    if (users.length < TAMANO_DE_PAGINA) return null;
  }
}

async function main() {
  const { correo, rol, nombre, conContrasena } = leerArgumentos();
  const env = leerEnv();

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.');
  }

  const pedir = clienteDeApi(env);
  let cuenta = await buscarCuenta(pedir, correo);
  let contrasena = null;

  if (cuenta) {
    console.log(`La cuenta ${correo} ya existe: se actualiza el rol y no se toca la contraseña.`);
  } else {
    // 18 bytes al azar: 24 caracteres, unos 144 bits. Solo si se pidió.
    if (conContrasena) contrasena = randomBytes(18).toString('base64url');

    cuenta = await pedir('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: correo,
        ...(contrasena ? { password: contrasena } : {}),
        // Confirmada de entrada: la da de alta alguien que ya sabe que el
        // correo es de esa persona. Es además lo que permite que Supabase le
        // una la identidad de Google al entrar.
        email_confirm: true,
        user_metadata: nombre ? { full_name: nombre } : {}
      })
    });

    console.log(`Cuenta creada: ${correo}`);
  }

  // El perfil lo crea el trigger de la migración 005 en la misma transacción
  // que la cuenta, así que ya existe. Si no, la migración no está aplicada.
  const filas = await pedir(`/rest/v1/profiles?id=eq.${cuenta.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(nombre ? { role: rol, full_name: nombre } : { role: rol })
  });

  if (!filas?.length) {
    throw new Error('La cuenta existe pero no tiene perfil. ¿Está aplicada la migración 005?');
  }

  const [perfil] = filas;
  console.log(`Rol: ${perfil.role}${perfil.full_name ? ` · Nombre: ${perfil.full_name}` : ''}`);

  if (contrasena) {
    console.log('\nContraseña (se muestra una sola vez y no queda guardada en ningún lado):');
    console.log(`  ${contrasena}`);
    console.log('\nPasásela a la persona por un canal privado.');
  } else if (!cuenta.last_sign_in_at) {
    console.log(`\nSin contraseña: se entra con "Continuar con Google" usando ${correo}.`);
  }

  return 0;
}

// process.exitCode y no process.exit(): cortar el proceso con fetch todavía
// abierto hace abortar a libuv en Windows (ver estado-db.mjs).
try {
  process.exitCode = await main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
