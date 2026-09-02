import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llamar } from '../helpers/http';
import { COOKIE_SESION, tokenEsValido } from '@/lib/admin-auth';

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
  });
});
