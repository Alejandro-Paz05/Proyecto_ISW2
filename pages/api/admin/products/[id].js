import { getSupabaseAdmin } from '@/lib/supabase';
import { soloAdmin } from '@/lib/admin-auth';
import { validarProducto } from '@/lib/validar-producto';

const COLUMNAS = 'id, name, category, price, description, image, stock, created_at';

async function handler(req, res) {
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Producto no válido.' });
  }

  if (req.method === 'PATCH') return editar(id, req, res);
  if (req.method === 'DELETE') return eliminar(id, res);

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Método no permitido' });
}

async function editar(id, req, res) {
  const { datos, error: errorValidacion } = validarProducto(req.body, { parcial: true });
  if (errorValidacion) return res.status(400).json({ error: errorValidacion });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('products')
      .update(datos)
      .eq('id', id)
      .select(COLUMNAS)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'El producto no existe.' });

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al editar el producto:', error);
    return res.status(500).json({ error: 'Error al editar el producto' });
  }
}

async function eliminar(id, res) {
  try {
    // El historial de ventas no se ve afectado: order_items guarda su propia
    // copia del nombre y del precio, y su clave foránea es ON DELETE SET NULL.
    const { data, error } = await getSupabaseAdmin()
      .from('products')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'El producto no existe.' });

    return res.status(200).json({ ok: true, id: data.id });
  } catch (error) {
    console.error('Error al eliminar el producto:', error);
    return res.status(500).json({ error: 'Error al eliminar el producto' });
  }
}

export default soloAdmin(handler);
