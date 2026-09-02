import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llamar } from '../helpers/http';
import { crearCadena } from '../helpers/supabase';
import { COOKIE_SESION, crearToken } from '@/lib/admin-auth';

const { from, estado } = vi.hoisted(() => ({
  from: vi.fn(),
  estado: { resultado: null }
}));

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from })
}));

import listar from '@/pages/api/admin/orders/index';
import cambiarEstado from '@/pages/api/admin/orders/[id]';

const PASSWORD = 'contrasena-de-prueba';

const PEDIDO = {
  id: 4,
  order_number: 'AK-001003',
  customer_name: 'Sofía Reyes',
  customer_email: 'sofia@ejemplo.com',
  customer_phone: '+504 3311-2200',
  customer_address: 'San Pedro Sula',
  payment_method: 'efectivo',
  total: 360,
  status: 'pendiente',
  created_at: '2026-09-01T18:00:00Z',
  order_items: [{ product_name: 'Rizador de Pestañas', quantity: 3, price: 120 }]
};

function responder(resultado) {
  estado.resultado = resultado;
  from.mockImplementation(() => crearCadena(resultado));
}

/** Petición con sesión válida del panel. */
function conSesion(extra = {}) {
  return { cookies: { [COOKIE_SESION]: crearToken() }, ...extra };
}

describe('rutas de pedidos del panel', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = PASSWORD;
    from.mockReset();
    responder({ data: [PEDIDO], error: null });
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
    vi.restoreAllMocks();
  });

  describe('GET /api/admin/orders', () => {
    it('exige sesion', async () => {
      const res = await llamar(listar, { cookies: {} });

      expect(res.statusCode).toBe(401);
      expect(from).not.toHaveBeenCalled();
    });

    it('rechaza una cookie falsificada', async () => {
      const res = await llamar(listar, { cookies: { [COOKIE_SESION]: 'aaa.bbb' } });

      expect(res.statusCode).toBe(401);
    });

    it('devuelve los pedidos con sesion valida', async () => {
      const res = await llamar(listar, conSesion());

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([PEDIDO]);
    });

    it('trae los items anidados, para no consultar uno por pedido', async () => {
      const res = await llamar(listar, conSesion());

      expect(res.body[0].order_items).toHaveLength(1);
    });

    it('rechaza cualquier metodo que no sea GET', async () => {
      const res = await llamar(listar, conSesion({ method: 'POST' }));

      expect(res.statusCode).toBe(405);
      expect(res.headers.Allow).toBe('GET');
    });

    it('no se cachea: el estado de los pedidos cambia', async () => {
      const res = await llamar(listar, conSesion());

      expect(res.headers['Cache-Control']).toBe('no-store');
    });

    it('devuelve 500 sin filtrar detalles si la base falla', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      responder({ data: null, error: { message: 'relation "orders" does not exist' } });

      const res = await llamar(listar, conSesion());

      expect(res.statusCode).toBe(500);
      expect(res.body.error).not.toMatch(/relation/);
    });
  });

  describe('PATCH /api/admin/orders/[id]', () => {
    beforeEach(() => {
      responder({ data: { id: 4, order_number: 'AK-001003', status: 'confirmado' }, error: null });
    });

    it('exige sesion', async () => {
      const res = await llamar(cambiarEstado, {
        method: 'PATCH',
        query: { id: '4' },
        body: { status: 'confirmado' },
        cookies: {}
      });

      expect(res.statusCode).toBe(401);
    });

    it('cambia el estado', async () => {
      const res = await llamar(
        cambiarEstado,
        conSesion({ method: 'PATCH', query: { id: '4' }, body: { status: 'confirmado' } })
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('confirmado');
    });

    it.each(['pendiente', 'confirmado', 'enviado', 'entregado', 'cancelado'])(
      'acepta el estado %s',
      async (status) => {
        const res = await llamar(
          cambiarEstado,
          conSesion({ method: 'PATCH', query: { id: '4' }, body: { status } })
        );

        expect(res.statusCode).toBe(200);
      }
    );

    // Los estados validos son los mismos que acepta la restriccion CHECK de
    // la base: si no coincidieran, el error llegaria como 500.
    it.each([['inventado', 'pizza'], ['vacio', ''], ['ausente', undefined]])(
      'rechaza un estado %s con 400',
      async (_descripcion, status) => {
        const res = await llamar(
          cambiarEstado,
          conSesion({ method: 'PATCH', query: { id: '4' }, body: { status } })
        );

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/estado/i);
      }
    );

    it.each([['no numerico', 'abc'], ['negativo', '-1'], ['cero', '0']])(
      'rechaza un id %s con 400',
      async (_descripcion, id) => {
        const res = await llamar(
          cambiarEstado,
          conSesion({ method: 'PATCH', query: { id }, body: { status: 'enviado' } })
        );

        expect(res.statusCode).toBe(400);
      }
    );

    it('devuelve 404 si el pedido no existe', async () => {
      responder({ data: null, error: null });

      const res = await llamar(
        cambiarEstado,
        conSesion({ method: 'PATCH', query: { id: '9999' }, body: { status: 'enviado' } })
      );

      expect(res.statusCode).toBe(404);
    });

    it('rechaza cualquier metodo que no sea PATCH', async () => {
      const res = await llamar(cambiarEstado, conSesion({ method: 'DELETE', query: { id: '4' } }));

      expect(res.statusCode).toBe(405);
      expect(res.headers.Allow).toBe('PATCH');
    });
  });
});
