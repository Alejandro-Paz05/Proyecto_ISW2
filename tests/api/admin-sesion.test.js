import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llamar, crearRes } from '../helpers/http';
import { COOKIE_SESION, tokenEsValido, cookieDeCierre } from '@/lib/admin-auth';

const { signOut, capturado } = vi.hoisted(() => ({
  signOut: vi.fn(),
  capturado: { cookies: null }
}));

// Se guardan las funciones de cookies que recibe el cliente, para que una
// prueba pueda hacer lo que hace Supabase al cerrar sesión: vencer sus cookies.
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url, _clave, opciones) => {
    capturado.cookies = opciones.cookies;
    return { auth: { signOut } };
  }
}));

import login from '@/pages/api/admin/login';
import logout from '@/pages/api/admin/logout';

const PASSWORD = 'contrasena-de-prueba';

describe('sesión del panel', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = PASSWORD;
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
    vi.restoreAllMocks();
  });

  describe('POST /api/admin/login', () => {
    it('rechaza cualquier metodo que no sea POST', async () => {
      const res = await llamar(login, { method: 'GET' });

      expect(res.statusCode).toBe(405);
      expect(res.headers.Allow).toBe('POST');
    });

    it('entrega una cookie de sesion con la contrasena correcta', async () => {
      const res = await llamar(login, { method: 'POST', body: { password: PASSWORD } });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true });

      const cookie = res.headers['Set-Cookie'];
      expect(cookie).toContain(COOKIE_SESION);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
    });

    it('el token entregado es valido', async () => {
      const res = await llamar(login, { method: 'POST', body: { password: PASSWORD } });

      const token = res.headers['Set-Cookie'].split(';')[0].split('=')[1];
      expect(tokenEsValido(token)).toBe(true);
    });

    it.each([
      ['una contrasena incorrecta', { password: 'otra-cosa' }],
      ['una contrasena vacia', { password: '' }],
      ['un cuerpo sin password', {}],
      ['un cuerpo ausente', undefined]
    ])('rechaza %s con 401 y sin cookie', async (_descripcion, body) => {
      const res = await llamar(login, { method: 'POST', body });

      expect(res.statusCode).toBe(401);
      expect(res.headers['Set-Cookie']).toBeUndefined();
    });

    // El retardo encarece probar contrasenas a ciegas contra una ruta que,
    // si no, responderia en milisegundos.
    it('demora la respuesta ante un intento fallido', async () => {
      const inicio = Date.now();
      await llamar(login, { method: 'POST', body: { password: 'incorrecta' } });

      expect(Date.now() - inicio).toBeGreaterThanOrEqual(500);
    });

    it('responde 503 si falta ADMIN_PASSWORD, en vez de dejar entrar', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      delete process.env.ADMIN_PASSWORD;

      const res = await llamar(login, { method: 'POST', body: { password: 'loquesea' } });

      expect(res.statusCode).toBe(503);
      expect(res.headers['Set-Cookie']).toBeUndefined();
    });
  });

  describe('POST /api/admin/logout', () => {
    it('rechaza cualquier metodo que no sea POST', async () => {
      const res = await llamar(logout, { method: 'GET' });

      expect(res.statusCode).toBe(405);
    });

    it('vence la cookie de sesion', async () => {
      const res = await llamar(logout, { method: 'POST' });

      expect(res.statusCode).toBe(200);
      expect(res.headers['Set-Cookie']).toContain('Max-Age=0');
    });

    // Cerrar sesion tiene que funcionar siempre, incluso con un token ya
    // vencido o corrupto: si no, el usuario queda atrapado.
    it('funciona sin sesion previa', async () => {
      const res = await llamar(logout, { method: 'POST', cookies: {} });

      expect(res.statusCode).toBe(200);
    });

    it('funciona con un token invalido', async () => {
      const res = await llamar(logout, {
        method: 'POST',
        cookies: { [COOKIE_SESION]: 'basura' }
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['Set-Cookie']).toContain('Max-Age=0');
    });

    describe('con cuentas configuradas', () => {
      beforeEach(() => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co';
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'clave-publicable-de-prueba';
        signOut.mockReset();
      });

      afterEach(() => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      });

      async function cerrarSesion() {
        const res = crearRes();
        res.getHeader = (clave) => res.headers[clave];
        await logout({ method: 'POST', cookies: {} }, res);
        return res;
      }

      it('cierra también la sesión de Supabase, solo en este dispositivo', async () => {
        signOut.mockResolvedValue({ error: null });

        await cerrarSesion();

        expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
      });

      it('suma la cookie del panel sin pisar las que vence Supabase', async () => {
        signOut.mockImplementation(async () => {
          capturado.cookies.setAll([
            { name: 'sb-sesion', value: '', options: { maxAge: 0, path: '/' } }
          ]);
          return { error: null };
        });

        const res = await cerrarSesion();

        expect(res.headers['Set-Cookie']).toEqual([
          'sb-sesion=; Max-Age=0; Path=/',
          cookieDeCierre()
        ]);
      });

      it('si Supabase no responde, igual borra la cookie del panel', async () => {
        signOut.mockRejectedValue(new Error('fetch failed'));

        const res = await cerrarSesion();

        expect(res.statusCode).toBe(200);
        expect(res.headers['Set-Cookie']).toBe(cookieDeCierre());
      });
    });
  });
});
