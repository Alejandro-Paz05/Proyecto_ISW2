import { getSupabaseAdmin } from '@/lib/supabase';
import { cuentaDeSesion } from '@/lib/sesion';
import { reportarError } from '@/lib/errores';
import { permitir, ipDe } from '@/lib/limite';

/**
 * Guarda la retroalimentación que dejan las clientas desde la tienda.
 *
 * Se puede dejar con cuenta o como invitada. Si es un problema, la base abre
 * el ticket en la misma transacción (migración 006), así que esta ruta no
 * necesita saberlo.
 */

const TIPOS = ['sugerencia', 'problema', 'elogio'];
const CORREO_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LARGO_MINIMO = 5;
const LARGO_MAXIMO = 2000;

// Cinco mensajes cada diez minutos por visitante alcanzan para cualquier
// persona, y frenan a un script antes de que llene la tabla de tickets.
const LIMITE = { maximo: 5, ventanaMs: 10 * 60 * 1000 };

function paginaDeOrigen(pagina) {
  // Solo rutas del sitio, sin query ni ancla, que pueden traer datos.
  return typeof pagina === 'string' && pagina.startsWith('/')
    ? pagina.split(/[?#]/)[0].slice(0, 300)
    : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { tipo, mensaje, correo, pagina, sitio_web: trampa } = req.body ?? {};

  // Trampa para bots: el campo está en el formulario pero fuera de la
  // pantalla. Una persona no lo llena; un bot que completa todo, sí. Se le
  // responde como si hubiera funcionado, para que no aprenda a esquivarla.
  if (trampa) return res.status(201).json({ ok: true });

  if (!TIPOS.includes(tipo)) {
    return res.status(400).json({ error: 'Elegí si es una sugerencia, un problema o un elogio.' });
  }

  const texto = typeof mensaje === 'string' ? mensaje.trim() : '';
  if (texto.length < LARGO_MINIMO) {
    return res.status(400).json({ error: 'Contanos un poco más: el mensaje es muy corto.' });
  }
  if (texto.length > LARGO_MAXIMO) {
    return res.status(400).json({ error: `El mensaje no puede pasar de ${LARGO_MAXIMO} caracteres.` });
  }

  const correoDeContacto =
    typeof correo === 'string' && correo.trim() ? correo.trim().toLowerCase() : null;
  if (correoDeContacto && !CORREO_VALIDO.test(correoDeContacto)) {
    return res.status(400).json({ error: 'El correo no es válido.' });
  }

  if (!permitir(`feedback:${ipDe(req)}`, LIMITE)) {
    return res
      .status(429)
      .json({ error: 'Ya recibimos varios mensajes tuyos. Probá de nuevo en unos minutos.' });
  }

  try {
    // Si no se puede leer la sesión, el mensaje se guarda igual, como de
    // invitada: perder un reclamo por un problema de sesión sería peor.
    const cuenta = await cuentaDeSesion(req, res).catch(() => null);

    const { error } = await getSupabaseAdmin()
      .from('feedback')
      .insert({
        user_id: cuenta?.id ?? null,
        kind: tipo,
        message: texto,
        contact_email: correoDeContacto,
        page: paginaDeOrigen(pagina)
      });

    if (error) throw error;

    return res.status(201).json({ ok: true });
  } catch (error) {
    await reportarError(error, { ruta: '/api/feedback', metodo: 'POST' });
    return res.status(500).json({ error: 'No pudimos guardar tu mensaje. Probá de nuevo.' });
  }
}
