import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llamar } from '../helpers/http';
import { crearCadena } from '../helpers/supabase';
import { COOKIE_SESION, crearToken } from '@/lib/admin-auth';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from })
}));

import catalogo from '@/pages/api/admin/products/index';
import producto from '@/pages/api/admin/products/[id]';

const PASSWORD = 'contrasena-de-prueba';

const PRODUCTO = {
  id: 7,
  name: 'Esmalte en Gel',
  category: 'unas',
  price: 180,
  description: 'Larga duración.',
  image: 'https://ejemplo.com/foto.jpg',
  stock: 10,
  created_at: '2026-09-01T18:00:00Z'
};

const VALIDO = {
  name: 'Esmalte en Gel',
  category: 'unas',
  price: 180,
  stock: 10,
  description: 'Larga duración.',
  image: 'https://ejemplo.com/foto.jpg'
};

function responder(resultado) {
  from.mockImplementation(() => crearCadena(resultado));
}

function conSesion(extra = {}) {
  return { cookies: { [COOKIE_SESION]: crearToken() }, ...extra };
}

describe('rutas de productos del panel', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = PASSWORD;
    from.mockReset();
    responder({ data: PRODUCTO, error: null });
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
    vi.restoreAllMocks();
  });

  describe('listar y crear', () => {
    it('exige sesion para listar', async () => {
      const res = await llamar(catalogo, { cookies: {} });

      expect(res.statusCode).toBe(401);
      expect(from).not.toHaveBeenCalled();
    });

    it('exige sesion para crear', async () => {
      const res = await llamar(catalogo, { method: 'POST', body: VALIDO, cookies: {} });

      expect(res.statusCode).toBe(401);
      expect(from).not.toHaveBeenCalled();
    });

    it('lista el catalogo', async () => {
      responder({ data: [PRODUCTO], error: null });

      const res = await llamar(catalogo, conSesion());

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([PRODUCTO]);
      expect(res.headers['Cache-Control']).toContain('no-store');
    });

    it('crea un producto y responde 201', async () => {
      const res = await llamar(catalogo, conSesion({ method: 'POST', body: VALIDO }));

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(PRODUCTO);
    });

    it.each([
      ['sin nombre', { ...VALIDO, name: '  ' }],
      ['con categoria inventada', { ...VALIDO, category: 'perfumes' }],
      ['con precio negativo', { ...VALIDO, price: -1 }],
      ['con stock decimal', { ...VALIDO, stock: 2.5 }],
      ['con una imagen javascript:', { ...VALIDO, image: 'javascript:alert(1)' }]
    ])('rechaza crear %s antes de tocar la base', async (_descripcion, body) => {
      const res = await llamar(catalogo, conSesion({ method: 'POST', body }));

      expect(res.statusCode).toBe(400);
      expect(from).not.toHaveBeenCalled();
    });

    it('rechaza metodos no permitidos', async () => {
      const res = await llamar(catalogo, conSesion({ method: 'DELETE' }));

      expect(res.statusCode).toBe(405);
      expect(res.headers.Allow).toBe('GET, POST');
    });

    it('devuelve 500 sin filtrar detalles si la base falla al crear', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      responder({ data: null, error: { message: 'duplicate key value violates unique constraint' } });

      const res = await llamar(catalogo, conSesion({ method: 'POST', body: VALIDO }));

      expect(res.statusCode).toBe(500);
      expect(res.body.error).not.toMatch(/constraint/i);
    });
  });

  describe('editar y eliminar', () => {
    it('exige sesion', async () => {
      const res = await llamar(producto, {
        method: 'PATCH',
        query: { id: '7' },
        body: { stock: 3 },
        cookies: {}
      });

      expect(res.statusCode).toBe(401);
    });

    it('edita solo el campo enviado', async () => {
      const res = await llamar(
        producto,
        conSesion({ method: 'PATCH', query: { id: '7' }, body: { stock: 3 } })
      );

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(PRODUCTO);
    });

    it('rechaza una edicion sin ningun campo', async () => {
      const res = await llamar(
        producto,
        conSesion({ method: 'PATCH', query: { id: '7' }, body: {} })
      );

      expect(res.statusCode).toBe(400);
    });

    it('sigue validando los campos que si vienen', async () => {
      const res = await llamar(
        producto,
        conSesion({ method: 'PATCH', query: { id: '7' }, body: { price: -5 } })
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/precio/i);
    });

    it('devuelve 404 al editar un producto inexistente', async () => {
      responder({ data: null, error: null });

      const res = await llamar(
        producto,
        conSesion({ method: 'PATCH', query: { id: '9999' }, body: { stock: 1 } })
      );

      expect(res.statusCode).toBe(404);
    });

    it('elimina un producto', async () => {
      responder({ data: { id: 7 }, error: null });

      const res = await llamar(producto, conSesion({ method: 'DELETE', query: { id: '7' } }));

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true, id: 7 });
    });

    it('devuelve 404 al eliminar dos veces', async () => {
      responder({ data: null, error: null });

      const res = await llamar(producto, conSesion({ method: 'DELETE', query: { id: '7' } }));

      expect(res.statusCode).toBe(404);
    });

    it.each([['no numerico', 'abc'], ['negativo', '-3'], ['cero', '0']])(
      'rechaza un id %s con 400',
      async (_descripcion, id) => {
        const res = await llamar(producto, conSesion({ method: 'DELETE', query: { id } }));

        expect(res.statusCode).toBe(400);
      }
    );

    it('rechaza metodos no permitidos', async () => {
      const res = await llamar(producto, conSesion({ method: 'POST', query: { id: '7' } }));

      expect(res.statusCode).toBe(405);
      expect(res.headers.Allow).toBe('PATCH, DELETE');
    });
  });

  // La clave foranea products.category -> categories.key solo puede saltar si
  // el espejo de lib/categorias.js quedo desfasado de la tabla, porque
  // validarProducto ya filtro contra el espejo. Cuando pasa, un 500 generico
  // manda a leer logs de servidor por algo que se arregla con una fila.
  describe('cuando la categoria no existe en la base', () => {
    const VIOLACION_FK = {
      code: '23503',
      message: 'insert or update on table "products" violates foreign key constraint'
    };

    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      responder({ data: null, error: VIOLACION_FK });
    });

    it('responde 400 al crear, no 500', async () => {
      const res = await llamar(catalogo, conSesion({ method: 'POST', body: VALIDO }));

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/categoría/i);
    });

    it('responde 400 al editar, no 500', async () => {
      const res = await llamar(
        producto,
        conSesion({ method: 'PATCH', query: { id: '7' }, body: { category: 'unas' } })
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/categoría/i);
    });

    it('no expone el texto de la restriccion', async () => {
      const res = await llamar(catalogo, conSesion({ method: 'POST', body: VALIDO }));

      expect(res.body.error).not.toMatch(/constraint|foreign key/i);
    });
  });
});
