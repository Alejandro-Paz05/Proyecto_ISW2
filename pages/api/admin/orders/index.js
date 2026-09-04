import { getSupabaseAdmin } from '@/lib/supabase';
import { soloAdmin } from '@/lib/admin-auth';

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // Una sola consulta con los items y la bitácora anidados, aprovechando
    // las claves foráneas de order_items y order_status_history hacia orders.
    // Traerlos por separado serían dos viajes más y el mismo resultado.
    const { data, error } = await getSupabaseAdmin()
      .from('orders')
      .select(
        'id, order_number, customer_name, customer_email, customer_phone, ' +
          'customer_address, payment_method, total, status, created_at, ' +
          'order_items (product_name, quantity, price), ' +
          'order_status_history (status, note, changed_at)'
      )
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al listar pedidos:', error);
    return res.status(500).json({ error: 'Error al obtener los pedidos' });
  }
}

export default soloAdmin(handler);
