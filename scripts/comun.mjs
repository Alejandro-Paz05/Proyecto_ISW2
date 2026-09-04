/**
 * Lo que comparten los scripts que hablan con Supabase.
 *
 * Antes cada uno traía su propia copia de leerEnv y armaba las cabeceras a
 * mano. Dos copias de la misma función es donde empiezan a divergir.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

export function leerEnv() {
  const texto = readFileSync(join(RAIZ, '.env.local'), 'utf8');
  const env = {};

  for (const linea of texto.split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;

    const i = limpia.indexOf('=');
    if (i > 0) env[limpia.slice(0, i).trim()] = limpia.slice(i + 1).trim();
  }

  return env;
}

/**
 * Devuelve un cliente mínimo de PostgREST. No se usa @supabase/supabase-js
 * a propósito: estos scripts solo hacen lecturas sueltas y no vale cargar
 * el cliente entero para eso.
 */
export function clienteSupabase(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }

  const base = `${env.SUPABASE_URL}/rest/v1`;
  const cabeceras = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
  };

  return {
    /** Una fila de muestra, para comparar columnas. Null si la tabla no existe. */
    async muestra(tabla) {
      const res = await fetch(`${base}/${tabla}?select=*&limit=1`, { headers: cabeceras });
      if (!res.ok) return null;
      return res.json();
    },

    /** Conteo real de filas. Null si la tabla no existe. */
    async contar(tabla) {
      // PostgREST devuelve el total en Content-Range cuando se le pide
      // count=exact. limit=1 evita traer la tabla entera para contarla.
      const res = await fetch(`${base}/${tabla}?select=*&limit=1`, {
        headers: { ...cabeceras, Prefer: 'count=exact' }
      });
      if (!res.ok) return null;

      const total = res.headers.get('content-range')?.split('/')[1];
      return total && total !== '*' ? Number(total) : 0;
    },

    /** Filas completas de una tabla chica. Array vacío si no existe. */
    async filas(tabla, consulta = '') {
      const res = await fetch(`${base}/${tabla}?select=*${consulta}`, { headers: cabeceras });
      if (!res.ok) return null;
      return res.json();
    }
  };
}
