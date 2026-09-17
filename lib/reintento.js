/**
 * Un reintento para las lecturas que dependen de un servicio ajeno.
 *
 * El 2026-09-16 el sistema de tickets capturó esto solo, en producción:
 *
 *   Error: JWT issued at future — GET /api/categories
 *
 * No es un error del proyecto. Lo devuelve la infraestructura de Supabase
 * cuando sus servicios internos quedan desfasados por milisegundos: el token
 * que uno le firma al otro parece emitido en el futuro y se rechaza. Dura lo
 * que tarda en acomodarse el reloj.
 *
 * La caché ya sirve una copia vencida cuando la base falla, pero solo si la
 * tiene: la petición que lo encontró cayó en una instancia recién arrancada,
 * sin nada guardado, y el hipo llegó hasta la clienta como un 500.
 *
 * SOLO PARA LECTURAS. Una escritura reintentada puede registrar dos veces lo
 * mismo: si `create_order` responde con un error de red después de haber
 * insertado el pedido, el reintento crearía un segundo pedido y descontaría el
 * inventario dos veces. Ahí el error tiene que subir.
 */

// Corto a propósito: esto ocurre dentro de una petición que alguien está
// esperando. Es para un parpadeo, no para una caída.
const ESPERA_MS = 150;

const dormir = (ms) => new Promise((listo) => setTimeout(listo, ms));

/**
 * Ejecuta la lectura y, si falla, la repite una vez.
 *
 * @param {() => Promise<any>} leer la consulta, sin efectos secundarios
 * @param {{ intentos?: number, esperaMs?: number }} opciones
 */
export async function conReintento(leer, { intentos = 2, esperaMs = ESPERA_MS } = {}) {
  let ultimoError;

  for (let intento = 1; intento <= intentos; intento += 1) {
    try {
      return await leer();
    } catch (error) {
      ultimoError = error;

      // El último intento no espera: nadie lo va a usar.
      if (intento < intentos) await dormir(esperaMs);
    }
  }

  throw ultimoError;
}
