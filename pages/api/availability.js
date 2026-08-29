import { getSupabaseAdmin } from '@/lib/supabase';
import {
  generarFranjas,
  esFechaValida,
  diaDeLaSemana,
  diaLocalDe,
  instanteDesdeLocal,
  DIAS_DE_ANTELACION
} from '@/lib/agenda';

// Antelación mínima para reservar: nadie puede tomar un turno que empieza
// dentro de diez minutos.
const MARGEN_MINUTOS = 10;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { date, service } = req.query;

  if (!esFechaValida(date)) {
    return res.status(400).json({ error: 'La fecha no es válida.' });
  }

  const serviceId = Number(service);
  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return res.status(400).json({ error: 'El servicio no es válido.' });
  }

  const ahora = new Date();
  const hoy = diaLocalDe(ahora);
  if (date < hoy) {
    return res.status(200).json({ abierto: false, motivo: 'pasado', franjas: [] });
  }

  const limite = new Date(ahora.getTime() + DIAS_DE_ANTELACION * 24 * 60 * 60 * 1000);
  if (date > diaLocalDe(limite)) {
    return res.status(200).json({ abierto: false, motivo: 'muy-lejos', franjas: [] });
  }

  try {
    const supabase = getSupabaseAdmin();

    const [servicio, horario, bloqueo] = await Promise.all([
      supabase
        .from('services')
        .select('id, name, duration_minutes, price')
        .eq('id', serviceId)
        .eq('active', true)
        .maybeSingle(),
      supabase
        .from('business_hours')
        .select('opens_at, closes_at, closed')
        .eq('weekday', diaDeLaSemana(date))
        .maybeSingle(),
      supabase.from('blocked_dates').select('day, reason').eq('day', date).maybeSingle()
    ]);

    if (servicio.error) throw servicio.error;
    if (horario.error) throw horario.error;
    if (bloqueo.error) throw bloqueo.error;

    if (!servicio.data) {
      return res.status(404).json({ error: 'El servicio no existe.' });
    }

    if (bloqueo.data) {
      return res
        .status(200)
        .json({ abierto: false, motivo: 'bloqueado', nota: bloqueo.data.reason, franjas: [] });
    }

    if (!horario.data || horario.data.closed) {
      return res.status(200).json({ abierto: false, motivo: 'cerrado', franjas: [] });
    }

    // Las citas del día. Se consulta por el instante, no por la fecha, para
    // que una cita que arranca a las 18:30 y cruza a las 19:30 cuente.
    const desdeDia = instanteDesdeLocal(date, 0).toISOString();
    const hastaDia = instanteDesdeLocal(date, 24 * 60).toISOString();

    const { data: citas, error: errorCitas } = await supabase
      .from('appointments')
      .select('starts_at, ends_at')
      .neq('status', 'cancelada')
      .lt('starts_at', hastaDia)
      .gt('ends_at', desdeDia);

    if (errorCitas) throw errorCitas;

    const franjas = generarFranjas({
      dia: date,
      abre: horario.data.opens_at,
      cierra: horario.data.closes_at,
      duracionMinutos: servicio.data.duration_minutes,
      ocupados: citas.map((cita) => ({
        desde: new Date(cita.starts_at),
        hasta: new Date(cita.ends_at)
      })),
      ahora,
      margenMinutos: MARGEN_MINUTOS
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      abierto: true,
      servicio: servicio.data,
      horario: { abre: horario.data.opens_at, cierra: horario.data.closes_at },
      franjas
    });
  } catch (error) {
    console.error('Error al calcular la disponibilidad:', error);
    return res.status(500).json({ error: 'Error al consultar la disponibilidad' });
  }
}
