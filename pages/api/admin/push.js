import { getSupabaseAdmin } from '@/lib/supabase';
import { reportarError } from '@/lib/errores';
import { conRol, PANEL_TIENDA } from '@/lib/sesion';

/**
 * Alta y baja de un dispositivo que quiere recibir avisos de pedidos.
 *
 * La suscripción la arma el navegador y este servidor solo la guarda: no hay
 * nada que validar de su contenido más allá de que estén las tres partes que
 * exige el estándar. La cuenta sale de la sesión y no del cuerpo, para que
 * nadie pueda suscribir el teléfono de otro.
 */

const LARGO_MAXIMO = 1000;

function suscripcionValida(cuerpo) {
  const endpoint = cuerpo?.endpoint;
  const p256dh = cuerpo?.keys?.p256dh;
  const auth = cuerpo?.keys?.auth;

  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) return null;
  if (endpoint.length > LARGO_MAXIMO) return null;
  if (typeof p256dh !== 'string' || !p256dh) return null;
  if (typeof auth !== 'string' || !auth) return null;

  return { endpoint, p256dh, auth };
}

async function suscribir(req, res) {
  // La contraseña compartida del panel no identifica a nadie: no hay cuenta a
  // la que colgarle el dispositivo. Es una de las cosas que se arreglan solas
  // cuando ese camino se retire.
  if (!req.sesion.id) {
    return res.status(409).json({
      error: 'Entrá con tu cuenta para activar los avisos, no con la contraseña del panel.'
    });
  }

  const suscripcion = suscripcionValida(req.body);

  if (!suscripcion) {
    return res.status(400).json({ error: 'La suscripción no tiene la forma que esperamos.' });
  }

  const navegador = typeof req.body?.navegador === 'string' ? req.body.navegador.slice(0, 120) : null;

  try {
    // El endpoint es único: volver a suscribir el mismo dispositivo actualiza
    // su fila en vez de duplicarla. Pasa cada vez que se abre el panel.
    const { error } = await getSupabaseAdmin()
      .from('suscripciones_push')
      .upsert(
        {
          user_id: req.sesion.id,
          endpoint: suscripcion.endpoint,
          p256dh: suscripcion.p256dh,
          auth: suscripcion.auth,
          navegador,
          last_used_at: new Date().toISOString()
        },
        { onConflict: 'endpoint' }
      );

    if (error) throw error;

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Error al guardar la suscripción:', error);
    await reportarError(error, { ruta: '/api/admin/push', metodo: req.method });
    return res.status(500).json({ error: 'No se pudo activar los avisos.' });
  }
}

async function darDeBaja(req, res) {
  const endpoint = req.body?.endpoint;

  if (typeof endpoint !== 'string' || !endpoint) {
    return res.status(400).json({ error: 'Falta el endpoint del dispositivo.' });
  }

  try {
    const { error } = await getSupabaseAdmin()
      .from('suscripciones_push')
      .delete()
      .eq('endpoint', endpoint);

    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error al dar de baja la suscripción:', error);
    await reportarError(error, { ruta: '/api/admin/push', metodo: req.method });
    return res.status(500).json({ error: 'No se pudo desactivar los avisos.' });
  }
}

async function handler(req, res) {
  if (req.method === 'POST') return suscribir(req, res);
  if (req.method === 'DELETE') return darDeBaja(req, res);

  res.setHeader('Allow', 'POST, DELETE');
  return res.status(405).json({ error: 'Método no permitido' });
}

export default conRol(PANEL_TIENDA, handler);
