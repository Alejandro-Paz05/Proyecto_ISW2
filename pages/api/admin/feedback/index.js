import { getSupabaseAdmin } from '@/lib/supabase';
import { conRol, PANEL_TIENDA } from '@/lib/sesion';
import { reportarError } from '@/lib/errores';
import { SIN_CACHE } from '@/lib/respuesta-cacheable';

/**
 * La retroalimentación que dejaron las clientas.
 *
 * La ve la dueña, además del admin y de quien revisa: es lo que dice la
 * clienta sobre su tienda, no trabajo técnico.
 */

const COLUMNAS = 'id, kind, message, contact_email, page, status, ticket_id, created_at';
const MAXIMO = 200;
const ESTADOS = ['nueva', 'leida', 'archivada'];

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const filtro = typeof req.query.estado === 'string' ? req.query.estado : 'todos';

  if (filtro !== 'todos' && !ESTADOS.includes(filtro)) {
    return res.status(400).json({ error: 'Ese estado no existe.' });
  }

  try {
    let consulta = getSupabaseAdmin()
      .from('feedback')
      .select(COLUMNAS)
      .order('created_at', { ascending: false })
      .limit(MAXIMO);

    if (filtro !== 'todos') consulta = consulta.eq('status', filtro);

    const { data, error } = await consulta;
    if (error) throw error;

    res.setHeader('Cache-Control', SIN_CACHE);
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al listar la retroalimentación:', error);
    await reportarError(error, { ruta: '/api/admin/feedback', metodo: req.method });
    return res.status(500).json({ error: 'Error al obtener la retroalimentación' });
  }
}

export default conRol(PANEL_TIENDA, handler);
