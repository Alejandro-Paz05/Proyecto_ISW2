import { conRol, PANEL_TIENDA } from '@/lib/sesion';
import { guardarImagenDe } from '@/lib/subir-imagen';

/**
 * Guarda la foto de un producto y devuelve su dirección pública.
 *
 * El archivo va a un bucket público de Supabase Storage, en otro dominio que
 * el sitio. Eso no es un detalle: aunque alguien lograra guardar algo que el
 * navegador interprete como documento, se abriría fuera del origen de la
 * tienda, sin acceso a sus cookies.
 */

// Next parsea el cuerpo como JSON si no se le dice lo contrario, y acá el
// cuerpo son bytes.
export const config = { api: { bodyParser: false } };

async function handler(req, res) {
  if (req.method === 'POST') {
    return guardarImagenDe(req, res, {
      bucket: 'productos',
      ruta: '/api/admin/products/imagen'
    });
  }

  res.setHeader('Allow', 'POST');
  return res.status(405).json({ error: 'Método no permitido' });
}

export default conRol(PANEL_TIENDA, handler);
