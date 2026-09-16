import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Convierte errores en tickets.
 *
 * Cada error se reduce a una huella: lo que hace que dos ocurrencias sean el
 * mismo problema. La base agrupa por esa huella (migración 006), así que cien
 * visitas a una página rota suman ocurrencias a un solo ticket en vez de
 * abrir cien.
 *
 * Lo difícil es que el mismo error casi nunca trae el mismo mensaje dos
 * veces: "No existe el pedido 1042" y "No existe el pedido 1043" son el mismo
 * bug. Antes de calcular la huella se saca lo que cambia entre ocurrencias.
 *
 * Solo corre en el servidor. Los errores del navegador llegan por
 * /api/errores y terminan acá.
 */

const LIMITE_DE_ESPERA_MS = 2000;

/** El mensaje sin lo que varía entre ocurrencias del mismo error. */
export function normalizarMensaje(mensaje) {
  return String(mensaje ?? '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/(["'`]).*?\1/g, '<texto>')
    .replace(/\d+(\.\d+)?/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

// El final de una ubicación: "archivo.js:1:2". Anclada y solo con dígitos, así
// que se resuelve de un paso por carácter.
const LINEA_Y_COLUMNA = /:\d+:\d+$/;

/**
 * Un marco de pila de Chrome, Edge y Node: "at funcion (archivo:1:2)", o
 * "at archivo:1:2" cuando la función es anónima. Devuelve [función, ubicación].
 *
 * Se parte con índices y no con una expresión regular: la versión obvia,
 * `at\s+(?:(\S+)\s+\()?(.+?):\d+:\d+`, retrocede de forma super-lineal ante
 * una línea larga que no termina en línea y columna, y una pila trae varias
 * de esas en cada error.
 */
function marcoV8(texto) {
  if (!/^at\s/.test(texto)) return null;

  const resto = texto.slice(2).trim();
  const abre = resto.indexOf(' (');

  if (abre !== -1 && resto.endsWith(')')) return [resto.slice(0, abre), resto.slice(abre + 2, -1)];

  return ['', resto];
}

/** Un marco de pila de Firefox y Safari: "funcion@archivo:1:2". */
function marcoFirefox(texto) {
  const arroba = texto.indexOf('@');
  // Con un espacio antes de la arroba no es un marco: es una frase que
  // menciona una dirección de correo.
  if (arroba === -1 || /\s/.test(texto.slice(0, arroba))) return null;

  return [texto.slice(0, arroba), texto.slice(arroba + 1)];
}

/**
 * La función y el archivo donde saltó el error, sin línea ni columna.
 *
 * Sin línea porque el código del navegador llega minificado en una sola
 * línea, y la columna cambia con cada despliegue. Sin el hash que Next le
 * pone a los archivos (_app-3f9a1c2b.js) por lo mismo: el mismo bug en dos
 * versiones seguidas tiene que caer en el mismo ticket.
 */
export function lugarDelError(pila) {
  for (const linea of String(pila ?? '').split('\n')) {
    const texto = linea.trim();
    const marco = marcoV8(texto) ?? marcoFirefox(texto);
    if (!marco) continue;

    const [funcion, ubicacion] = marco;
    if (!LINEA_Y_COLUMNA.test(ubicacion)) continue;

    const nombreDeArchivo = ubicacion
      .replace(LINEA_Y_COLUMNA, '')
      .split(/[?#]/)[0]
      .split('/')
      .pop()
      .replace(/-[0-9a-f]{8,}(?=\.)/gi, '');

    return `${funcion || '<anónima>'} ${nombreDeArchivo}`;
  }

  return '';
}

/**
 * La huella de un error. Separa el origen: el mismo mensaje en el navegador y
 * en el servidor casi nunca es el mismo bug.
 */
export function huellaDelError({ origen, nombre, mensaje, pila }) {
  const firma = [nombre || 'Error', normalizarMensaje(mensaje), lugarDelError(pila)].join('|');
  return `${origen}:${createHash('sha256').update(firma).digest('hex').slice(0, 16)}`;
}

function sinVacios(objeto) {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, valor]) => valor !== undefined && valor !== null && valor !== '')
  );
}

function conLimiteDeEspera(promesa, ms) {
  let temporizador;
  const vencida = new Promise((_, rechazar) => {
    temporizador = setTimeout(
      () => rechazar(new Error(`registrar_error no respondió en ${ms} ms`)),
      ms
    );
  });
  return Promise.race([promesa, vencida]).finally(() => clearTimeout(temporizador));
}

/**
 * Registra un error como ticket. Devuelve la huella, o null si no se pudo.
 *
 * Nunca lanza: si reportar fallara, rompería justo la respuesta de error que
 * la ruta estaba por mandar. Y espera como mucho dos segundos por la misma
 * razón: con Supabase lento, nadie puede quedarse esperando a que se anote su
 * error.
 *
 * El contexto no lleva nunca el cuerpo ni la query de la petición: ahí viajan
 * nombres, correos y direcciones, y un ticket no es lugar para eso.
 */
export async function reportarError(error, contexto = {}) {
  const { origen = 'servidor', ...resto } = contexto;

  try {
    // Los errores de Supabase son objetos planos, no instancias de Error:
    // traen message pero no name ni stack.
    const nombre = error?.name || 'Error';
    const mensaje = error?.message ?? String(error);
    const pila = typeof error?.stack === 'string' ? error.stack : '';
    const huella = huellaDelError({ origen, nombre, mensaje, pila });

    const { error: fallo } = await conLimiteDeEspera(
      getSupabaseAdmin().rpc('registrar_error', {
        p_fingerprint: huella,
        p_title: `${nombre}: ${mensaje}`.slice(0, 200),
        p_detail: pila.slice(0, 4000) || null,
        p_context: sinVacios({ origen, ...resto, entorno: process.env.NODE_ENV })
      }),
      LIMITE_DE_ESPERA_MS
    );

    if (fallo) throw fallo;
    return huella;
  } catch (fallo) {
    console.error('No se pudo registrar el error como ticket:', fallo?.message ?? fallo);
    return null;
  }
}
