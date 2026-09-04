import { createHash } from 'node:crypto';

/**
 * Responde JSON con ETag y soporte de 304.
 *
 * El ETag es una huella del contenido. El navegador la guarda y la manda de
 * vuelta en If-None-Match; si no cambió nada, se contesta 304 sin cuerpo.
 *
 * Esto es útil incluso donde la caché está prohibida. El catálogo no se
 * puede servir de una copia guardada —el stock cambia con cada pedido—,
 * pero sí se puede evitar reenviar dieciséis productos idénticos: la
 * consulta a la base se hace igual, y lo que se ahorra es el cuerpo de la
 * respuesta. Correcto y más barato a la vez.
 */

/** Huella del contenido. Débil (W/) porque compara el JSON, no los bytes. */
export function calcularETag(datos) {
  const huella = createHash('sha1').update(JSON.stringify(datos)).digest('base64url');
  return `W/"${huella}"`;
}

/**
 * If-None-Match puede traer varias etiquetas separadas por coma, y el
 * comodín `*`, que significa "cualquier representación que exista".
 */
export function coincideETag(cabecera, etag) {
  if (!cabecera) return false;

  const recibidas = cabecera.split(',').map((valor) => valor.trim());
  if (recibidas.includes('*')) return true;

  // La comparación débil ignora el prefijo W/, que es lo que corresponde
  // para un GET condicional.
  const sinPeso = (valor) => valor.replace(/^W\//, '');
  return recibidas.some((recibida) => sinPeso(recibida) === sinPeso(etag));
}

/**
 * @param {string} cacheControl  Qué se le permite al navegador y al CDN.
 * @returns {boolean} true si se respondió 304 y no hace falta enviar cuerpo.
 */
export function responderJSON(req, res, datos, cacheControl) {
  const etag = calcularETag(datos);

  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('ETag', etag);

  if (coincideETag(req.headers?.['if-none-match'], etag)) {
    // 304 no lleva cuerpo: es toda la gracia.
    res.status(304).end();
    return true;
  }

  res.status(200).json(datos);
  return false;
}

// ===== Políticas de caché del proyecto =====

/**
 * El stock cambia con cada pedido. Nadie puede servir una copia sin
 * preguntar: `no-cache` obliga a revalidar siempre, y `private` mantiene la
 * respuesta fuera del CDN, que la compartiría entre visitantes distintos.
 * El ETag hace que esa revalidación cueste 304 y no el catálogo entero.
 */
export const CACHE_CATALOGO = 'private, no-cache, must-revalidate';

/**
 * Una categoría cambia una vez cada varios meses. El CDN la puede servir
 * cinco minutos, y durante otros diez puede entregar la copia vieja
 * mientras busca la nueva por detrás, así ni la primera visita después de
 * un cambio paga la espera.
 */
export const CACHE_CATEGORIAS = 'public, s-maxage=300, stale-while-revalidate=600';

/** Nada que tenga que ver con el panel se guarda en ningún lado. */
export const SIN_CACHE = 'no-store, max-age=0';
