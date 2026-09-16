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

import pedidos from '@/pages/api/cuenta/pedidos';
import perfil from '@/pages/api/cuenta/perfil';

const CUENTA = { id: 'cuenta-de-maria', email: 'maria@ejemplo.com' };

const PEDIDO = {
  id: 4,
  order_number: 'AK-001003',
  total: 360,
  status: 'enviado',
  payment_method: 'efectivo',
  created_at: '2026-09-01T18:00:00Z',
  order_items: [{ product_name: 'Rizador de Pestañas', quantity: 3, price: 120 }],
  order_status_history: [{ status: 'pendiente', changed_at: '2026-09-01T18:00:00Z' }]
};

function responder(respuesta) {
  estado.respuesta = respuesta;
}

function conSesionDeCuenta() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'clave-publicable-de-prueba';
  getUser.mockResolvedValue({ data: { user: CUENTA }, error: null });
  from.mockImplementation(() => {
    estado.cadena = crearCadena(estado.respuesta);
    return estado.cadena;
  });
}

describe('la cuenta de una clienta', () => {
  beforeEach(() => {
    from.mockReset();
    getUser.mockReset();
    reportarError.mockReset();
    estado.cadena = null;
    responder({ data: [PEDIDO], error: null });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.ADMIN_PASSWORD;
    vi.restoreAllMocks();
  });

  describe('GET /api/cuenta/pedidos', () => {
    it('rechaza cualquier método que no sea GET', async () => {
      const res = await llamar(pedidos, { method: 'POST', cookies: {} });

      expect(res.statusCode).toBe(405);
    });

    it('sin sesión no devuelve nada', async () => {
      const res = await llamar(pedidos, { cookies: {} });

      expect(res.statusCode).toBe(401);
      expect(from).not.toHaveBeenCalled();
    });

    // La contraseña compartida no identifica a una persona. Como los pedidos
    // de invitada tienen la cuenta vacía, dejarla pasar le entregaría los
    // pedidos de todas.
    it('la contraseña del panel no sirve para ver pedidos propios', async () => {
      process.env.ADMIN_PASSWORD = 'contrasena-larga-de-prueba';

      const res = await llamar(pedidos, { cookies: { [COOKIE_SESION]: crearToken() } });

      expect(res.statusCode).toBe(401);
      expect(from).not.toHaveBeenCalled();
    });

    it('devuelve solo los pedidos de esa cuenta, con sus líneas', async () => {
      conSesionDeCuenta();

      const res = await llamar(pedidos, { cookies: {} });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([PEDIDO]);
      expect(estado.cadena.eq).toHaveBeenCalledWith('user_id', CUENTA.id);
    });

    it('el más reciente va primero', async () => {
      conSesionDeCuenta();

      await llamar(pedidos, { cookies: {} });

      expect(estado.cadena.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('no se cachea: el estado de un pedido cambia', async () => {
      conSesionDeCuenta();

      const res = await llamar(pedidos, { cookies: {} });

      expect(res.headers['Cache-Control']).toContain('no-store');
    });

    it('si la base falla, responde 500 y abre un ticket del fallo', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      conSesionDeCuenta();
      responder({ data: null, error: { message: 'relation "orders" does not exist' } });

      const res = await llamar(pedidos, { cookies: {} });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).not.toMatch(/relation/);
      expect(reportarError).toHaveBeenCalled();
    });
  });

  describe('PATCH /api/cuenta/perfil', () => {
    beforeEach(() => {
      responder({ data: { id: CUENTA.id, full_name: 'María López', role: 'clienta' }, error: null });
    });

    it('sin sesión no cambia nada', async () => {
      const res = await llamar(perfil, { method: 'PATCH', body: { full_name: 'X' }, cookies: {} });

      expect(res.statusCode).toBe(401);
      expect(from).not.toHaveBeenCalled();
    });

    it('guarda el nombre, sin espacios de más', async () => {
      conSesionDeCuenta();

      const res = await llamar(perfil, {
        method: 'PATCH',
        body: { full_name: '  María López  ' },
        cookies: {}
      });

      expect(res.statusCode).toBe(200);
      expect(estado.cadena.update).toHaveBeenCalledWith({ full_name: 'María López' });
      expect(estado.cadena.eq).toHaveBeenCalledWith('id', CUENTA.id);
    });

    it.each([
      ['un nombre de una letra', 'M'],
      ['un nombre larguísimo', 'x'.repeat(81)],
      ['espacios', '   '],
      ['algo que no es texto', 42]
    ])('rechaza %s con 400', async (_descripcion, full_name) => {
      conSesionDeCuenta();

      const res = await llamar(perfil, { method: 'PATCH', body: { full_name }, cookies: {} });

      expect(res.statusCode).toBe(400);
      expect(from).not.toHaveBeenCalled();
    });

    it('no deja tocar el rol aunque venga en el cuerpo', async () => {
      conSesionDeCuenta();

      await llamar(perfil, {
        method: 'PATCH',
        body: { full_name: 'María López', role: 'admin' },
        cookies: {}
      });

      expect(estado.cadena.update).toHaveBeenCalledWith({ full_name: 'María López' });
    });
  });
});
