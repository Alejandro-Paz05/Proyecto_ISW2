import { getSupabaseAdmin } from '@/lib/supabase';
import { cuentaDeSesion } from '@/lib/sesion';
import { reportarError } from '@/lib/errores';

/**
 * El nombre de quien está mirando.
 *
 * Solo el nombre: el rol no se toca desde acá, ni siquiera el propio. Eso
 * está también en la base (migración 005), donde el privilegio de columna
 * impide que una cuenta se edite el rol aunque llegue por otro camino.
 */

const LARGO_MINIMO = 2;
const LARGO_MAXIMO = 80;

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const cuenta = await cuentaDeSesion(req, res).catch(() => null);
  if (!cuenta) {
    return res.status(401).json({ error: 'Iniciá sesión para cambiar tu nombre.' });
  }

  const nombre = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
  if (nombre.length < LARGO_MINIMO || nombre.length > LARGO_MAXIMO) {
    return res
      .status(400)
      .json({ error: `El nombre tiene que tener entre ${LARGO_MINIMO} y ${LARGO_MAXIMO} caracteres.` });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('profiles')
      .update({ full_name: nombre })
      .eq('id', cuenta.id)
      .select('id, full_name, role')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Tu perfil no existe.' });

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error al actualizar el perfil:', error);
    await reportarError(error, { ruta: '/api/cuenta/perfil', metodo: req.method });
    return res.status(500).json({ error: 'Error al guardar tu nombre' });
  }
}
