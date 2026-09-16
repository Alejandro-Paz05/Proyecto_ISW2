import { getSupabaseAdmin } from '@/lib/supabase';
import { conRol, PORTAL_SISTEMA } from '@/lib/sesion';
import { reportarError } from '@/lib/errores';

/**
 * Cambiar el estado, la severidad o la nota de resolución de un ticket.
 *
 * La fecha de resolución no se toca desde acá: la pone un trigger (migración
 * 006), para que también quede bien si alguien cambia el estado desde el
 * panel de Supabase.
 */

const COLUMNAS =
  'id, source, title, severity, status, occurrences, last_seen_at, resolution, resolved_at';

const ESTADOS = ['abierto', 'en_progreso', 'resuelto', 'descartado'];
const SEVERIDADES = ['baja', 'media', 'alta', 'critica'];
const LARGO_MAXIMO_RESOLUCION = 2000;

function leerCambios(cuerpo = {}) {
  const cambios = {};

  if (cuerpo.status !== undefined) {
    if (!ESTADOS.includes(cuerpo.status)) return { error: 'Ese estado no existe.' };
    cambios.status = cuerpo.status;
  }

  if (cuerpo.severity !== undefined) {
    if (!SEVERIDADES.includes(cuerpo.severity)) return { error: 'Esa severidad no existe.' };
    cambios.severity = cuerpo.severity;
  }

  if (cuerpo.resolution !== undefined) {
    const nota = typeof cuerpo.resolution === 'string' ? cuerpo.resolution.trim() : '';
    if (nota.length > LARGO_MAXIMO_RESOLUCION) {
      return { error: `La nota no puede pasar de ${LARGO_MAXIMO_RESOLUCION} caracteres.` };
    }
    // Vacía es borrarla, no dejarla en blanco.
    cambios.resolution = nota || null;
  }

  if (Object.keys(cambios).length === 0) return { error: 'No hay nada que cambiar.' };

  return { cambios };
}

async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Ticket no válido.' });
  }

  const { cambios, error: errorDeValidacion } = leerCambios(req.body ?? {});
  if (errorDeValidacion) return res.status(400).json({ error: errorDeValidacion });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('tickets')
      .update(cambios)
      .eq('id', id)
      .select(COLUMNAS)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'El ticket no existe.' });

    return res.status(200).json(data);
  } catch (error) {
    // 23505: el índice único que admite un solo ticket abierto por huella.
    // Pasa al reabrir uno viejo cuando el mismo error ya abrió otro.
    if (error?.code === '23505') {
      return res.status(409).json({
        error: 'Ya hay otro ticket abierto con el mismo error. Resolvé ese, o dejá este cerrado.'
      });
    }

    console.error('Error al actualizar el ticket:', error);
    await reportarError(error, { ruta: '/api/sistema/tickets/[id]', metodo: req.method });
    return res.status(500).json({ error: 'Error al actualizar el ticket' });
  }
}

export default conRol(PORTAL_SISTEMA, handler);
