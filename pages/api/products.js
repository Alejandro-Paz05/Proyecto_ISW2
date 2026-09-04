import { getSupabaseAdmin } from '@/lib/supabase';
import { conCache, CLAVE_PRODUCTOS } from '@/lib/cache';
import { responderJSON, CACHE_CATALOGO } from '@/lib/respuesta-cacheable';

// Diez segundos. Corto a propósito: lo único que puede cambiar el catálogo
// es un pedido o una edición desde el panel, y las dos cosas invalidan la
// clave al instante. La ventana existe solo para absorber ráfagas de
// visitas simultáneas sobre la misma instancia.
const TTL_MS = 10_000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const productos = await conCache(CLAVE_PRODUCTOS, TTL_MS, async () => {
      const { data, error } = await getSupabaseAdmin()
        .from('products')
        .select('id, name, category, price, description, image, stock')
        .order('id', { ascending: true });

      if (error) throw error;
      return data;
    });

    return responderJSON(req, res, productos, CACHE_CATALOGO);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    return res.status(500).json({ error: 'Error al obtener productos' });
  }
}
