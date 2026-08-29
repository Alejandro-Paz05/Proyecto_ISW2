import { getSupabaseAdmin } from '@/lib/supabase';

// Igual que en la creación de pedidos: estos códigos vienen de las
// validaciones de create_appointment y su mensaje sí es seguro mostrarlo.
const CLIENT_ERROR_CODES = new Set(['22023', 'P0001']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { serviceId, customer, startsAt, notes } = req.body ?? {};

  const id = Number(serviceId);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'El servicio elegido no es válido.' });
  }

  if (typeof startsAt !== 'string' || Number.isNaN(Date.parse(startsAt))) {
    return res.status(400).json({ error: 'El horario elegido no es válido.' });
  }

  try {
    // La duración, el precio y la comprobación de que el horario siga libre
    // los resuelve la base. El navegador solo dice qué servicio y cuándo.
    const { data, error } = await getSupabaseAdmin().rpc('create_appointment', {
      p_service_id: id,
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
