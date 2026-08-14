import { supabase } from '@/lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al obtener productos:', error.message);
    return res.status(500).json({ error: 'Error al obtener productos' });
  }
}
