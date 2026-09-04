import { getSupabaseAdmin } from '@/lib/supabase';
import { conCache, CLAVE_CATEGORIAS } from '@/lib/cache';
import { responderJSON, CACHE_CATEGORIAS } from '@/lib/respuesta-cacheable';

// Cinco minutos. Las categorías se cambian a mano y muy de vez en cuando;
// no hay ninguna ruta de la aplicación que las escriba.
const TTL_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const categorias = await conCache(CLAVE_CATEGORIAS, TTL_MS, async () => {
      const { data, error } = await getSupabaseAdmin()
        .from('categories')
        .select('key, label')
        .order('position', { ascending: true });

      if (error) throw error;
      return data;
    });

    return responderJSON(req, res, categorias, CACHE_CATEGORIAS);
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    return res.status(500).json({ error: 'Error al obtener categorías' });
  }
}
