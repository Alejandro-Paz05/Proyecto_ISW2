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

const CATALOGO = [
  { id: 1, name: 'Esmalte en Gel', category: 'unas', price: 180, description: '', image: '', stock: 10 },
  { id: 2, name: 'Lima', category: 'accesorios', price: 40, description: '', image: '', stock: 0 }
];

describe('GET /api/products', () => {
  beforeEach(() => {
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

  // El stock cambia con cada pedido: una respuesta cacheada mostraria
  // disponible algo que ya se vendio.
  it('no se cachea', async () => {
    const res = await llamar(handler);

    expect(res.headers['Cache-Control']).toBe('no-store');
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
