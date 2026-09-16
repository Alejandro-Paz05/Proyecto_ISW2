import { getSupabaseAdmin } from '@/lib/supabase';
import { conRol, PANEL_TIENDA } from '@/lib/sesion';
import { reportarError } from '@/lib/errores';

/**
 * Marcar un mensaje como leído o archivarlo.
 *
 * El mensaje no se edita ni se borra: es lo que escribió una clienta, y el
 * ticket que abrió un problema lo sigue apuntando.
 */

const COLUMNAS = 'id, kind, status, ticket_id';
const ESTADOS = ['nueva', 'leida', 'archivada'];

async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Mensaje no válido.' });
  }

  const { status } = req.body ?? {};
  if (!ESTADOS.includes(status)) {
    return res.status(400).json({ error: 'Ese estado no existe.' });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('feedback')
      .update({ status })
      .eq('id', id)
      .select(COLUMNAS)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'El mensaje no existe.' });

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al actualizar la retroalimentación:', error);
    await reportarError(error, { ruta: '/api/admin/feedback/[id]', metodo: req.method });
    return res.status(500).json({ error: 'Error al actualizar el mensaje' });
  }
}

export default conRol(PANEL_TIENDA, handler);
