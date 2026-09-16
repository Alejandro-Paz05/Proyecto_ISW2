import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.mock se eleva por encima de los imports, así que la función espía tiene
// que crearse con vi.hoisted para existir cuando se evalúa la factory.
const { rpc, getUser } = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ rpc })
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser } })
}));

import handler from '@/pages/api/orders';
import { reiniciarLimites } from '@/lib/limite';

const CLIENTE = {
  name: 'María López',
  email: 'maria@ejemplo.com',
  phone: '+504 9999-0000',
  address: 'Tegucigalpa, Colonia Kennedy, casa 12'
};

function crearRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(clave, valor) {
      this.headers[clave] = valor;
      return this;
    },
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function pedir(body, method = 'POST', ip = '203.0.113.7') {
  const res = crearRes();
  await handler({ method, body, headers: { 'x-forwarded-for': ip } }, res);
  return res;
}

const PEDIDO_OK = {
  data: { id: 1, order_number: 'AK-001000', customer_email: 'maria@ejemplo.com', total: 1360 },
  error: null
};

describe('POST /api/orders', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue(PEDIDO_OK);
    getUser.mockReset();
    // El límite por dirección vive en memoria del módulo: sin reiniciarlo, la
    // sexta prueba que crea un pedido recibiría un 429 heredado de la anterior.
    reiniciarLimites();
  });

  describe('metodo HTTP', () => {
    it('rechaza cualquier metodo que no sea POST', async () => {
      const res = await pedir({}, 'GET');

      expect(res.statusCode).toBe(405);
      expect(res.headers.Allow).toBe('POST');
      expect(rpc).not.toHaveBeenCalled();
    });
  });

  describe('validacion del carrito', () => {
    const casos = [
      ['un carrito vacio', []],
      ['algo que no es una lista', 'dos lamparas'],
      ['una cantidad negativa', [{ id: 1, qty: -5 }]],
      ['una cantidad cero', [{ id: 1, qty: 0 }]],
      ['una cantidad decimal', [{ id: 1, qty: 1.5 }]],
      ['un id que no es numero', [{ id: 'uno', qty: 1 }]],
      ['mas de 50 lineas', Array.from({ length: 51 }, (_, i) => ({ id: i + 1, qty: 1 }))]
    ];

    it.each(casos)('rechaza %s', async (_descripcion, items) => {
      const res = await pedir({ customer: CLIENTE, payment: 'efectivo', items });

      expect(res.statusCode).toBe(400);
      expect(rpc).not.toHaveBeenCalled();
    });

    it('no revienta si el cuerpo viene vacio', async () => {
      const res = await pedir(undefined);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('metodo de pago', () => {
    it.each(['efectivo', 'tarjeta', 'transferencia'])('acepta %s', async (payment) => {
      const res = await pedir({ customer: CLIENTE, payment, items: [{ id: 1, qty: 1 }] });

      expect(res.statusCode).toBe(201);
    });

    it.each(['bitcoin', '', undefined, 'EFECTIVO'])('rechaza %s con 400', async (payment) => {
      const res = await pedir({ customer: CLIENTE, payment, items: [{ id: 1, qty: 1 }] });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/pago/i);
      expect(rpc).not.toHaveBeenCalled();
    });
  });

  describe('datos que se le pasan a la base', () => {
    it('descarta el precio, el nombre y el total que manda el cliente', async () => {
      await pedir({
        customer: CLIENTE,
        payment: 'efectivo',
        total: 1,
        items: [{ id: 4, qty: 2, name: 'Gratis', price: 1 }]
      });

      const [, argumentos] = rpc.mock.calls[0];
      expect(argumentos.p_items).toEqual([{ id: 4, qty: 2 }]);
      expect(argumentos).not.toHaveProperty('p_total');
      expect(JSON.stringify(argumentos)).not.toContain('Gratis');
    });

    it('normaliza ids y cantidades que llegan como texto', async () => {
      await pedir({
        customer: CLIENTE,
        payment: 'efectivo',
        items: [{ id: '4', qty: '2' }]
      });

      const [, argumentos] = rpc.mock.calls[0];
      expect(argumentos.p_items).toEqual([{ id: 4, qty: 2 }]);
    });

    it('convierte un cliente ausente en cadenas vacias, para que valide la base', async () => {
      await pedir({ payment: 'efectivo', items: [{ id: 1, qty: 1 }] });

      const [, argumentos] = rpc.mock.calls[0];
      expect(argumentos.p_customer_name).toBe('');
      expect(argumentos.p_customer_email).toBe('');
    });
  });

  describe('errores que devuelve la base', () => {
    // Estos casos ejercitan a propósito la rama de fallo, donde el handler
    // registra el error. Es lo que debe hacer, pero volcarlo en la salida
    // ensucia el informe de la suite.
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('traduce un error de validacion a 400 y muestra su mensaje', async () => {
      rpc.mockResolvedValue({
        data: null,
        error: { code: '22023', message: 'No hay suficiente stock de "Lámpara LED". Solo quedan 1 unidades.' }
      });

      const res = await pedir({ customer: CLIENTE, payment: 'efectivo', items: [{ id: 4, qty: 5 }] });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/Solo quedan 1 unidades/);
    });

    it('traduce un error inesperado a 500 sin filtrar detalles internos', async () => {
      rpc.mockResolvedValue({
        data: null,
        error: { code: '42P01', message: 'relation "orders" does not exist' }
      });

      const res = await pedir({ customer: CLIENTE, payment: 'efectivo', items: [{ id: 1, qty: 1 }] });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Error al procesar el pedido');
      expect(res.body.error).not.toMatch(/relation/);
    });

    it('devuelve 500 si la conexion se cae', async () => {
      rpc.mockRejectedValue(new Error('fetch failed'));

      const res = await pedir({ customer: CLIENTE, payment: 'efectivo', items: [{ id: 1, qty: 1 }] });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Error al procesar el pedido');
    });
  });

  describe('pedido correcto', () => {
    it('responde 201 con el numero de pedido y el total de la base', async () => {
      const res = await pedir({ customer: CLIENTE, payment: 'efectivo', items: [{ id: 4, qty: 2 }] });

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({
        success: true,
        order: { id: 1, order_number: 'AK-001000', customer_email: 'maria@ejemplo.com', total: 1360 }
      });
    });

    it('agrupa las lineas repetidas del mismo producto', async () => {
      await pedir({
        customer: CLIENTE,
        payment: 'efectivo',
        items: [{ id: 4, qty: 1 }, { id: 4, qty: 2 }]
      });

      // La API las pasa tal cual; agruparlas es tarea de create_order, que
      // hace GROUP BY antes de bloquear cada fila de producto.
      const [, argumentos] = rpc.mock.calls[0];
      expect(argumentos.p_items).toEqual([{ id: 4, qty: 1 }, { id: 4, qty: 2 }]);
    });
  });

  describe('la cuenta de quien compra', () => {
    afterEach(() => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    });

    function conCuentas() {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'clave-publicable-de-prueba';
    }

    it('comprar como invitada deja el pedido sin cuenta', async () => {
      await pedir({ customer: CLIENTE, payment: 'efectivo', items: [{ id: 1, qty: 1 }] });

      expect(rpc.mock.calls[0][1].p_user_id).toBeNull();
    });

    it('con sesion iniciada, el pedido queda asociado a esa cuenta', async () => {
      conCuentas();
      getUser.mockResolvedValue({ data: { user: { id: 'cuenta-de-maria' } }, error: null });

      await pedir({ customer: CLIENTE, payment: 'efectivo', items: [{ id: 1, qty: 1 }] });

      expect(rpc.mock.calls[0][1].p_user_id).toBe('cuenta-de-maria');
    });

    // Perder una venta porque no se pudo leer la sesion seria mucho peor que
    // registrarla como de invitada.
    it('si la sesion no se puede leer, el pedido entra igual', async () => {
      conCuentas();
      getUser.mockRejectedValue(new Error('fetch failed'));

      const res = await pedir({ customer: CLIENTE, payment: 'efectivo', items: [{ id: 1, qty: 1 }] });

      expect(res.statusCode).toBe(201);
      expect(rpc.mock.calls[0][1].p_user_id).toBeNull();
    });
  });

  // Acá el abuso no llena una tabla: cada pedido descuenta inventario real, y
  // un script en bucle deja el catálogo en cero.
  describe('limite de pedidos por dispositivo', () => {
    const unPedido = (ip) =>
      pedir({ customer: CLIENTE, payment: 'efectivo', items: [{ id: 1, qty: 1 }] }, 'POST', ip);

    it('corta con 429 despues de cinco pedidos seguidos', async () => {
      for (let i = 0; i < 5; i += 1) {
        expect((await unPedido('198.51.100.20')).statusCode).toBe(201);
      }

      const sexto = await unPedido('198.51.100.20');

      expect(sexto.statusCode).toBe(429);
      expect(sexto.body.error).toMatch(/varios pedidos/i);
      // Lo importante: la base ni se entera, así que no descuenta inventario.
      expect(rpc).toHaveBeenCalledTimes(5);
    });

    it('el limite es por dispositivo y no apaga la tienda entera', async () => {
      for (let i = 0; i < 5; i += 1) await unPedido('198.51.100.20');

      const otraClienta = await unPedido('198.51.100.21');

      expect(otraClienta.statusCode).toBe(201);
    });

    it('un carrito invalido no consume el cupo de nadie', async () => {
      for (let i = 0; i < 6; i += 1) {
        await pedir({ customer: CLIENTE, payment: 'efectivo', items: [] }, 'POST', '198.51.100.22');
      }

      const valido = await unPedido('198.51.100.22');

      expect(valido.statusCode).toBe(201);
    });
  });
});
