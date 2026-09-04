import { getSupabaseAdmin } from '@/lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('categories')
      .select('key, label')
      .order('position', { ascending: true });

    if (error) throw error;

    // A diferencia del stock, una categoría cambia una vez cada varios meses.
    // Cachearla en el CDN evita una consulta por visita, y el
    // stale-while-revalidate hace que ni siquiera la primera visita después
    // de un cambio pague la espera.
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    return res.status(500).json({ error: 'Error al obtener categorías' });
  }
}
