/**
 * Informe del estado de la base, contra producción.
 *
 *   npm run db:estado
 *
 * Es el equivalente en Node de supabase/estado.sql, para no tener que
 * abrir el panel de Supabase. Solo lee.
 *
 * Sale con código 1 si falta alguna migración, así que sirve para cortar
 * un despliegue: el código que espera una tabla que todavía no existe
 * falla en producción, no acá.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, leerEnv, clienteSupabase } from './comun.mjs';

// Las tablas que cada migración deja. Se declara acá y no se deduce del
// SQL: parsear SQL para adivinar qué crea es frágil, y este mapa es corto.
const MIGRACIONES = [
  { version: 0, nombre: 'registro_de_migraciones', tablas: ['schema_migraciones'] },
  { version: 1, nombre: 'catalogo', tablas: ['categories', 'products'] },
  { version: 2, nombre: 'pedidos', tablas: ['orders', 'order_items'] },
  { version: 3, nombre: 'bitacora_de_estados', tablas: ['order_status_history'] },
  { version: 4, nombre: 'catalogo_de_ejemplo', tablas: [], opcional: true }
];

function archivosDeMigracion() {
  try {
    return readdirSync(join(RAIZ, 'supabase', 'migraciones'))
      .filter((n) => n.endsWith('.sql'))
      .sort();
  } catch {
    return [];
  }
}

// Se usa process.exitCode y no process.exit(): cortar el proceso de golpe
// mientras fetch todavía tiene sockets abiertos hace abortar a libuv en
// Windows con un "Assertion failed" que tapa la salida real del script.
async function main() {
  const env = leerEnv();
  const db = clienteSupabase(env);

  // ----- ¿Están todos los archivos que el mapa declara? -----
  const archivos = archivosDeMigracion();
  const declaradas = MIGRACIONES.length;

  console.log(`Archivos en supabase/migraciones/: ${archivos.length}`);
  for (const archivo of archivos) console.log(`  ${archivo}`);

  if (archivos.length !== declaradas) {
    console.log(
      `\n  Aviso: hay ${archivos.length} archivos pero este script conoce ${declaradas}. ` +
        'Actualizá el mapa MIGRACIONES.'
    );
  }

  // ----- ¿Qué dice la base? -----
  console.log('\nEstado en la base:\n');

  const registro = await db.filas('schema_migraciones', '&order=version.asc');

  if (registro === null) {
    console.error('  No existe schema_migraciones.');
    console.error('  Corré supabase/migraciones/000_registro_de_migraciones.sql y volvé a intentar.');
    return 1;
  }

  const aplicadas = new Set(registro.map((f) => f.version));
  let faltan = 0;

  for (const migracion of MIGRACIONES) {
    const estaAplicada = aplicadas.has(migracion.version);

    // Se comprueban las tablas y no solo el registro: alguien pudo borrar
    // una tabla sin tocar la fila que dice que la migración está aplicada.
    const tablas = await Promise.all(
      migracion.tablas.map(async (tabla) => ({ tabla, filas: await db.contar(tabla) }))
    );
    const ausentes = tablas.filter((t) => t.filas === null).map((t) => t.tabla);

    let marca;
    if (estaAplicada && ausentes.length === 0) marca = 'OK   ';
    else if (migracion.opcional && !estaAplicada) marca = '--   ';
    else {
      marca = 'FALTA';
      faltan += 1;
    }

    const detalle = tablas.length
      ? tablas.map((t) => `${t.tabla}=${t.filas ?? 'no existe'}`).join(', ')
      : 'sin tablas propias';

    console.log(
      `  ${marca} ${String(migracion.version).padStart(3, '0')} ` +
        `${migracion.nombre.padEnd(24)} ${detalle}`
    );

    if (estaAplicada && ausentes.length > 0) {
      console.log(`         registrada como aplicada, pero faltan: ${ausentes.join(', ')}`);
    }
  }

  if (faltan > 0) {
    console.error(`\n${faltan} migración(es) sin aplicar. Corrélas en orden desde el SQL Editor.`);
    return 1;
  }

  console.log('\nLa base está al día.');
  return 0;
}

process.exitCode = await main();
