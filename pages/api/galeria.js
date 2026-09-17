import { getSupabaseAdmin } from '@/lib/supabase';
import { reportarError } from '@/lib/errores';
import { conCache, CLAVE_GALERIA } from '@/lib/cache';
import { conReintento } from '@/lib/reintento';
import { responderJSON, CACHE_GALERIA } from '@/lib/respuesta-cacheable';

/**
 * Las fotos de trabajos que se muestran en la portada.
 *
 * Treinta segundos de copia en memoria, y no cinco minutos: cada función de
 * Vercel corre en su propia instancia con su propia copia, así que invalidar
 * desde el panel solo limpia la del panel. La ventana corta es lo que hace que
 * las demás se pongan al día solas. Alcanza para absorber una ráfaga de
 * visitas y es lo bastante corta como para que la dueña vea su foto nueva
 * enseguida, que es lo que importa acá.
 */

const TTL_MS = 30 * 1000;

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

    return responderJSON(req, res, fotos, CACHE_GALERIA);
  } catch (error) {
    console.error('Error al obtener la galería:', error);
    await reportarError(error, { ruta: '/api/galeria', metodo: req.method });
    return res.status(500).json({ error: 'Error al obtener la galería' });
  }
}
