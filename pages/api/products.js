import { getSupabaseAdmin } from '@/lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('products')
      .select('id, name, category, price, description, image, stock')
      .order('id', { ascending: true });

    if (error) throw error;

    // El stock cambia con cada pedido, así que la respuesta no se cachea.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    return res.status(500).json({ error: 'Error al obtener productos' });
  }
}
