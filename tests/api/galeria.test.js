import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llamar } from '../helpers/http';
import { crearCadena } from '../helpers/supabase';

const { from, reportarError, estado } = vi.hoisted(() => ({
  from: vi.fn(),
  reportarError: vi.fn(),
  estado: { respuesta: null }
}));

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock('@/lib/errores', () => ({ reportarError }));

import handler from '@/pages/api/galeria';
import { limpiarCache } from '@/lib/cache';

const FOTOS = [
  { id: 1, imagen: 'https://proyecto.supabase.co/galeria/uno.webp', titulo: 'Laminado de cejas' },
  { id: 2, imagen: 'https://proyecto.supabase.co/galeria/dos.webp', titulo: null }
];

describe('GET /api/galeria', () => {
  beforeEach(() => {
    limpiarCache();
    from.mockReset();
    reportarError.mockReset();
    estado.respuesta = { data: FOTOS, error: null };
    from.mockImplementation(() => crearCadena(estado.respuesta));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rechaza cualquier metodo que no sea GET', async () => {
    const res = await llamar(handler, { method: 'POST' });

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });

  it('devuelve las fotos', async () => {
    const res = await llamar(handler);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(FOTOS);
  });

  // La lección del 2026-09-17: el código sale a producción antes de que la
  // migración se corra a mano, y la portada tiene que seguir abriendo.
  it.each([
    ['la tabla todavía no existe', '42P01'],
    ['PostgREST no la conoce', 'PGRST205']
  ])('responde una galería vacía cuando %s', async (_descripcion, code) => {
    estado.respuesta = { data: null, error: { code, message: 'relation "galeria" does not exist' } };

    const res = await llamar(handler);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
    expect(reportarError).not.toHaveBeenCalled();
  });

  it('un error de verdad sí se reporta y devuelve 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    estado.respuesta = { data: null, error: { code: '42501', message: 'permission denied' } };

    const res = await llamar(handler);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/permission/i);
    expect(reportarError).toHaveBeenCalledOnce();
  });

  it('no consulta la base dos veces seguidas', async () => {
    await llamar(handler);
    await llamar(handler);

    expect(from).toHaveBeenCalledTimes(1);
  });

  // Con las cabeceras de las categorías, la foto que subía la dueña tardaba
  // entre cinco y quince minutos en aparecer y desde afuera se veía como que
  // no se había guardado.
  it('obliga a preguntar antes de servir una copia', async () => {
    const res = await llamar(handler);

    expect(res.headers['Cache-Control']).toMatch(/no-cache/);
    expect(res.headers['Cache-Control']).not.toMatch(/s-maxage/);
    // Con ETag, esa pregunta cuesta un 304 y no la lista entera.
    expect(res.headers.ETag).toBeTruthy();
  });
});
