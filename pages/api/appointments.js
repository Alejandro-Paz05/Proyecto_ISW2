import { getSupabaseAdmin } from '@/lib/supabase';

// Igual que en la creación de pedidos: estos códigos vienen de las
// validaciones de create_appointment y su mensaje sí es seguro mostrarlo.
const CLIENT_ERROR_CODES = new Set(['22023', 'P0001']);

const MAXIMO_SERVICIOS = 10;
const MAXIMO_PERSONAS = 6;

function normalizarServicios(valor) {
  if (!Array.isArray(valor) || valor.length === 0 || valor.length > MAXIMO_SERVICIOS) {
    return null;
  }
  const ids = valor.map(Number);
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) return null;
  return ids;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { serviceIds, people, customer, startsAt, notes } = req.body ?? {};

  const ids = normalizarServicios(serviceIds);
  if (!ids) {
    return res.status(400).json({ error: 'Hay que elegir al menos un servicio.' });
  }

  const personas = people === undefined ? 1 : Number(people);
  if (!Number.isInteger(personas) || personas < 1 || personas > MAXIMO_PERSONAS) {
    return res.status(400).json({ error: 'La cantidad de personas no es válida.' });
  }

  if (typeof startsAt !== 'string' || Number.isNaN(Date.parse(startsAt))) {
    return res.status(400).json({ error: 'El horario elegido no es válido.' });
  }

  try {
    // La duración, el precio y la comprobación de que el horario siga libre
    // los resuelve la base. El navegador solo dice qué servicios y cuándo.
    const { data, error } = await getSupabaseAdmin().rpc('create_appointment', {
      p_service_ids: ids,
      p_people: personas,
      p_customer_name: customer?.name ?? '',
      p_customer_email: customer?.email ?? '',
      p_customer_phone: customer?.phone ?? '',
      p_notes: notes ?? '',
      p_starts_at: new Date(startsAt).toISOString()
    });

    if (error) {
      if (CLIENT_ERROR_CODES.has(error.code)) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }

    return res.status(201).json({ success: true, appointment: data });
  } catch (error) {
    console.error('Error al reservar la cita:', error);
    return res.status(500).json({ error: 'Error al reservar la cita' });
  }
}
