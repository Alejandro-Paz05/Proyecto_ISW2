import { getSupabaseAdmin } from '@/lib/supabase';
import { conRol, PORTAL_SISTEMA } from '@/lib/sesion';
import { reportarError } from '@/lib/errores';
import { SIN_CACHE } from '@/lib/respuesta-cacheable';

/**
 * Los tickets, para el portal del sistema.
 *
 * Solo admin y super_admin: son trabajo técnico. Lo que le importa a la
 * dueña —el reclamo de una clienta— lo ve en la retroalimentación.
 */

const COLUMNAS =
  'id, source, title, detail, severity, status, fingerprint, occurrences, ' +
  'first_seen_at, last_seen_at, context, resolution, resolved_at, created_at';

// Suficiente para un salón. Con más, el portal necesitaría paginar y todavía
// no hace falta.
const MAXIMO = 200;

const ESTADOS = ['abierto', 'en_progreso', 'resuelto', 'descartado'];
const PENDIENTES = ['abierto', 'en_progreso'];

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // Por defecto, lo que hay que atender: un ticket resuelto ya no es trabajo.
  const filtro = typeof req.query.estado === 'string' ? req.query.estado : 'pendientes';

  if (filtro !== 'pendientes' && filtro !== 'todos' && !ESTADOS.includes(filtro)) {
    return res.status(400).json({ error: 'Ese estado no existe.' });
  }

  try {
    let consulta = getSupabaseAdmin()
      .from('tickets')
      .select(COLUMNAS)
      // Lo último que ocurrió arriba: un ticket viejo que vuelve a dispararse
      // es más urgente que uno nuevo que pasó una vez.
      .order('last_seen_at', { ascending: false })
      .limit(MAXIMO);

    if (filtro === 'pendientes') consulta = consulta.in('status', PENDIENTES);
    else if (filtro !== 'todos') consulta = consulta.eq('status', filtro);

    const { data, error } = await consulta;
    if (error) throw error;

    res.setHeader('Cache-Control', SIN_CACHE);
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al listar tickets:', error);
    await reportarError(error, { ruta: '/api/sistema/tickets', metodo: req.method });
    return res.status(500).json({ error: 'Error al obtener los tickets' });
  }
}

export default conRol(PORTAL_SISTEMA, handler);
