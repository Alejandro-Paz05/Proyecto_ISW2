import { reportarError } from '@/lib/errores';
import { permitir, ipDe } from '@/lib/limite';

/**
 * Recibe los errores que captura el navegador y los convierte en tickets.
 *
 * Cualquiera puede llamarla, con o sin sesión, así que desconfía de todo lo
 * que llega: limita cuántos reportes acepta por visitante, recorta cada campo
 * y descarta el ruido conocido antes de tocar la base.
 *
 * Responde 204 tanto si registró el error como si lo descartó por ruido: a
 * quien la llama no le sirve saber la diferencia, y a un abuso tampoco.
 */

const TIPOS = new Set(['error', 'promesa', 'render']);

const RUIDO = [
  // Así tapa el navegador los errores de scripts de otro dominio: no dice qué
  // falló ni dónde, así que no hay nada que corregir.
  /^Script error\.?$/i,
  // Aviso del navegador sin consecuencias visibles, famoso por su volumen.
  /ResizeObserver loop/i
];

// Errores de las extensiones que tenga instaladas la visitante, no de la tienda.
const DE_EXTENSIONES = /(chrome|moz|safari(-web)?)-extension:\/\//i;

const LIMITE = { maximo: 10, ventanaMs: 60 * 1000 };

function recortar(valor, maximo) {
  return typeof valor === 'string' ? valor.slice(0, maximo) : null;
}

function leerCuerpo(cuerpo) {
  // sendBeacon manda texto plano, así que el cuerpo puede llegar sin parsear.
  if (typeof cuerpo !== 'string') return cuerpo;
  try {
    return JSON.parse(cuerpo);
  } catch {
    return null;
  }
}

function validar(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object') return null;

  const mensaje = recortar(cuerpo.mensaje, 500)?.trim();
  if (!mensaje || !TIPOS.has(cuerpo.tipo)) return null;

  const ruta = recortar(cuerpo.ruta, 300);

  return {
    tipo: cuerpo.tipo,
    mensaje,
    nombre: recortar(cuerpo.nombre, 100)?.trim() || 'Error',
    pila: recortar(cuerpo.pila, 4000) ?? '',
    // Sin query ni ancla: ahí pueden viajar un correo o un ?volver=.
    ruta: ruta?.startsWith('/') ? ruta.split(/[?#]/)[0] : null
  };
}

function esRuido({ mensaje, pila }) {
  return RUIDO.some((patron) => patron.test(mensaje)) || DE_EXTENSIONES.test(pila);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // El límite va antes de validar: un bucle que manda basura también tiene
  // que frenarse.
  if (!permitir(`errores:${ipDe(req)}`, LIMITE)) {
    return res.status(429).json({ error: 'Demasiados reportes seguidos.' });
  }

  const reporte = validar(leerCuerpo(req.body));
  if (!reporte) return res.status(400).json({ error: 'Reporte no válido.' });

  if (!esRuido(reporte)) {
    const error = new Error(reporte.mensaje);
    error.name = reporte.nombre;
    // La pila es la del navegador. Sin esto quedaría la de esta línea del
    // servidor, y todos los errores del navegador compartirían huella.
    error.stack = reporte.pila;

    await reportarError(error, {
      origen: 'navegador',
      tipo: reporte.tipo,
      ruta: reporte.ruta,
      navegador: String(req.headers?.['user-agent'] ?? '').slice(0, 200)
    });
  }

  return res.status(204).end();
}
