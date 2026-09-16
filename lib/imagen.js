/**
 * Qué se acepta como foto de un producto.
 *
 * El tipo lo deciden los primeros bytes del archivo, no la cabecera
 * Content-Type ni la extensión del nombre: las dos las escribe quien sube, y
 * un archivo que dice ser image/png y no lo es termina guardado igual.
 *
 * SVG queda afuera a propósito aunque sea una imagen: es un documento XML que
 * puede traer <script> adentro. Una foto de un esmalte no necesita eso.
 * GIF también queda afuera, por otra razón: pesa de más para lo que aporta en
 * un catálogo de productos quietos.
 *
 * Este módulo no importa nada de Node: lo usan la ruta de API y la página del
 * panel, y la página se compila para el navegador.
 */

/** 3 MB. Una foto de celular ronda 1 o 2; más que esto es una imagen sin recortar. */
export const LIMITE_DE_BYTES = 3 * 1024 * 1024;

/** Para el atributo accept del campo de archivo. */
export const TIPOS_ACEPTADOS = 'image/png,image/jpeg,image/webp';

const bytesDe = (texto) => Array.from(texto, (caracter) => caracter.charCodeAt(0));

const RIFF = bytesDe('RIFF');
const WEBP = bytesDe('WEBP');

const FIRMAS = [
  {
    mime: 'image/png',
    extension: 'png',
    reconoce: (datos) => empiezaCon(datos, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  },
  {
    mime: 'image/jpeg',
    extension: 'jpg',
    reconoce: (datos) => empiezaCon(datos, [0xff, 0xd8, 0xff])
  },
  {
    // Un WebP es un contenedor RIFF: "RIFF", cuatro bytes de tamaño, "WEBP".
    mime: 'image/webp',
    extension: 'webp',
    reconoce: (datos) => empiezaCon(datos, RIFF) && empiezaCon(datos, WEBP, 8)
  }
];

function empiezaCon(datos, firma, desde = 0) {
  return firma.every((byte, i) => datos[desde + i] === byte);
}

/**
 * El tipo real del archivo, o null si no es ninguno de los aceptados.
 *
 * @param {Uint8Array} datos
 * @returns {{ mime: string, extension: string } | null}
 */
export function tipoDeImagen(datos) {
  // 12 bytes es lo que hace falta para reconocer un WebP, la firma más larga.
  if (!datos || datos.length < 12) return null;

  const firma = FIRMAS.find((candidata) => candidata.reconoce(datos));

  return firma ? { mime: firma.mime, extension: firma.extension } : null;
}

/** El peso en megabytes con un decimal, para decírselo a quien sube. */
export function enMegabytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
