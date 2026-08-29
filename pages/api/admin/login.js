import {
  passwordEsCorrecta,
  hayPasswordConfigurada,
  crearToken,
  cookieDeSesion
} from '@/lib/admin-auth';

// Retardo fijo ante un intento fallido. No sustituye a un limitador de
// intentos, pero encarece lo suficiente probar contraseñas a ciegas contra
// una ruta que, por lo demás, responde en milisegundos.
const RETARDO_FALLO_MS = 700;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  if (!hayPasswordConfigurada()) {
    console.error('ADMIN_PASSWORD no está configurada: el panel queda inaccesible.');
    return res.status(503).json({ error: 'El panel de administración no está configurado.' });
  }

  const { password } = req.body ?? {};

  if (!passwordEsCorrecta(password)) {
    await new Promise((resolve) => setTimeout(resolve, RETARDO_FALLO_MS));
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  }

  res.setHeader('Set-Cookie', cookieDeSesion(crearToken()));
  return res.status(200).json({ ok: true });
}
