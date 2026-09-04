import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llamar } from '../helpers/http';

const { order, select, from } = vi.hoisted(() => {
  const order = vi.fn();
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  return { order, select, from };
});

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from })
}));

import handler from '@/pages/api/products';
import { limpiarCache } from '@/lib/cache';
import { calcularETag } from '@/lib/respuesta-cacheable';

const CATALOGO = [
  { id: 1, name: 'Esmalte en Gel', category: 'unas', price: 180, description: '', image: '', stock: 10 },
  { id: 2, name: 'Lima', category: 'accesorios', price: 40, description: '', image: '', stock: 0 }
];

describe('GET /api/products', () => {
  beforeEach(() => {
    // La cache vive en el modulo: sin esto, la primera prueba dejaria el
    // catalogo cargado y las demas no llegarian a consultar la base.
    limpiarCache();
    order.mockReset();
    order.mockResolvedValue({ data: CATALOGO, error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rechaza cualquier metodo que no sea GET', async () => {
    const res = await llamar(handler, { method: 'DELETE' });

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });

  it('devuelve el catalogo completo', async () => {
    const res = await llamar(handler);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(CATALOGO);
  });

  it('pide columnas explicitas y no un select de todo', async () => {
    await llamar(handler);

    const columnas = select.mock.calls.at(-1)[0];
    expect(columnas).not.toBe('*');
    for (const campo of ['id', 'name', 'category', 'price', 'stock']) {
      expect(columnas).toContain(campo);
    }
  });

  it('ordena por id, para que el catalogo no baile entre visitas', async () => {
    await llamar(handler);

    expect(order).toHaveBeenCalledWith('id', { ascending: true });
  });

  // El stock cambia con cada pedido: nadie puede servir una copia sin
  // preguntar, y el CDN no debe compartirla entre visitantes distintos.
  it('obliga a revalidar y no se guarda en el CDN', async () => {
    const res = await llamar(handler);

    expect(res.headers['Cache-Control']).toContain('no-cache');
    expect(res.headers['Cache-Control']).toContain('private');
    expect(res.headers['Cache-Control']).not.toContain('s-maxage');
  });

  describe('respuestas condicionales', () => {
    it('devuelve un ETag', async () => {
      const res = await llamar(handler);

      expect(res.headers.ETag).toBe(calcularETag(CATALOGO));
    });

    // Se ahorra el cuerpo, no la consulta: el catalogo se pide igual para
    // saber si cambio.
    it('responde 304 sin cuerpo si el cliente ya tiene esa version', async () => {
      const res = await llamar(handler, {
        headers: { 'if-none-match': calcularETag(CATALOGO) }
      });

      expect(res.statusCode).toBe(304);
      expect(res.body).toBeNull();
    });

    it('responde 200 completo si el catalogo cambio', async () => {
      const res = await llamar(handler, {
        headers: { 'if-none-match': 'W/"de-hace-un-rato"' }
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(CATALOGO);
    });
  });

  describe('cache en memoria', () => {
    it('no consulta la base dos veces seguidas', async () => {
      await llamar(handler);
      await llamar(handler);

      expect(order).toHaveBeenCalledTimes(1);
    });

    it('vuelve a consultar despues de invalidar', async () => {
      const { invalidar, CLAVE_PRODUCTOS } = await import('@/lib/cache');

      await llamar(handler);
      invalidar(CLAVE_PRODUCTOS);
      await llamar(handler);

      expect(order).toHaveBeenCalledTimes(2);
    });
  });

  describe('cuando la base falla', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('devuelve 500 con un mensaje generico', async () => {
      order.mockResolvedValue({ data: null, error: { message: 'permission denied for table products' } });

      const res = await llamar(handler);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Error al obtener productos');
    });

    it('no filtra detalles internos del esquema', async () => {
      order.mockResolvedValue({ data: null, error: { message: 'permission denied for table products' } });

      const res = await llamar(handler);

      expect(res.body.error).not.toMatch(/permission|table/i);
    });

    it('devuelve 500 si la conexion se cae', async () => {
      order.mockRejectedValue(new Error('fetch failed'));

      const res = await llamar(handler);

      expect(res.statusCode).toBe(500);
    });
  });
});
