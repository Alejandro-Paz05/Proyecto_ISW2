import { getSupabaseAdmin } from '@/lib/supabase';
import { reportarError } from '@/lib/errores';
import { conCache, CLAVE_PRODUCTOS } from '@/lib/cache';
import { conReintento } from '@/lib/reintento';
import { responderJSON, CACHE_CATALOGO } from '@/lib/respuesta-cacheable';

// Diez segundos. Corto a propósito: lo único que puede cambiar el catálogo
// es un pedido o una edición desde el panel, y las dos cosas invalidan la
// clave al instante. La ventana existe solo para absorber ráfagas de
// visitas simultáneas sobre la misma instancia.
const TTL_MS = 10_000;

const COLUMNAS = 'id, name, category, price, description, image, stock';

// Los colores viajan con su producto en una sola consulta: pedirlos aparte
// serían dos viajes a la base para pintar una tarjeta.
const COLUMNAS_CON_COLORES = `${COLUMNAS}, colores:product_colors(id, nombre, hex, stock)`;

/**
 * PostgREST responde esto cuando le piden anidar una tabla que no conoce, que
 * es exactamente lo que pasa entre desplegar este código y correr la migración
 * 010 en Supabase.
 */
function faltaLaTablaDeColores(error) {
  return error?.code === 'PGRST200' || error?.code === '42P01';
}

/**
 * El catálogo, con los colores de cada producto si la base ya los tiene.
 *
 * El respaldo sin colores no es paranoia: el 2026-09-17 este código salió a
 * producción antes que su migración y la tienda entera devolvió 500 durante
 * unos minutos. Una tienda caída por una tabla que todavía no existe es un
 * costo desproporcionado frente a mostrar el catálogo sin las muestras de
 * color, que es lo peor que puede pasar acá.
 */
async function traerCatalogo(db) {
  const conColores = await db
    .from('products')
    .select(COLUMNAS_CON_COLORES)
    .order('id', { ascending: true })
    .order('position', { referencedTable: 'product_colors', ascending: true });

  if (!conColores.error) return conColores.data;
  if (!faltaLaTablaDeColores(conColores.error)) throw conColores.error;

  const { data, error } = await db
    .from('products')
    .select(COLUMNAS)
    .order('id', { ascending: true });

  if (error) throw error;
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const productos = await conCache(CLAVE_PRODUCTOS, TTL_MS, () =>
      conReintento(() => traerCatalogo(getSupabaseAdmin()))
    );

    return responderJSON(req, res, productos, CACHE_CATALOGO);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    await reportarError(error, { ruta: '/api/products', metodo: req.method });
    return res.status(500).json({ error: 'Error al obtener productos' });
  }
}
