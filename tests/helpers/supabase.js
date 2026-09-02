import { vi } from 'vitest';

/**
 * Simulacro del cliente de Supabase.
 *
 * Las rutas encadenan llamadas —`.from().select().eq().maybeSingle()`— y
 * terminan de dos formas distintas: esperando la cadena directamente, o
 * llamando a `single`/`maybeSingle`. Este objeto devuelve el mismo resultado
 * por los dos caminos, de modo que sirve para cualquiera de las rutas sin
 * tener que reconstruirlo en cada prueba.
 */
export function crearCadena(resultado) {
  const cadena = {};

  for (const metodo of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'neq',
    'in',
    'lt',
    'gt',
    'order',
    'limit'
  ]) {
    cadena[metodo] = vi.fn(() => cadena);
  }

  cadena.single = vi.fn(async () => resultado);
  cadena.maybeSingle = vi.fn(async () => resultado);
  // Hace la cadena esperable: `await supabase.from(...).select(...)`.
  cadena.then = (resolver, rechazar) => Promise.resolve(resultado).then(resolver, rechazar);

  return cadena;
}
