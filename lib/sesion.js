import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';
import { estaAutenticado } from '@/lib/admin-auth';

/**
 * Quién hace la petición y qué puede hacer.
 *
 * Es el único lugar que lo decide: las rutas de API y las páginas privadas
 * preguntan acá en vez de revisar cookies por su cuenta. Así cambiar lo que
 * puede un rol es cambiar una línea, no buscarlo por todo el proyecto.
 *
 * La identidad la da Supabase Auth: la sesión viaja en cookies y se valida
 * contra Supabase en cada petición con getUser(), que a diferencia de
 * getSession() no se fía de lo que dice la cookie. El rol, en cambio, se lee
 * de `profiles` con la clave secreta, nunca de algo que mande el navegador.
 *
 * Durante la transición también se acepta la contraseña compartida del
 * panel, como sesión de dueña, para que nadie quede afuera mientras se crean
 * las cuentas. Si la clave publicable todavía no está configurada, solo
 * funciona ese camino, y el panel sigue igual que antes.
 */

export const ROLES = ['clienta', 'duena', 'admin', 'super_admin'];

/** Quiénes entran al panel de la tienda: pedidos y productos. */
export const PANEL_TIENDA = ['duena', 'admin', 'super_admin'];

/** Quiénes entran al portal del sistema: tickets, retroalimentación y cuentas. */
export const PORTAL_SISTEMA = ['admin', 'super_admin'];

/**
 * El super_admin es la cuenta de quien revisa el proyecto: ve todo y no
 * cambia nada. Un revisor no tiene por qué poder cancelar el pedido real de
 * una clienta.
 */
export function puedeEscribir(rol) {
  return rol !== 'super_admin';
}

function configuracionPublica() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && clave ? { url, clave } : null;
}

export function autenticacionConfigurada() {
  return configuracionPublica() !== null;
}

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

/**
 * Arma una cabecera Set-Cookie con las opciones que usa Supabase.
 *
 * Se escribe acá y no se importa el paquete `cookie`: es una dependencia de
 * @supabase/ssr, no del proyecto, y podría desaparecer en cualquier
 * actualización sin que nada lo avise.
 */
export function serializarCookie(nombre, valor, opciones = {}) {
  const partes = [`${nombre}=${encodeURIComponent(valor)}`];

  if (opciones.maxAge !== undefined) partes.push(`Max-Age=${Math.floor(opciones.maxAge)}`);
  if (opciones.expires) partes.push(`Expires=${new Date(opciones.expires).toUTCString()}`);
  partes.push(`Path=${opciones.path ?? '/'}`);
  if (opciones.domain) partes.push(`Domain=${opciones.domain}`);
  if (opciones.httpOnly) partes.push('HttpOnly');
  if (opciones.secure) partes.push('Secure');

  if (opciones.sameSite) {
    const valorSameSite = opciones.sameSite === true ? 'strict' : String(opciones.sameSite);
    partes.push(`SameSite=${valorSameSite[0].toUpperCase()}${valorSameSite.slice(1).toLowerCase()}`);
  }

  return partes.join('; ');
}

/** Suma cookies a la respuesta sin pisar las que otra parte ya puso. */
function agregarCookies(res, nuevas) {
  const previas = res.getHeader?.('Set-Cookie');
  const lista = previas === undefined ? [] : [].concat(previas);
  res.setHeader('Set-Cookie', [...lista, ...nuevas]);
}

/**
 * Cliente de Supabase atado a esta petición. Uno por petición, siempre:
 * compartirlo mezclaría las sesiones de dos personas.
 *
 * Devuelve null si falta la configuración pública.
 */
export function clienteDeSesion(req, res) {
  const configuracion = configuracionPublica();
  if (!configuracion) return null;

  return createServerClient(configuracion.url, configuracion.clave, {
    cookies: {
      getAll: () => Object.entries(req.cookies ?? {}).map(([name, value]) => ({ name, value })),

      // Supabase escribe acá cuando renueva el token. Las cabeceras que manda
      // junto impiden que un CDN guarde la respuesta: sin ellas, la cookie de
      // sesión de una clienta podría servírsele a la siguiente.
      setAll: (cookies, cabeceras = {}) => {
        if (!res) return;
        agregarCookies(
          res,
          cookies.map(({ name, value, options }) => serializarCookie(name, value, options))
        );
        for (const [clave, valor] of Object.entries(cabeceras)) res.setHeader(clave, valor);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------

async function rolDe(idUsuario) {
  const { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .select('role')
    .eq('id', idUsuario)
    .maybeSingle();

  // Si no se puede leer el rol, el error sube. Tratarlo como "sin rol" y
  // dejar pasar sería abrir la puerta justo cuando la base está fallando.
  if (error) throw error;

  // Una cuenta sin perfil, o con un rol que el código no conoce, es clienta:
  // el rol más bajo es el único que es seguro suponer.
  return ROLES.includes(data?.role) ? data.role : 'clienta';
}

/**
 * La sesión de la petición, o null si no hay.
 *
 * `origen` dice de dónde salió: 'supabase' para una cuenta, 'contrasena'
 * para la contraseña compartida del panel durante la transición.
 */
export async function leerSesion(req, res) {
  const cliente = clienteDeSesion(req, res);

  if (cliente) {
    const { data, error } = await cliente.auth.getUser();
    const usuario = error ? null : data?.user;

    if (usuario) {
      return {
        id: usuario.id,
        email: usuario.email ?? null,
        rol: await rolDe(usuario.id),
        origen: 'supabase'
      };
    }
  }

  if (estaAutenticado(req)) {
    return { id: null, email: null, rol: 'duena', origen: 'contrasena' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// A dónde va cada quien
// ---------------------------------------------------------------------------

export function destinoSegunRol(rol) {
  if (PORTAL_SISTEMA.includes(rol)) return '/akaristudio/sistema';
  if (PANEL_TIENDA.includes(rol)) return '/akaristudio/admin';
  return '/akaristudio/cuenta';
}

/**
 * El destino después de iniciar sesión.
 *
 * Solo se acepta volver a una ruta del propio sitio. Si ?volver= aceptara
 * cualquier dirección, el login se volvería un redireccionador abierto:
 * alguien podría mandar un enlace con el dominio real que, después de pedir
 * la contraseña, termina en una copia falsa.
 */
export function destinoSeguro(volver, rol) {
  if (typeof volver === 'string' && /^\/akaristudio(\/|\?|$)/.test(volver)) return volver;
  return destinoSegunRol(rol);
}

// ---------------------------------------------------------------------------
// Protección de rutas de API y de páginas
// ---------------------------------------------------------------------------

const METODOS_DE_LECTURA = new Set(['GET', 'HEAD']);

/**
 * Envuelve una ruta de API para que solo responda a esos roles.
 *
 * Deja la sesión en req.sesion, para que la ruta sepa quién pidió qué.
 */
export function conRol(roles, handler) {
  return async function rutaProtegida(req, res) {
    const sesion = await leerSesion(req, res);

    if (!sesion) {
      return res.status(401).json({ error: 'Iniciá sesión para continuar.' });
    }

    if (!roles.includes(sesion.rol)) {
      return res.status(403).json({ error: 'Tu cuenta no tiene acceso a esta sección.' });
    }

    if (!METODOS_DE_LECTURA.has(req.method) && !puedeEscribir(sesion.rol)) {
      return res.status(403).json({ error: 'Esta cuenta es de solo lectura.' });
    }

    req.sesion = sesion;
    return handler(req, res);
  };
}

/**
 * getServerSideProps para una página privada.
 *
 * Sin sesión, al login, recordando a dónde se quería ir. Con una sesión que
 * no tiene acceso, al portal que sí le corresponde: una clienta que escribe
 * /akaristudio/admin no necesita un error, necesita llegar a su cuenta.
 */
export function protegerPagina(roles, { rutaDeIngreso = '/akaristudio/admin/login' } = {}) {
  return async function getServerSideProps({ req, res, resolvedUrl }) {
    const sesion = await leerSesion(req, res);

    if (!sesion) {
      return {
        redirect: {
          destination: `${rutaDeIngreso}?volver=${encodeURIComponent(resolvedUrl)}`,
          permanent: false
        }
      };
    }

    if (!roles.includes(sesion.rol)) {
      return { redirect: { destination: destinoSegunRol(sesion.rol), permanent: false } };
    }

    return {
      props: {
        sesion: {
          rol: sesion.rol,
          email: sesion.email,
          origen: sesion.origen,
          soloLectura: !puedeEscribir(sesion.rol)
        }
      }
    };
  };
}
