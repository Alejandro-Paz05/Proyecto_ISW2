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

import handler from '@/pages/api/categories';

const CATEGORIAS = [
  { key: 'unas', label: 'Uñas' },
  { key: 'pestanas', label: 'Pestañas' },
  { key: 'accesorios', label: 'Accesorios' }
];

describe('GET /api/categories', () => {
  beforeEach(() => {
    from.mockClear();
    order.mockReset();
    order.mockResolvedValue({ data: CATEGORIAS, error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rechaza cualquier metodo que no sea GET', async () => {
    const res = await llamar(handler, { method: 'POST' });

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });

  it('devuelve las categorias', async () => {
    const res = await llamar(handler);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(CATEGORIAS);
  });

  it('lee la tabla categories', async () => {
    await llamar(handler);

    expect(from).toHaveBeenCalledWith('categories');
  });

  // El orden de los filtros lo decide la duena con la columna position, no
  // el alfabeto: "Unas" primero aunque empiece con U.
  it('ordena por position y no por nombre', async () => {
    await llamar(handler);

    expect(order).toHaveBeenCalledWith('position', { ascending: true });
  });

  // A diferencia del stock, una categoria cambia una vez cada varios meses.
  it('se cachea en el CDN', async () => {
    const res = await llamar(handler);

    expect(res.headers['Cache-Control']).toMatch(/s-maxage=\d+/);
    expect(res.headers['Cache-Control']).not.toMatch(/no-store/);
  });

  describe('cuando la base falla', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('devuelve 500 sin filtrar el error interno', async () => {
      order.mockResolvedValue({
        data: null,
        error: { message: 'relation "categories" does not exist' }
      });

      const res = await llamar(handler);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Error al obtener categorías');
      expect(res.body.error).not.toMatch(/relation|exist/i);
    });

    it('devuelve 500 si la conexion se cae', async () => {
      order.mockRejectedValue(new Error('fetch failed'));

      const res = await llamar(handler);

      expect(res.statusCode).toBe(500);
    });
  });
});
