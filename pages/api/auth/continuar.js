import { clienteDeSesion, leerSesion, rolDeUsuario, destinoSeguro } from '@/lib/sesion';

/**
 * A dónde va cada quien después de iniciar sesión.
 *
 * Los dos caminos de ingreso terminan acá:
 *
 *   - Google vuelve con ?code=, que se canjea por la sesión. El canje usa el
 *     verificador PKCE que el navegador guardó en una cookie al salir hacia
 *     Google, así que un código robado no sirve en otro navegador.
 *   - El ingreso con correo y contraseña llega con la sesión ya puesta.
 *
 * En los dos casos el destino lo decide el servidor según el rol. El
 * navegador no lo conoce ni tiene por qué conocerlo: si lo decidiera él,
 * bastaría con editar una línea en la consola para intentar entrar a un
 * portal ajeno. Igual no pasaría, porque cada portal verifica el rol, pero
 * la decisión tiene un solo dueño.
 */

const RUTA_DE_INGRESO = '/akaristudio/admin/login';

function redirigir(res, destino) {
  res.setHeader('Location', destino);
  return res.status(302).end();
}

function ingresoConError(motivo, volver) {
  const parametros = new URLSearchParams({ error: motivo });
  if (volver) parametros.set('volver', volver);
  return `${RUTA_DE_INGRESO}?${parametros}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const volver = typeof req.query.volver === 'string' ? req.query.volver : undefined;
  const codigo = typeof req.query.code === 'string' ? req.query.code : undefined;

  // La respuesta pone cookies de sesión: ningún intermediario puede guardarla.
  res.setHeader('Cache-Control', 'private, no-store');

  if (codigo) {
    const cliente = clienteDeSesion(req, res);
    if (!cliente) return redirigir(res, ingresoConError('cuentas_no_disponibles', volver));

    const { data, error } = await cliente.auth.exchangeCodeForSession(codigo);
    if (error || !data?.user) return redirigir(res, ingresoConError('google', volver));

    // Recién canjeado, la sesión está en la respuesta y todavía no en la
    // petición: el rol se busca con el id que devolvió el canje.
    return redirigir(res, destinoSeguro(volver, await rolDeUsuario(data.user.id)));
  }

  const sesion = await leerSesion(req, res);
  if (!sesion) return redirigir(res, ingresoConError('sin_sesion', volver));

  return redirigir(res, destinoSeguro(volver, sesion.rol));
}
