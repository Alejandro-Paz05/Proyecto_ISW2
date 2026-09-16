import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llamar } from '../helpers/http';
import { crearCadena } from '../helpers/supabase';

const { from, getUser, reportarError, estado } = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  reportarError: vi.fn(),
  estado: { respuesta: null, cadena: null }
}));

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock('@/lib/errores', () => ({ reportarError }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }));

import listar from '@/pages/api/admin/feedback/index';
import cambiar from '@/pages/api/admin/feedback/[id]';

const MENSAJE = {
  id: 8,
  kind: 'problema',
  message: 'No me deja pagar con tarjeta',
  contact_email: null,
  page: '/akaristudio/productos',
  status: 'nueva',
  ticket_id: 12,
  created_at: '2026-09-14T18:00:00Z'
};

function responder(respuesta) {
  estado.respuesta = respuesta;
}

function conCuenta(rol) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'clave-publicable-de-prueba';
  getUser.mockResolvedValue({
    data: { user: { id: 'cuenta-1', email: 'duena@ejemplo.com' } },
    error: null
  });

  from.mockImplementation((tabla) => {
    if (tabla === 'profiles') return crearCadena({ data: { role: rol }, error: null });
    estado.cadena = crearCadena(estado.respuesta);
    return estado.cadena;
  });
}

describe('retroalimentación en el panel', () => {
  beforeEach(() => {
    from.mockReset();
    getUser.mockReset();
    reportarError.mockReset();
    responder({ data: [MENSAJE], error: null });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    vi.restoreAllMocks();
  });

  describe('GET /api/admin/feedback', () => {
    it('exige sesión', async () => {
      const res = await llamar(listar, { cookies: {} });

      expect(res.statusCode).toBe(401);
    });

    it('una clienta no lee los mensajes de las demás', async () => {
      conCuenta('clienta');

      const res = await llamar(listar, { cookies: {} });

      expect(res.statusCode).toBe(403);
    });

    // A diferencia de los tickets: esto es lo que dice la clienta sobre su
    // tienda, no trabajo técnico.
    it.each(['duena', 'admin', 'super_admin'])('%s ve los mensajes', async (rol) => {
      conCuenta(rol);

      const res = await llamar(listar, { cookies: {} });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([MENSAJE]);
    });

    it('lo más reciente va primero', async () => {
      conCuenta('duena');

      await llamar(listar, { cookies: {} });

      expect(estado.cadena.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('puede filtrarse por estado', async () => {
      conCuenta('duena');

      await llamar(listar, { cookies: {}, query: { estado: 'nueva' } });

      expect(estado.cadena.eq).toHaveBeenCalledWith('status', 'nueva');
    });

    it('rechaza un estado inventado', async () => {
      conCuenta('duena');

      const res = await llamar(listar, { cookies: {}, query: { estado: 'urgente' } });

      expect(res.statusCode).toBe(400);
    });

    it('si la base falla, responde 500 y abre un ticket del fallo', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      conCuenta('duena');
      responder({ data: null, error: { message: 'relation "feedback" does not exist' } });

      const res = await llamar(listar, { cookies: {} });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).not.toMatch(/relation/);
      expect(reportarError).toHaveBeenCalled();
    });
  });

  describe('PATCH /api/admin/feedback/[id]', () => {
    const PATCH = { method: 'PATCH', query: { id: '8' }, cookies: {} };

    beforeEach(() => {
      responder({ data: { ...MENSAJE, status: 'leida' }, error: null });
    });

    it('marca un mensaje como leído', async () => {
      conCuenta('duena');

      const res = await llamar(cambiar, { ...PATCH, body: { status: 'leida' } });

      expect(res.statusCode).toBe(200);
      expect(estado.cadena.update).toHaveBeenCalledWith({ status: 'leida' });
    });

    it('el super_admin no puede cambiarlos', async () => {
      conCuenta('super_admin');

      const res = await llamar(cambiar, { ...PATCH, body: { status: 'leida' } });

      expect(res.statusCode).toBe(403);
    });

    it.each([
      ['un estado inventado', { status: 'resuelta' }],
      ['un cuerpo vacío', {}]
    ])('rechaza %s con 400', async (_descripcion, body) => {
      conCuenta('duena');

      const res = await llamar(cambiar, { ...PATCH, body });

      expect(res.statusCode).toBe(400);
    });

    it('responde 404 si el mensaje no existe', async () => {
      conCuenta('duena');
      responder({ data: null, error: null });

      const res = await llamar(cambiar, { ...PATCH, body: { status: 'leida' } });

      expect(res.statusCode).toBe(404);
    });
  });
});
