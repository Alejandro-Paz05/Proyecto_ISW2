import { getSupabaseAdmin } from '@/lib/supabase';
import { conRol, PORTAL_SISTEMA } from '@/lib/sesion';
import { reportarError } from '@/lib/errores';
import { SIN_CACHE } from '@/lib/respuesta-cacheable';

/**
 * Las cuentas con su rol.
 *
 * El rol vive en profiles y el correo en auth.users, que no es una tabla que
 * se pueda consultar por la API de datos: se pide por la API de
 * administración y se juntan acá por id.
 *
 * Se muestra también cómo entra cada cuenta —contraseña, Google, o todavía
 * ninguna— porque es lo primero que se pregunta cuando alguien no puede
 * iniciar sesión.
 */

const MAXIMO = 200;

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: perfiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, created_at')
      .order('created_at', { ascending: true })
      .limit(MAXIMO);

    if (error) throw error;

    const { data: cuentas, error: fallo } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: MAXIMO
    });

    if (fallo) throw fallo;

    const porId = new Map((cuentas?.users ?? []).map((cuenta) => [cuenta.id, cuenta]));

    res.setHeader('Cache-Control', SIN_CACHE);
    return res.status(200).json(
      perfiles.map((perfil) => {
        const cuenta = porId.get(perfil.id);
        return {
          ...perfil,
          email: cuenta?.email ?? null,
          ultimo_ingreso: cuenta?.last_sign_in_at ?? null,
          proveedores: cuenta?.app_metadata?.providers ?? []
        };
      })
    );
  } catch (error) {
    console.error('Error al listar las cuentas:', error);
    await reportarError(error, { ruta: '/api/sistema/cuentas', metodo: req.method });
    return res.status(500).json({ error: 'Error al obtener las cuentas' });
  }
}

export default conRol(PORTAL_SISTEMA, handler);
