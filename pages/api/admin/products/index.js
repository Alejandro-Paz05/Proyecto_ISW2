import { getSupabaseAdmin } from '@/lib/supabase';
import { soloAdmin } from '@/lib/admin-auth';
import { validarProducto } from '@/lib/validar-producto';
import { invalidar, CLAVE_PRODUCTOS } from '@/lib/cache';
import { SIN_CACHE } from '@/lib/respuesta-cacheable';

const COLUMNAS = 'id, name, category, price, description, image, stock, created_at';

async function handler(req, res) {
  if (req.method === 'GET') return listar(req, res);
  if (req.method === 'POST') return crear(req, res);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Método no permitido' });
}

async function listar(req, res) {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('products')
      .select(COLUMNAS)
      .order('id', { ascending: true });

    if (error) throw error;

    // El panel nunca se cachea, ni acá ni en el CDN: muestra el estado real
    // del negocio y quien lo mira está por tomar decisiones con eso.
    res.setHeader('Cache-Control', SIN_CACHE);
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al listar productos:', error);
    return res.status(500).json({ error: 'Error al obtener los productos' });
  }
}

async function crear(req, res) {
  const { datos, error: errorValidacion } = validarProducto(req.body);
  if (errorValidacion) return res.status(400).json({ error: errorValidacion });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('products')
      .insert(datos)
      .select(COLUMNAS)
      .single();

    if (error) throw error;

    invalidar(CLAVE_PRODUCTOS);

    return res.status(201).json(data);
  } catch (error) {
    // 23503: la clave foránea contra `categories` rechazó la categoría.
    // Solo puede pasar si el espejo de lib/categorias.js quedó desfasado de
    // la tabla, porque validarProducto ya filtró contra el espejo. Decirlo
    // así ahorra media hora de buscar un 500 sin explicación.
    if (error?.code === '23503') {
      return res.status(400).json({ error: 'Esa categoría no existe en la base de datos.' });
    }

    console.error('Error al crear el producto:', error);
    return res.status(500).json({ error: 'Error al crear el producto' });
  }
}

export default soloAdmin(handler);
