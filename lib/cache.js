/**
 * Caché en memoria con vencimiento, para el servidor.
 *
 * Qué resuelve: el catálogo y las categorías se piden en cada visita y casi
 * siempre devuelven exactamente lo mismo. Sin caché, cada visita es una
 * consulta a Supabase que se paga en latencia y en cuota.
 *
 * Qué NO resuelve: esto vive en la memoria del proceso, y en Vercel cada
 * función corre en su propia instancia que además se apaga cuando no se usa.
 * Dos usuarios pueden caer en instancias distintas y cada una tendrá su
 * propia copia. Sirve para absorber ráfagas —una persona navegando, varias a
 * la vez sobre la misma instancia—, no como caché compartida. Para eso está
 * el CDN, que se controla con las cabeceras Cache-Control.
 *
 * La corrección no depende de esto: toda entrada tiene vencimiento, y quien
 * escribe invalida su clave explícitamente.
 */

const entradas = new Map();

// Peticiones que ya están consultando la base. Sin esto, diez visitas
// simultáneas con la caché recién vencida lanzan diez consultas idénticas:
// justo en el momento de más carga es cuando más se castiga a la base.
const enVuelo = new Map();

export async function conCache(clave, ttlMs, producir) {
  const entrada = entradas.get(clave);
  if (entrada && Date.now() < entrada.vence) return entrada.valor;

  const pendiente = enVuelo.get(clave);
  if (pendiente) return pendiente;

  const promesa = (async () => {
    try {
      const valor = await producir();
      entradas.set(clave, { valor, vence: Date.now() + ttlMs });
      return valor;
    } catch (error) {
      // Si hay una copia vencida, servirla es mejor que fallar: un catálogo
      // de hace un minuto no le hace daño a nadie, y la alternativa es una
      // pantalla de error porque la base parpadeó.
      if (entrada) return entrada.valor;
      throw error;
    } finally {
      enVuelo.delete(clave);
    }
  })();

  enVuelo.set(clave, promesa);
  return promesa;
}

/**
 * Borra una clave. La llaman las rutas que escriben: quien cambia el dato
 * es el único que sabe con certeza que la copia quedó vieja, y esperar al
 * vencimiento significaría mostrar el catálogo anterior en el intervalo.
 */
export function invalidar(clave) {
  entradas.delete(clave);
  enVuelo.delete(clave);
}

export function limpiarCache() {
  entradas.clear();
  enVuelo.clear();
}

/** Solo para pruebas y diagnóstico. */
export function tamanoCache() {
  return entradas.size;
}

// Claves con nombre, para que no se escriban a mano en cada ruta y una
// invalidación no falle por una letra distinta.
export const CLAVE_PRODUCTOS = 'productos';
export const CLAVE_CATEGORIAS = 'categorias';
