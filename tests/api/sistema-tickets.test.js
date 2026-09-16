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

import listar from '@/pages/api/sistema/tickets/index';
import cambiar from '@/pages/api/sistema/tickets/[id]';

const TICKET = {
  id: 3,
  source: 'automatico',
  title: 'TypeError: producto is undefined',
  severity: 'media',
  status: 'abierto',
  occurrences: 4
};

/** Lo que responde la tabla tickets en la próxima consulta. */
function responder(respuesta) {
  estado.respuesta = respuesta;
}

/** Una petición con sesión de ese rol. */
function conCuenta(rol) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'clave-publicable-de-prueba';
  getUser.mockResolvedValue({
    data: { user: { id: 'cuenta-1', email: 'admin@ejemplo.com' } },
    error: null
  });

  from.mockImplementation((tabla) => {
    if (tabla === 'profiles') return crearCadena({ data: { role: rol }, error: null });
    estado.cadena = crearCadena(estado.respuesta);
    return estado.cadena;
  });
}

describe('tickets del portal del sistema', () => {
  beforeEach(() => {
    from.mockReset();
    getUser.mockReset();
    reportarError.mockReset();
    responder({ data: [TICKET], error: null });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    vi.restoreAllMocks();
  });

  describe('GET /api/sistema/tickets', () => {
    it('exige sesión', async () => {
      const res = await llamar(listar, { cookies: {} });

      expect(res.statusCode).toBe(401);
      expect(from).not.toHaveBeenCalled();
    });

    it('la dueña no entra: los tickets son trabajo técnico', async () => {
      conCuenta('duena');

      const res = await llamar(listar, { cookies: {} });

      expect(res.statusCode).toBe(403);
    });

    it('por defecto trae solo lo que hay que atender', async () => {
      conCuenta('admin');

      const res = await llamar(listar, { cookies: {} });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([TICKET]);
      expect(estado.cadena.in).toHaveBeenCalledWith('status', ['abierto', 'en_progreso']);
    });

    it('lo último que ocurrió va primero', async () => {
      conCuenta('admin');

      await llamar(listar, { cookies: {} });

      expect(estado.cadena.order).toHaveBeenCalledWith('last_seen_at', { ascending: false });
    });

    it('puede pedirse un estado concreto', async () => {
      conCuenta('admin');

      await llamar(listar, { cookies: {}, query: { estado: 'resuelto' } });

      expect(estado.cadena.eq).toHaveBeenCalledWith('status', 'resuelto');
    });

    it('con todos no filtra nada', async () => {
      conCuenta('admin');

      await llamar(listar, { cookies: {}, query: { estado: 'todos' } });

      expect(estado.cadena.in).not.toHaveBeenCalled();
      expect(estado.cadena.eq).not.toHaveBeenCalled();
    });

    it('rechaza un estado inventado', async () => {
      conCuenta('admin');

      const res = await llamar(listar, { cookies: {}, query: { estado: 'urgentisimo' } });

      expect(res.statusCode).toBe(400);
    });

    it('no se cachea: el portal muestra el estado real', async () => {
      conCuenta('admin');

      const res = await llamar(listar, { cookies: {} });

      expect(res.headers['Cache-Control']).toContain('no-store');
    });

    it('si la base falla, responde 500 y abre un ticket del fallo', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      conCuenta('admin');
      responder({ data: null, error: { message: 'relation "tickets" does not exist' } });

      const res = await llamar(listar, { cookies: {} });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).not.toMatch(/relation/);
      expect(reportarError).toHaveBeenCalled();
    });
  });

  describe('PATCH /api/sistema/tickets/[id]', () => {
    const PATCH = { method: 'PATCH', query: { id: '3' }, cookies: {} };

    beforeEach(() => {
      responder({ data: { ...TICKET, status: 'resuelto' }, error: null });
    });

    it('cambia el estado y la nota de resolución', async () => {
      conCuenta('admin');

      const res = await llamar(cambiar, {
        ...PATCH,
        body: { status: 'resuelto', resolution: '  Corregido en el commit abc123  ' }
      });

      expect(res.statusCode).toBe(200);
      expect(estado.cadena.update).toHaveBeenCalledWith({
        status: 'resuelto',
        resolution: 'Corregido en el commit abc123'
      });
    });

    it('una nota vacía borra la que había', async () => {
      conCuenta('admin');

      await llamar(cambiar, { ...PATCH, body: { resolution: '   ' } });

      expect(estado.cadena.update).toHaveBeenCalledWith({ resolution: null });
    });

    it('el super_admin puede mirar pero no tocar', async () => {
      conCuenta('super_admin');

      const res = await llamar(cambiar, { ...PATCH, body: { status: 'resuelto' } });

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/solo lectura/);
    });

    it.each([
      ['un estado inventado', { status: 'medio_resuelto' }],
      ['una severidad inventada', { severity: 'apocaliptica' }],
      ['una nota larguísima', { resolution: 'x'.repeat(2001) }],
      ['un cuerpo sin cambios', {}]
    ])('rechaza %s con 400', async (_descripcion, body) => {
      conCuenta('admin');

      const res = await llamar(cambiar, { ...PATCH, body });

      expect(res.statusCode).toBe(400);
    });

    it('rechaza un id que no es un número', async () => {
      conCuenta('admin');

      const res = await llamar(cambiar, {
        ...PATCH,
        query: { id: 'abc' },
        body: { status: 'resuelto' }
      });

      expect(res.statusCode).toBe(400);
    });

    it('responde 404 si el ticket no existe', async () => {
      conCuenta('admin');
      responder({ data: null, error: null });

      const res = await llamar(cambiar, { ...PATCH, body: { status: 'resuelto' } });

      expect(res.statusCode).toBe(404);
    });

    // El índice único admite un solo ticket abierto por huella: reabrir uno
    // viejo cuando el error ya abrió otro choca contra esa regla.
    it('explica el choque al reabrir un ticket cuyo error ya abrió otro', async () => {
      conCuenta('admin');
      responder({ data: null, error: { code: '23505', message: 'duplicate key value' } });

      const res = await llamar(cambiar, { ...PATCH, body: { status: 'abierto' } });

      expect(res.statusCode).toBe(409);
      expect(res.body.error).toMatch(/otro ticket abierto/i);
    });
  });
});
