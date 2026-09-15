import { cookieDeCierre } from '@/lib/admin-auth';
import { clienteDeSesion } from '@/lib/sesion';

/**
 * Cierra la sesión, sea cual sea.
 *
 * Durante la transición puede haber dos abiertas —la cuenta de Supabase y la
 * contraseña compartida del panel— y se cierran las dos.
 *
 * No se comprueba la sesión a propósito: cerrarla siempre debe funcionar,
 * incluso si el token ya venció o está corrupto. Por eso tampoco un fallo de
 * Supabase impide borrar la cookie del panel.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const cliente = clienteDeSesion(req, res);

  if (cliente) {
    try {
      // scope local: cierra la sesión de este dispositivo, no la de todos.
      // Salir desde la computadora de la tienda no debería desconectar el
      // teléfono de la dueña.
      await cliente.auth.signOut({ scope: 'local' });
    } catch {
      // Sin red hacia Supabase: igual se borra lo que se puede borrar acá.
    }
  }

  // Se suma a las cookies que Supabase acaba de vencer, sin pisarlas.
  const previas = res.getHeader?.('Set-Cookie');
  res.setHeader(
    'Set-Cookie',
    previas === undefined ? cookieDeCierre() : [].concat(previas, cookieDeCierre())
  );

  return res.status(200).json({ ok: true });
}
