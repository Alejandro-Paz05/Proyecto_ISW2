import { getSupabaseAdmin } from '@/lib/supabase';
import { reportarError } from '@/lib/errores';
import { conCache, CLAVE_GALERIA } from '@/lib/cache';
import { conReintento } from '@/lib/reintento';
import { responderJSON, CACHE_CATEGORIAS } from '@/lib/respuesta-cacheable';

/**
 * Las fotos de trabajos que se muestran en la portada.
 *
 * Cambian cuando la dueña sube una, o sea muy de vez en cuando comparado con
 * el stock. Por eso se cachean cinco minutos y se sirven con las mismas
 * cabeceras que las categorías: no hay ninguna decisión de compra que dependa
 * de ver la foto de hace un rato.
 */

const TTL_MS = 5 * 60 * 1000;

// Mientras la migración 011 no se haya corrido, la tabla no existe. La portada
// tiene que seguir abriendo: una galería vacía es que todavía no hay fotos, y
// así se ve igual que cuando de verdad no las hay.
const FALTA_LA_TABLA = new Set(['42P01', 'PGRST205']);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const fotos = await conCache(CLAVE_GALERIA, TTL_MS, () =>
      conReintento(async () => {
        const { data, error } = await getSupabaseAdmin()
          .from('galeria')
          .select('id, imagen, titulo')
          .order('position', { ascending: true });

        if (error) {
          if (FALTA_LA_TABLA.has(error.code)) return [];
          throw error;
        }

        return data;
      })
    );

    return responderJSON(req, res, fotos, CACHE_CATEGORIAS);
  } catch (error) {
    console.error('Error al obtener la galería:', error);
    await reportarError(error, { ruta: '/api/galeria', metodo: req.method });
    return res.status(500).json({ error: 'Error al obtener la galería' });
  }
}
