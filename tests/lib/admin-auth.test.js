import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  COOKIE_SESION,
  hayPasswordConfigurada,
  passwordEsCorrecta,
  crearToken,
  tokenEsValido,
  estaAutenticado,
  cookieDeSesion,
  cookieDeCierre,
  soloAdmin
} from '@/lib/admin-auth';

const PASSWORD = 'contrasena-de-prueba-larga';

/** Reproduce la firma del módulo, para poder fabricar tokens a medida. */
function firmarCon(cuerpo, password) {
  return createHmac('sha256', password).update(cuerpo).digest('base64url');
}

function tokenCon(payload, password = PASSWORD) {
  const cuerpo = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${cuerpo}.${firmarCon(cuerpo, password)}`;
}

describe('autenticacion del panel', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = PASSWORD;
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('configuracion', () => {
    it('detecta que hay contrasena configurada', () => {
      expect(hayPasswordConfigurada()).toBe(true);
    });

    it('rechaza la ausencia de contrasena', () => {
      delete process.env.ADMIN_PASSWORD;
      expect(hayPasswordConfigurada()).toBe(false);
    });

    it('rechaza una contrasena demasiado corta', () => {
      process.env.ADMIN_PASSWORD = 'corta';
      expect(hayPasswordConfigurada()).toBe(false);
    });
  });

  describe('verificacion de la contrasena', () => {
    it('acepta la correcta', () => {
      expect(passwordEsCorrecta(PASSWORD)).toBe(true);
    });

    it.each([
      ['una incorrecta', 'otra-cosa-cualquiera'],
      ['un prefijo de la correcta', PASSWORD.slice(0, -1)],
      ['la correcta con algo pegado', PASSWORD + 'x'],
      ['una cadena vacia', ''],
      ['algo que no es texto', 12345],
      ['null', null],
      ['undefined', undefined]
    ])('rechaza %s', (_descripcion, intento) => {
      expect(passwordEsCorrecta(intento)).toBe(false);
    });
  });

  describe('tokens de sesion', () => {
    it('acepta un token recien emitido', () => {
      expect(tokenEsValido(crearToken())).toBe(true);
    });

    it('emite un token distinto en cada sesion', () => {
      expect(crearToken()).not.toBe(crearToken());
    });

    it('rechaza un token vencido', () => {
      expect(tokenEsValido(tokenCon({ exp: Date.now() - 1000, jti: 'a' }))).toBe(false);
    });

    it('rechaza un token firmado con otra contrasena', () => {
      const ajeno = tokenCon({ exp: Date.now() + 100000, jti: 'a' }, 'otra-contrasena-larga');
      expect(tokenEsValido(ajeno)).toBe(false);
    });

    it('rechaza un payload manipulado que conserva la firma vieja', () => {
      const original = crearToken();
      const [, firma] = original.split('.');
      const cuerpoFalso = Buffer.from(
        JSON.stringify({ exp: Date.now() + 999999999, jti: 'intruso' })
      ).toString('base64url');

      expect(tokenEsValido(`${cuerpoFalso}.${firma}`)).toBe(false);
    });

    // Se construye en vez de escribirse literal: un token real empieza por
    // "eyJ", y ese prefijo hace que los escaneres de secretos marquen el
    // archivo como si tuviera una credencial filtrada.
    const conFirmaInventada = `${Buffer.from(JSON.stringify({ exp: 9999999999 })).toString(
      'base64url'
    )}.firmafalsa`;

    it.each([
      ['una cadena vacia', ''],
      ['texto sin punto', 'cualquiercosa'],
      ['demasiadas partes', 'a.b.c'],
      ['una firma inventada', conFirmaInventada],
      ['algo que no es texto', { exp: 1 }],
      ['null', null]
    ])('rechaza %s', (_descripcion, token) => {
      expect(tokenEsValido(token)).toBe(false);
    });

    it('deja de aceptar el token si se cambia la contrasena', () => {
      const token = crearToken();
      expect(tokenEsValido(token)).toBe(true);

      process.env.ADMIN_PASSWORD = 'una-contrasena-completamente-nueva';

      expect(tokenEsValido(token)).toBe(false);
    });
  });

  describe('lectura de la cookie', () => {
    it('reconoce una sesion valida', () => {
      expect(estaAutenticado({ cookies: { [COOKIE_SESION]: crearToken() } })).toBe(true);
    });

    it.each([
      ['sin cookies', {}],
      ['con la cookie vacia', { cookies: {} }],
      ['con un token invalido', { cookies: { [COOKIE_SESION]: 'basura' } }]
    ])('rechaza una peticion %s', (_descripcion, req) => {
      expect(estaAutenticado(req)).toBe(false);
    });

    it('rechaza incluso una cookie valida si no hay contrasena configurada', () => {
      const req = { cookies: { [COOKIE_SESION]: crearToken() } };
      delete process.env.ADMIN_PASSWORD;

      expect(estaAutenticado(req)).toBe(false);
    });
  });

  describe('atributos de la cookie', () => {
    it('la marca httpOnly y SameSite=Strict', () => {
      const cookie = cookieDeSesion('token');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
    });

    it('no exige Secure fuera de produccion, para no romper localhost', () => {
      expect(cookieDeSesion('token')).not.toContain('Secure');
    });

    it('la cookie de cierre vence de inmediato', () => {
      expect(cookieDeCierre()).toContain('Max-Age=0');
    });
  });

  describe('proteccion de las rutas', () => {
    function crearRes() {
      return {
        statusCode: null,
        body: null,
        status(codigo) { this.statusCode = codigo; return this; },
        json(payload) { this.body = payload; return this; }
      };
    }

    it('deja pasar una peticion con sesion valida', async () => {
      const interna = vi.fn((req, res) => res.status(200).json({ ok: true }));
      const res = crearRes();

      await soloAdmin(interna)({ cookies: { [COOKIE_SESION]: crearToken() } }, res);

      expect(interna).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    it('responde 401 y no ejecuta la ruta sin sesion', async () => {
      const interna = vi.fn();
      const res = crearRes();

      await soloAdmin(interna)({ cookies: {} }, res);

      expect(interna).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('responde 503 si falta ADMIN_PASSWORD, en vez de quedar abierto', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const interna = vi.fn();
      const res = crearRes();
      delete process.env.ADMIN_PASSWORD;

      await soloAdmin(interna)({ cookies: {} }, res);

      expect(interna).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(503);
    });
  });
});
