import { cookieDeCierre } from '@/lib/admin-auth';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // No se comprueba la sesión a propósito: cerrarla siempre debe funcionar,
  // incluso si el token ya venció o está corrupto.
  res.setHeader('Set-Cookie', cookieDeCierre());
  return res.status(200).json({ ok: true });
}
