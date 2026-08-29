import { getSupabaseAdmin } from '@/lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('services')
      .select('id, name, description, duration_minutes, price, category')
      .eq('active', true)
      .order('category', { ascending: true })
      .order('duration_minutes', { ascending: true });

    if (error) throw error;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al obtener servicios:', error);
    return res.status(500).json({ error: 'Error al obtener los servicios' });
  }
}
