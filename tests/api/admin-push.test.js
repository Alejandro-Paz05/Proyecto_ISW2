import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llamar } from '../helpers/http';
import { crearCadena } from '../helpers/supabase';
import { COOKIE_SESION, crearToken } from '@/lib/admin-auth';

const { from, getUser, reportarError, estado } = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  reportarError: vi.fn(),
  estado: { respuesta: null, cadena: null }
}));

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock('@/lib/errores', () => ({ reportarError }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }));

import push from '@/pages/api/admin/push';

const YO = '11111111-1111-4111-8111-111111111111';
const PASSWORD = 'contrasena-de-prueba';

const SUSCRIPCION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'clave-publica-del-navegador', auth: 'secreto-del-navegador' }
};

/** Una petición con cuenta de Supabase y ese rol. */
function conCuenta(rol) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'clave-publicable-de-prueba';
  getUser.mockResolvedValue({ data: { user: { id: YO, email: 'duena@ejemplo.com' } }, error: null });

  let consultasAPerfiles = 0;
  from.mockImplementation((tabla) => {
    if (tabla === 'profiles' && consultasAPerfiles++ === 0) {
      return crearCadena({ data: { role: rol }, error: null });
    }
    estado.cadena = crearCadena(estado.respuesta);
    return estado.cadena;
  });
}

const suscribir = (body = SUSCRIPCION) => llamar(push, { method: 'POST', body });
const darDeBaja = (body) => llamar(push, { method: 'DELETE', body });

describe('avisos push del panel', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = PASSWORD;
    from.mockReset();
    getUser.mockReset();
    reportarError.mockReset();
    estado.cadena = null;
    estado.respuesta = { data: null, error: null };
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    vi.restoreAllMocks();
  });

  describe('quién puede', () => {
    it('exige sesion', async () => {
      const res = await suscribir();

      expect(res.statusCode).toBe(401);
      expect(from).not.toHaveBeenCalled();
    });

    it('la cuenta de solo lectura no suscribe dispositivos', async () => {
      conCuenta('super_admin');

      const res = await suscribir();

      expect(res.statusCode).toBe(403);
    });

    it('con la contrasena compartida no hay cuenta a la que colgar el aviso', async () => {
      const res = await llamar(push, {
        method: 'POST',
        body: SUSCRIPCION,
        cookies: { [COOKIE_SESION]: crearToken() }
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.error).toMatch(/con tu cuenta/i);
    });

    it('rechaza cualquier metodo que no sea POST o DELETE', async () => {
      conCuenta('duena');

      const res = await llamar(push, { method: 'GET' });

      expect(res.statusCode).toBe(405);
      expect(res.headers.Allow).toBe('POST, DELETE');
    });
  });

  describe('alta', () => {
    it('guarda el dispositivo con la cuenta de la sesion', async () => {
      conCuenta('duena');

      const res = await suscribir({ ...SUSCRIPCION, navegador: 'Chrome en Android' });

      expect(res.statusCode).toBe(201);

      const [fila, opciones] = estado.cadena.upsert.mock.calls[0];
      expect(fila).toMatchObject({
        user_id: YO,
        endpoint: SUSCRIPCION.endpoint,
        p256dh: SUSCRIPCION.keys.p256dh,
        auth: SUSCRIPCION.keys.auth,
        navegador: 'Chrome en Android'
      });
      // Reabrir el panel vuelve a suscribir el mismo dispositivo: tiene que
      // actualizar su fila, no duplicarla.
      expect(opciones).toEqual({ onConflict: 'endpoint' });
    });

    it.each([
      ['sin endpoint', { keys: SUSCRIPCION.keys }],
      ['con un endpoint que no es https', { endpoint: 'http://inseguro', keys: SUSCRIPCION.keys }],
      ['sin las claves del navegador', { endpoint: SUSCRIPCION.endpoint }],
      ['con media clave', { endpoint: SUSCRIPCION.endpoint, keys: { p256dh: 'sola' } }],
      ['con un cuerpo vacio', {}]
    ])('rechaza una suscripcion %s', async (_descripcion, body) => {
      conCuenta('duena');

      const res = await suscribir(body);

      expect(res.statusCode).toBe(400);
    });

    it('si la base falla, lo reporta y no miente con un 201', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      conCuenta('duena');
      estado.respuesta = { data: null, error: new Error('sin conexión') };

      const res = await suscribir();

      expect(res.statusCode).toBe(500);
      expect(reportarError).toHaveBeenCalledOnce();
    });
  });

  describe('baja', () => {
    it('borra el dispositivo por su endpoint', async () => {
      conCuenta('duena');

      const res = await darDeBaja({ endpoint: SUSCRIPCION.endpoint });

      expect(res.statusCode).toBe(200);
      expect(estado.cadena.delete).toHaveBeenCalled();
      expect(estado.cadena.eq).toHaveBeenCalledWith('endpoint', SUSCRIPCION.endpoint);
    });

    it('sin endpoint no borra nada', async () => {
      conCuenta('duena');

      const res = await darDeBaja({});

      expect(res.statusCode).toBe(400);
      expect(estado.cadena).toBeNull();
    });
  });
});
