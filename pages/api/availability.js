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

const MAXIMO_SERVICIOS = 10;
const MAXIMO_PERSONAS = 6;

/** '1,2,3' -> [1, 2, 3]. Devuelve null si algo no es un id válido. */
function parsearServicios(valor) {
  const partes = String(valor ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (partes.length === 0 || partes.length > MAXIMO_SERVICIOS) return null;

  const ids = partes.map(Number);
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) return null;

  return ids;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { date, services, people } = req.query;

  if (!esFechaValida(date)) {
    return res.status(400).json({ error: 'La fecha no es válida.' });
  }

  const ids = parsearServicios(services);
  if (!ids) {
    return res.status(400).json({ error: 'Los servicios elegidos no son válidos.' });
  }

  const personas = people === undefined ? 1 : Number(people);
  if (!Number.isInteger(personas) || personas < 1 || personas > MAXIMO_PERSONAS) {
    return res.status(400).json({ error: 'La cantidad de personas no es válida.' });
  }

  const ahora = new Date();
  if (date < diaLocalDe(ahora)) {
    return res.status(200).json({ abierto: false, motivo: 'pasado', franjas: [] });
  }

  const limite = new Date(ahora.getTime() + DIAS_DE_ANTELACION * 86400000);
  if (date > diaLocalDe(limite)) {
    return res.status(200).json({ abierto: false, motivo: 'muy-lejos', franjas: [] });
  }

  try {
    const supabase = getSupabaseAdmin();

    const [servicios, horario, bloqueo] = await Promise.all([
      supabase
        .from('services')
        .select('id, name, duration_minutes, price')
        .in('id', ids)
        .eq('active', true),
      supabase
        .from('business_hours')
        .select('opens_at, closes_at, closed')
        .eq('weekday', diaDeLaSemana(date))
        .maybeSingle(),
      supabase.from('blocked_dates').select('day, reason').eq('day', date).maybeSingle()
    ]);

    if (servicios.error) throw servicios.error;
    if (horario.error) throw horario.error;
    if (bloqueo.error) throw bloqueo.error;

    // Se comparan contra el conjunto de ids únicos: un id repetido en la
    // consulta no debería hacer fallar la comprobación.
    const unicos = new Set(ids);
    if (servicios.data.length !== unicos.size) {
      return res.status(404).json({ error: 'Alguno de los servicios no existe.' });
    }

    // La duración total del bloque: los servicios elegidos, multiplicados por
    // la cantidad de personas, porque se atienden una después de la otra.
    const duracionServicios = ids.reduce((suma, id) => {
      const servicio = servicios.data.find((s) => s.id === id);
      return suma + servicio.duration_minutes;
    }, 0);
    const precioServicios = ids.reduce((suma, id) => {
      const servicio = servicios.data.find((s) => s.id === id);
      return suma + Number(servicio.price);
    }, 0);

    const duracionTotal = duracionServicios * personas;
    const resumen = {
      servicios: ids.map((id) => servicios.data.find((s) => s.id === id)),
      personas,
      duracionMinutos: duracionTotal,
      total: precioServicios * personas
    };

    if (bloqueo.data) {
      return res
        .status(200)
        .json({ abierto: false, motivo: 'bloqueado', nota: bloqueo.data.reason, resumen, franjas: [] });
    }

    if (!horario.data || horario.data.closed) {
      return res.status(200).json({ abierto: false, motivo: 'cerrado', resumen, franjas: [] });
    }

    // Se consulta por instante y no por fecha, para que una cita que arranca
    // a las 18:30 y cruza el límite del día también cuente.
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
      duracionMinutos: duracionTotal,
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
      resumen,
      horario: { abre: horario.data.opens_at, cierra: horario.data.closes_at },
      franjas
    });
  } catch (error) {
    console.error('Error al calcular la disponibilidad:', error);
    return res.status(500).json({ error: 'Error al consultar la disponibilidad' });
  }
}
