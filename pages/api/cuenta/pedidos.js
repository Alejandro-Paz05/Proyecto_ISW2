import { getSupabaseAdmin } from '@/lib/supabase';
import { cuentaDeSesion } from '@/lib/sesion';
import { reportarError } from '@/lib/errores';
import { SIN_CACHE } from '@/lib/respuesta-cacheable';

/**
 * Los pedidos de quien está mirando.
 *
 * No usa conRol: acá no importa el rol sino de quién es la cuenta. Y se
 * exige una cuenta de Supabase, no cualquier sesión: la contraseña compartida
 * del panel no identifica a una persona, y como los pedidos de invitada
 * tienen la cuenta vacía, dejarla pasar le entregaría los pedidos de todas.
 */

const COLUMNAS =
  'id, order_number, total, status, payment_method, created_at, ' +
  'order_items (product_name, quantity, price), ' +
  'order_status_history (status, changed_at)';

const MAXIMO = 50;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const cuenta = await cuentaDeSesion(req, res).catch(() => null);
  if (!cuenta) {
    return res.status(401).json({ error: 'Iniciá sesión para ver tus pedidos.' });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('orders')
      .select(COLUMNAS)
      .eq('user_id', cuenta.id)
      .order('created_at', { ascending: false })
      .limit(MAXIMO);

    if (error) throw error;

    res.setHeader('Cache-Control', SIN_CACHE);
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al listar los pedidos de la cuenta:', error);
    await reportarError(error, { ruta: '/api/cuenta/pedidos', metodo: req.method });
    return res.status(500).json({ error: 'Error al obtener tus pedidos' });
  }
}
