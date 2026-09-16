import { getSupabaseAdmin } from '@/lib/supabase';
import { conRol, PORTAL_SISTEMA, ROLES } from '@/lib/sesion';
import { reportarError } from '@/lib/errores';

/**
 * Cambiarle el rol a una cuenta.
 *
 * Es la única forma de que alguien deje de ser clienta: el registro siempre
 * crea cuentas clienta, y la base no deja que una cuenta se suba el rol a sí
 * misma. Acá lo hace el servidor, con la clave secreta, después de comprobar
 * que quien pide es admin.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!UUID.test(id)) {
    return res.status(400).json({ error: 'Cuenta no válida.' });
  }

  const { role } = req.body ?? {};
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'Ese rol no existe.' });
  }

  // Nadie se cambia el rol a sí mismo. Si el único admin se bajara por error,
  // el portal quedaría sin nadie que pueda devolver los roles y habría que
  // arreglarlo a mano en Supabase.
  if (id === req.sesion.id) {
    return res.status(400).json({
      error: 'No podés cambiarte el rol a vos mismo: pedíselo a otra cuenta con rol admin.'
    });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('profiles')
      .update({ role })
      .eq('id', id)
      .select('id, full_name, role')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'La cuenta no existe.' });

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al cambiar el rol:', error);
    await reportarError(error, { ruta: '/api/sistema/cuentas/[id]', metodo: req.method });
    return res.status(500).json({ error: 'Error al cambiar el rol' });
  }
}

export default conRol(PORTAL_SISTEMA, handler);
