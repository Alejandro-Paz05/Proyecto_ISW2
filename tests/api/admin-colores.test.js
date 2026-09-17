import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llamar } from '../helpers/http';
import { crearCadena } from '../helpers/supabase';
import { COOKIE_SESION, crearToken } from '@/lib/admin-auth';

const { from, getUser, reportarError, estado } = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  reportarError: vi.fn(),
  estado: { respuestas: [], cadenas: [] }
}));

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from }) }));
vi.mock('@/lib/errores', () => ({ reportarError }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }));

import colores from '@/pages/api/admin/products/[id]/colores';
import { limpiarCache, tamanoCache } from '@/lib/cache';

const PASSWORD = 'contrasena-de-prueba';

const GUARDADOS = [
  { id: 1, nombre: 'Rojo', hex: '#b3122a', stock: 4, position: 0 },
  { id: 2, nombre: 'Azul', hex: null, stock: 2, position: 1 }
];

/** Cada llamada a `from` devuelve la siguiente respuesta preparada. */
function conRespuestas(...respuestas) {
  estado.respuestas = respuestas;
  estado.cadenas = [];

  from.mockImplementation(() => {
    const cadena = crearCadena(estado.respuestas.shift() ?? { data: null, error: null });
    estado.cadenas.push(cadena);
    return cadena;
  });
}

const guardar = (body, id = '7') =>
  llamar(colores, {
    method: 'PUT',
    body,
    query: { id },
    cookies: { [COOKIE_SESION]: crearToken() }
  });

describe('colores de un producto', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = PASSWORD;
    from.mockReset();
    getUser.mockReset();
    reportarError.mockReset();
    limpiarCache();
    conRespuestas(
      { data: [{ id: 1 }, { id: 2 }], error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: GUARDADOS, error: null }
    );
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
    vi.restoreAllMocks();
  });

  describe('quién puede', () => {
    it('exige sesion', async () => {
      const res = await llamar(colores, { method: 'PUT', body: { colores: [] }, query: { id: '7' } });

      expect(res.statusCode).toBe(401);
      expect(from).not.toHaveBeenCalled();
    });

    it('la cuenta de solo lectura no toca el catalogo', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'clave-de-prueba';
      getUser.mockResolvedValue({ data: { user: { id: 'una-cuenta' } }, error: null });
      from.mockImplementation(() => crearCadena({ data: { role: 'super_admin' }, error: null }));

      const res = await llamar(colores, {
        method: 'PUT',
        body: { colores: [] },
        query: { id: '7' }
      });

      expect(res.statusCode).toBe(403);
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    });

    it('rechaza cualquier metodo que no sea PUT', async () => {
      const res = await llamar(colores, {
        method: 'GET',
        query: { id: '7' },
        cookies: { [COOKIE_SESION]: crearToken() }
      });

      expect(res.statusCode).toBe(405);
      expect(res.headers.Allow).toBe('PUT');
    });
  });

  describe('guardar', () => {
    it('devuelve la lista que quedo', async () => {
      const res = await guardar({ colores: [{ nombre: 'Rojo', stock: 4 }] });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(GUARDADOS);
    });

    it('borra los colores que ya no vienen en la lista', async () => {
      // Existen el 1 y el 2; solo se manda el 1.
      await guardar({ colores: [{ id: 1, nombre: 'Rojo', stock: 4 }] });

      const borrado = estado.cadenas[1];
      expect(borrado.delete).toHaveBeenCalled();
      expect(borrado.in).toHaveBeenCalledWith('id', [2]);
    });

    it('conserva el id de los que siguen, para no huerfanar las ventas viejas', async () => {
      await guardar({ colores: [{ id: 2, nombre: 'Azul', stock: 9 }] });

      const [filas] = estado.cadenas[2].upsert.mock.calls[0];
      expect(filas).toEqual([
        { id: 2, nombre: 'Azul', hex: null, stock: 9, position: 0, product_id: 7 }
      ]);
    });

    it('sin nada que borrar no llama al borrado', async () => {
      conRespuestas(
        { data: [], error: null },
        { data: null, error: null },
        { data: [], error: null }
      );

      await guardar({ colores: [{ nombre: 'Rojo', stock: 1 }] });

      expect(estado.cadenas[1].delete).not.toHaveBeenCalled();
    });

    // El trigger de la base recalcula products.stock, asi que la copia en
    // memoria del catalogo quedo vieja en ese mismo instante.
    it('invalida la cache del catalogo', async () => {
      const { conCache, CLAVE_PRODUCTOS } = await import('@/lib/cache');
      await conCache(CLAVE_PRODUCTOS, 60_000, async () => ['catalogo viejo']);
      expect(tamanoCache()).toBe(1);

      await guardar({ colores: [{ nombre: 'Rojo', stock: 4 }] });

      expect(tamanoCache()).toBe(0);
    });

    it('un producto que ya no existe da 404 y no un 500', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      conRespuestas({ data: [], error: null }, { data: null, error: { code: '23503' } });

      const res = await guardar({ colores: [{ nombre: 'Rojo', stock: 1 }] });

      expect(res.statusCode).toBe(404);
    });

    it('si la base falla, lo reporta y responde 500', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      conRespuestas({ data: null, error: new Error('sin conexión') });

      const res = await guardar({ colores: [] });

      expect(res.statusCode).toBe(500);
      expect(reportarError).toHaveBeenCalledOnce();
    });
  });

  describe('validacion', () => {
    it('rechaza un producto que no es un numero', async () => {
      const res = await guardar({ colores: [] }, 'siete');

      expect(res.statusCode).toBe(400);
      expect(from).not.toHaveBeenCalled();
    });

    it('rechaza una lista invalida antes de tocar la base', async () => {
      const res = await guardar({ colores: [{ nombre: '', stock: 1 }] });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/nombre/i);
      expect(from).not.toHaveBeenCalled();
    });
  });
});
