import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

/**
 * Autenticación del panel de administración.
 *
 * Una sola contraseña, guardada como variable de entorno del servidor. Al
 * acertarla se emite un token firmado que viaja en una cookie httpOnly, de
 * modo que la contraseña no vuelve a circular en cada petición y el
 * JavaScript de la página nunca puede leer la sesión.
 *
 * La clave de firma se deriva de la propia contraseña: así hace falta una
 * única variable de entorno, y cambiarla invalida todas las sesiones
 * abiertas, que es justo lo que se quiere al rotar una credencial.
 */

export const COOKIE_SESION = 'akari_admin';
const DURACION_SESION_HORAS = 8;

function passwordConfigurada() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error(
      'ADMIN_PASSWORD no está configurada o tiene menos de 12 caracteres. ' +
        'Definila en .env.local y en las variables de entorno del despliegue.'
    );
  }
  return password;
}

export function hayPasswordConfigurada() {
  try {
    passwordConfigurada();
    return true;
  } catch {
    return false;
  }
}

function firmar(datos) {
  return createHmac('sha256', passwordConfigurada()).update(datos).digest('base64url');
}

/** Comparación en tiempo constante: una comparación normal filtra, por lo que
 *  tarda en fallar, cuántos caracteres iniciales eran correctos. */
function sonIguales(a, b) {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) {
    // timingSafeEqual exige longitudes iguales; se compara contra sí mismo
    // para gastar el mismo tiempo que en el caso válido.
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

export function passwordEsCorrecta(intento) {
  if (typeof intento !== 'string' || intento.length === 0) return false;
  return sonIguales(intento, passwordConfigurada());
}

export function crearToken() {
  const payload = {
    exp: Date.now() + DURACION_SESION_HORAS * 60 * 60 * 1000,
    // Un valor aleatorio hace que dos sesiones abiertas a la vez no
    // compartan el mismo token.
    jti: randomBytes(8).toString('hex')
  };
  const cuerpo = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${cuerpo}.${firmar(cuerpo)}`;
}

export function tokenEsValido(token) {
  if (typeof token !== 'string') return false;

  const partes = token.split('.');
  if (partes.length !== 2) return false;

  const [cuerpo, firma] = partes;

  // Se verifica la firma ANTES de interpretar el contenido: el payload viene
  // del navegador y no es de fiar hasta comprobar que lo emitimos nosotros.
  if (!sonIguales(firma, firmar(cuerpo))) return false;

  try {
    const payload = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function estaAutenticado(req) {
  if (!hayPasswordConfigurada()) return false;
  return tokenEsValido(req.cookies?.[COOKIE_SESION]);
}

export function cookieDeSesion(token) {
  const atributos = [
    `${COOKIE_SESION}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${DURACION_SESION_HORAS * 60 * 60}`
  ];
  // Secure rompería el login en http://localhost durante el desarrollo.
  if (process.env.NODE_ENV === 'production') atributos.push('Secure');
  return atributos.join('; ');
}

export function cookieDeCierre() {
  const atributos = [`${COOKIE_SESION}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (process.env.NODE_ENV === 'production') atributos.push('Secure');
  return atributos.join('; ');
}

/** Envuelve una ruta de API para que solo responda a sesiones válidas. */
export function soloAdmin(handler) {
  return async function (req, res) {
    if (!hayPasswordConfigurada()) {
      console.error('ADMIN_PASSWORD no está configurada: el panel queda inaccesible.');
      return res.status(503).json({ error: 'El panel de administración no está configurado.' });
    }
    if (!estaAutenticado(req)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
    return handler(req, res);
  };
}
