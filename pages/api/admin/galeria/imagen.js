import { conRol, PANEL_TIENDA } from '@/lib/sesion';
import { guardarImagenDe } from '@/lib/subir-imagen';

/**
 * Sube una foto de trabajo a la galería.
 *
 * Mismo cuidado que las de producto —tipo por los bytes, tope de peso, nombre
 * al azar— y otro bucket: son cosas distintas y conviene poder borrar una sin
 * mirar dos veces qué más hay adentro.
 */

export const config = { api: { bodyParser: false } };

async function handler(req, res) {
  if (req.method === 'POST') {
    return guardarImagenDe(req, res, { bucket: 'galeria', ruta: '/api/admin/galeria/imagen' });
  }

  res.setHeader('Allow', 'POST');
  return res.status(405).json({ error: 'Método no permitido' });
}

export default conRol(PANEL_TIENDA, handler);
