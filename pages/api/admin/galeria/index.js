import { getSupabaseAdmin } from '@/lib/supabase';
import { reportarError } from '@/lib/errores';
import { conRol, PANEL_TIENDA } from '@/lib/sesion';
import { invalidar, CLAVE_GALERIA } from '@/lib/cache';
import { SIN_CACHE } from '@/lib/respuesta-cacheable';

/**
 * La galería vista y editada desde el panel.
 *
 * El PUT reemplaza la lista entera, como los colores de un producto y por el
 * mismo motivo: así es como se edita de verdad. Se sube una foto, se reordena
 * otra, se borra la del mes pasado, y recién ahí se guarda. Con rutas por foto
 * esa pantalla tendría que mandar tres peticiones y decidir qué hacer si la
 * segunda falla.
 */

const MAXIMO = 60;
const LARGO_DEL_TITULO = 80;

/** @returns {{ fotos: Array } | { error: string }} */
function validar(crudas) {
  if (!Array.isArray(crudas)) return { error: 'Las fotos tienen que venir en una lista.' };
  if (crudas.length > MAXIMO) return { error: `La galería no puede pasar de ${MAXIMO} fotos.` };

  const fotos = [];

  for (const [i, cruda] of crudas.entries()) {
    const imagen = String(cruda?.imagen ?? '').trim();

    if (!/^https?:\/\//.test(imagen)) {
      return { error: 'Cada foto necesita su dirección. Subila antes de guardar.' };
    }

    const titulo = cruda?.titulo ? String(cruda.titulo).trim() : null;

    if (titulo && titulo.length > LARGO_DEL_TITULO) {
      return { error: `El título "${titulo.slice(0, 20)}..." pasa de ${LARGO_DEL_TITULO} caracteres.` };
    }

    const id = Number(cruda?.id);

    fotos.push({
      ...(Number.isInteger(id) && id > 0 ? { id } : {}),
      imagen,
      titulo,
      position: i
    });
  }

  return { fotos };
}

async function listar(req, res) {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('galeria')
      .select('id, imagen, titulo, position')
      .order('position', { ascending: true });

    if (error) throw error;

    res.setHeader('Cache-Control', SIN_CACHE);
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al listar la galería:', error);
    await reportarError(error, { ruta: '/api/admin/galeria', metodo: req.method });
    return res.status(500).json({ error: 'Error al obtener la galería' });
  }
}

async function reemplazar(req, res) {
  const { fotos, error: errorValidacion } = validar(req.body?.fotos);
  if (errorValidacion) return res.status(400).json({ error: errorValidacion });

  const db = getSupabaseAdmin();

  try {
    const { data: existentes, error: errorLeer } = await db.from('galeria').select('id');
    if (errorLeer) throw errorLeer;

    const quedan = new Set(fotos.map((foto) => foto.id).filter(Boolean));
    const aBorrar = (existentes ?? []).map((fila) => fila.id).filter((id) => !quedan.has(id));

    if (aBorrar.length > 0) {
      const { error } = await db.from('galeria').delete().in('id', aBorrar);
      if (error) throw error;
    }

    // Las que ya existían y las nuevas van por separado, y no en un upsert
    // único, porque PostgREST exige que todos los objetos de una misma
    // operación tengan exactamente las mismas claves: mezclar filas con id y
    // sin id la rechaza entera. Pasa apenas se agrega una foto a una galería
    // que ya tiene otras, que es el caso normal.
    const conocidas = fotos.filter((foto) => foto.id);
    const nuevas = fotos.filter((foto) => !foto.id);

    if (conocidas.length > 0) {
      const { error } = await db.from('galeria').upsert(conocidas);
      if (error) throw error;
    }

    if (nuevas.length > 0) {
      const { error } = await db.from('galeria').insert(nuevas);
      if (error) throw error;
    }

    // La portada sirve una copia de hasta cinco minutos: sin esto, la dueña
    // sube una foto y no la ve hasta que venza.
    invalidar(CLAVE_GALERIA);

    const { data, error } = await db
      .from('galeria')
      .select('id, imagen, titulo, position')
      .order('position', { ascending: true });

    if (error) throw error;

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al guardar la galería:', error);
    await reportarError(error, { ruta: '/api/admin/galeria', metodo: req.method });
    return res.status(500).json({ error: 'No se pudo guardar la galería.' });
  }
}

async function handler(req, res) {
  if (req.method === 'GET') return listar(req, res);
  if (req.method === 'PUT') return reemplazar(req, res);

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Método no permitido' });
}

export default conRol(PANEL_TIENDA, handler);
