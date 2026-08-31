/**
 * Genera los iconos PNG de la aplicación.
 *
 * Se dibujan por código en vez de guardar imágenes binarias en el
 * repositorio: así el logo queda definido en un solo lugar, se puede
 * regenerar en cualquier tamaño, y un cambio de color es una línea y no un
 * archivo opaco de 40 KB.
 *
 *   node scripts/generar-iconos.mjs
 *
 * Escribe en public/: icon-192.png, icon-512.png, apple-touch-icon.png,
 * favicon.png y og-image.png.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLICO = join(RAIZ, 'public');

const NEGRO = [13, 13, 13];
const DORADO = [212, 175, 55];

// ===== Codificación PNG =====

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[i] = c >>> 0;
  }
  return tabla;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = TABLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** pixeles: Buffer RGBA de ancho * alto * 4 */
function codificarPng(ancho, alto, pixeles) {
  const firma = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compresión estándar
  ihdr[11] = 0; // filtrado estándar
  ihdr[12] = 0; // sin entrelazado

  // Cada línea lleva delante su byte de filtro; 0 = sin filtrar.
  const conFiltro = Buffer.alloc(alto * (1 + ancho * 4));
  for (let y = 0; y < alto; y++) {
    const origen = y * ancho * 4;
    const destino = y * (1 + ancho * 4);
    conFiltro[destino] = 0;
    pixeles.copy(conFiltro, destino + 1, origen, origen + ancho * 4);
  }

  return Buffer.concat([
    firma,
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(conFiltro, { level: 9 })),
    trozo('IEND', Buffer.alloc(0))
  ]);
}

// ===== Dibujo =====

/**
 * Estrella de cuatro puntas, la misma forma del logo (✦).
 *
 * Es un astroide: |x|^(2/3) + |y|^(2/3) <= r^(2/3). Los lados cóncavos son
 * los que le dan las puntas afiladas.
 */
function dentroDeLaEstrella(dx, dy, radio) {
  const n = 0.5;
  return Math.pow(Math.abs(dx) / radio, n) + Math.pow(Math.abs(dy) / radio, n) <= 1;
}

function dibujarIcono(lado, { fondo = NEGRO, figura = DORADO, proporcion = 0.34 } = {}) {
  const pixeles = Buffer.alloc(lado * lado * 4);
  const centro = (lado - 1) / 2;
  const radio = lado * proporcion;
  // Se muestrea cada píxel en cuatro puntos para suavizar el borde: sin esto
  // las puntas de la estrella quedan dentadas.
  const muestras = [0.25, 0.75];

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let dentro = 0;
      for (const sy of muestras) {
        for (const sx of muestras) {
          if (dentroDeLaEstrella(x + sx - centro, y + sy - centro, radio)) dentro++;
        }
      }

      const mezcla = dentro / (muestras.length * muestras.length);
      const i = (y * lado + x) * 4;
      for (let canal = 0; canal < 3; canal++) {
        pixeles[i + canal] = Math.round(fondo[canal] + (figura[canal] - fondo[canal]) * mezcla);
      }
      pixeles[i + 3] = 255;
    }
  }

  return codificarPng(lado, lado, pixeles);
}

/** Imagen para compartir en redes: 1200x630, con la estrella centrada. */
function dibujarPortada() {
  const ancho = 1200;
  const alto = 630;
  const pixeles = Buffer.alloc(ancho * alto * 4);
  const cx = (ancho - 1) / 2;
  const cy = (alto - 1) / 2;
  const radio = alto * 0.26;

  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const dentro = dentroDeLaEstrella(x - cx, y - cy, radio) ? 1 : 0;
      const i = (y * ancho + x) * 4;
      for (let canal = 0; canal < 3; canal++) {
        pixeles[i + canal] = dentro ? DORADO[canal] : NEGRO[canal];
      }
      pixeles[i + 3] = 255;
    }
  }

  return codificarPng(ancho, alto, pixeles);
}

// ===== Salida =====

mkdirSync(PUBLICO, { recursive: true });

const archivos = [
  ['icon-192.png', dibujarIcono(192)],
  ['icon-512.png', dibujarIcono(512)],
  // El icono de iOS no admite transparencia y se recorta: la estrella va
  // algo más chica para que no quede pegada al borde redondeado.
  ['apple-touch-icon.png', dibujarIcono(180, { proporcion: 0.3 })],
  ['favicon.png', dibujarIcono(32, { proporcion: 0.38 })],
  ['og-image.png', dibujarPortada()]
];

for (const [nombre, contenido] of archivos) {
  writeFileSync(join(PUBLICO, nombre), contenido);
  console.log(`  ${nombre.padEnd(22)} ${(contenido.length / 1024).toFixed(1)} KB`);
}

console.log(`\n${archivos.length} iconos generados en public/`);
