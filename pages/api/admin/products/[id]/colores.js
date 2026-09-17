import { getSupabaseAdmin } from '@/lib/supabase';
import { reportarError } from '@/lib/errores';
import { conRol, PANEL_TIENDA } from '@/lib/sesion';
import { validarColores } from '@/lib/validar-colores';
import { invalidar, CLAVE_PRODUCTOS } from '@/lib/cache';

/**
 * Los colores de un producto, de una sola vez.
 *
 * Es un PUT que reemplaza la lista entera y no un alta/baja por color, porque
 * así es como se edita de verdad: la dueña abre el producto, agrega uno, le
 * corrige el stock a otro, borra el que ya no trae, y guarda. Con rutas por
 * color, esa pantalla tendría que mandar tres peticiones distintas y decidir
 * qué hacer si la segunda falla.
 *
 * Los colores que ya existían conservan su id. Es lo que permite que una venta
 * vieja siga apuntando a su color en vez de quedar huérfana, y que el stock no
 * se reinicie cada vez que se toca cualquier otra cosa.
 */

async function reemplazar(req, res) {
  const productId = Number(req.query.id);

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Producto no válido.' });
  }

  const { colores, error: errorValidacion } = validarColores(req.body?.colores);
  if (errorValidacion) return res.status(400).json({ error: errorValidacion });

  const db = getSupabaseAdmin();

  try {
    const { data: existentes, error: errorLeer } = await db
      .from('product_colors')
      .select('id')
      .eq('product_id', productId);

    if (errorLeer) throw errorLeer;

    const quedan = new Set(colores.map((color) => color.id).filter(Boolean));
    const aBorrar = (existentes ?? []).map((fila) => fila.id).filter((id) => !quedan.has(id));

    // Primero el borrado: si un color se quitó y otro se agregó con el mismo
    // nombre, hacerlo al revés chocaría contra el índice único.
    if (aBorrar.length > 0) {
      const { error } = await db.from('product_colors').delete().in('id', aBorrar);
      if (error) throw error;
    }

    // Los que ya existían y los nuevos van por separado, y no en un upsert
    // único: PostgREST exige que todos los objetos de una misma operación
    // tengan exactamente las mismas claves, y mezclar filas con id y sin id la
    // rechaza entera. Pasa apenas se agrega un color a un producto que ya
    // tiene otros, que es el caso normal.
    const conFila = colores
      .filter((color) => color.id)
      .map((color) => ({ ...color, product_id: productId }));
    const nuevos = colores
      .filter((color) => !color.id)
      .map((color) => ({ ...color, product_id: productId }));

    if (conFila.length > 0) {
      const { error } = await db.from('product_colors').upsert(conFila);
      if (error) throw error;
    }

    if (nuevos.length > 0) {
      const { error } = await db.from('product_colors').insert(nuevos);
      if (error) throw error;
    }

    // El stock del producto lo recalculó el trigger de la base, así que la
    // copia en memoria del catálogo quedó vieja en este mismo instante.
    invalidar(CLAVE_PRODUCTOS);

    const { data, error } = await db
      .from('product_colors')
      .select('id, nombre, hex, stock, position')
      .eq('product_id', productId)
      .order('position', { ascending: true });

    if (error) throw error;

    return res.status(200).json(data);
  } catch (error) {
    // 23503: el producto no existe. Es lo que pasa si alguien guarda en una
    // pestaña vieja un producto que ya se borró en otra.
    if (error?.code === '23503') {
      return res.status(404).json({ error: 'Ese producto ya no existe.' });
    }

    console.error('Error al guardar los colores:', error);
    await reportarError(error, { ruta: '/api/admin/products/[id]/colores', metodo: req.method });
    return res.status(500).json({ error: 'No se pudieron guardar los colores.' });
  }
}

async function handler(req, res) {
  if (req.method === 'PUT') return reemplazar(req, res);

  res.setHeader('Allow', 'PUT');
  return res.status(405).json({ error: 'Método no permitido' });
}

export default conRol(PANEL_TIENDA, handler);
