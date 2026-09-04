import { getSupabaseAdmin } from '@/lib/supabase';
import { soloAdmin } from '@/lib/admin-auth';

// Debe coincidir con el CHECK de orders.status en
// supabase/migraciones/002_pedidos.sql.
export const ESTADOS = ['pendiente', 'confirmado', 'enviado', 'entregado', 'cancelado'];

async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Pedido no válido.' });
  }

  const { status } = req.body ?? {};
  if (!ESTADOS.includes(status)) {
    return res.status(400).json({ error: 'Estado no válido.' });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select('id, order_number, status')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'El pedido no existe.' });

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al actualizar el pedido:', error);
    return res.status(500).json({ error: 'Error al actualizar el pedido' });
  }
}

export default soloAdmin(handler);
