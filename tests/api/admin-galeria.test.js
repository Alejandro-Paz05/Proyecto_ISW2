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

import galeria from '@/pages/api/admin/galeria/index';
import { conCache, limpiarCache, tamanoCache, CLAVE_GALERIA } from '@/lib/cache';

const PASSWORD = 'contrasena-de-prueba';
const UNA = 'https://proyecto.supabase.co/storage/v1/object/public/galeria/uno.webp';
const OTRA = 'https://proyecto.supabase.co/storage/v1/object/public/galeria/dos.webp';

const GUARDADAS = [
  { id: 1, imagen: UNA, titulo: 'Laminado de cejas', position: 0 },
  { id: 2, imagen: OTRA, titulo: null, position: 1 }
];

function conRespuestas(...respuestas) {
  estado.respuestas = respuestas;
  estado.cadenas = [];

  from.mockImplementation(() => {
    const cadena = crearCadena(estado.respuestas.shift() ?? { data: null, error: null });
    estado.cadenas.push(cadena);
    return cadena;
  });
}

const conSesion = (extra = {}) => ({ cookies: { [COOKIE_SESION]: crearToken() }, ...extra });

/**
 * La cadena donde se llamó a ese método.
 *
 * Se busca en vez de contar posiciones: cuando no hay nada que borrar, la ruta
 * se saltea esa consulta y todos los índices se corren uno.
 */
const cadenaCon = (metodo) =>
  estado.cadenas.find((cadena) => cadena[metodo].mock.calls.length > 0);
const guardar = (fotos) => llamar(galeria, conSesion({ method: 'PUT', body: { fotos } }));

describe('galería desde el panel', () => {
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
      { data: GUARDADAS, error: null }
    );
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
    vi.restoreAllMocks();
  });

  describe('quién puede', () => {
    it('exige sesion', async () => {
      const res = await llamar(galeria, { method: 'GET' });

      expect(res.statusCode).toBe(401);
      expect(from).not.toHaveBeenCalled();
    });

    it('la cuenta de solo lectura no la edita', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'clave-de-prueba';
      getUser.mockResolvedValue({ data: { user: { id: 'una-cuenta' } }, error: null });
      from.mockImplementation(() => crearCadena({ data: { role: 'super_admin' }, error: null }));

      const res = await llamar(galeria, { method: 'PUT', body: { fotos: [] } });

      expect(res.statusCode).toBe(403);
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    });

    it('rechaza cualquier metodo que no sea GET o PUT', async () => {
      const res = await llamar(galeria, conSesion({ method: 'DELETE' }));

      expect(res.statusCode).toBe(405);
      expect(res.headers.Allow).toBe('GET, PUT');
    });
  });

  describe('listar', () => {
    it('devuelve las fotos en orden y sin cachear', async () => {
      conRespuestas({ data: GUARDADAS, error: null });

      const res = await llamar(galeria, conSesion({ method: 'GET' }));

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(GUARDADAS);
      expect(res.headers['Cache-Control']).toMatch(/no-store/);
    });
  });

  describe('guardar', () => {
    it('borra las fotos que ya no vienen', async () => {
      await guardar([{ id: 1, imagen: UNA, titulo: 'Cejas' }]);

      expect(cadenaCon('delete').in).toHaveBeenCalledWith('id', [2]);
    });

    it('guarda el orden en que quedaron', async () => {
      await guardar([
        { id: 2, imagen: OTRA, titulo: 'Pestañas' },
        { id: 1, imagen: UNA, titulo: 'Cejas' }
      ]);

      const [filas] = cadenaCon('upsert').upsert.mock.calls[0];
      expect(filas).toEqual([
        { id: 2, imagen: OTRA, titulo: 'Pestañas', position: 0 },
        { id: 1, imagen: UNA, titulo: 'Cejas', position: 1 }
      ]);
    });

    it('una foto nueva va sin id, para que la base se lo dé', async () => {
      await guardar([{ imagen: UNA, titulo: '' }]);

      const [filas] = cadenaCon('insert').insert.mock.calls[0];
      expect(filas[0]).not.toHaveProperty('id');
      expect(filas[0].titulo).toBeNull();
    });

    // Le pasó a Alejandro al subir la séptima foto: PostgREST exige que todos
    // los objetos de una misma operación tengan las mismas claves, así que
    // mandar seis con id y una sin id rechazaba la escritura entera.
    it('separa las que ya existían de las nuevas', async () => {
      await guardar([
        { id: 1, imagen: UNA, titulo: 'Cejas' },
        { imagen: OTRA, titulo: 'Recién subida' }
      ]);

      const [actualizadas] = cadenaCon('upsert').upsert.mock.calls[0];
      const [insertadas] = cadenaCon('insert').insert.mock.calls[0];

      expect(actualizadas).toEqual([{ id: 1, imagen: UNA, titulo: 'Cejas', position: 0 }]);
      expect(insertadas).toEqual([{ imagen: OTRA, titulo: 'Recién subida', position: 1 }]);
    });

    // La portada sirve una copia de hasta cinco minutos: sin invalidar, la
    // dueña sube una foto y no la ve.
    it('invalida la copia que sirve la portada', async () => {
      await conCache(CLAVE_GALERIA, 60_000, async () => ['vieja']);
      expect(tamanoCache()).toBe(1);

      await guardar([{ imagen: UNA }]);

      expect(tamanoCache()).toBe(0);
    });

    it('vaciar la galería borra todo y no llama al upsert', async () => {
      await guardar([]);

      expect(cadenaCon('delete')).toBeDefined();
      expect(cadenaCon('upsert')).toBeUndefined();
      expect(cadenaCon('insert')).toBeUndefined();
    });

    it('si la base falla, lo reporta y responde 500', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      conRespuestas({ data: null, error: new Error('sin conexión') });

      const res = await guardar([{ imagen: UNA }]);

      expect(res.statusCode).toBe(500);
      expect(reportarError).toHaveBeenCalledOnce();
    });
  });

  describe('validacion', () => {
    it.each([
      ['algo que no es una lista', 'una foto', /en una lista/i],
      ['una foto sin direccion', [{ titulo: 'Cejas' }], /dirección/i],
      ['una direccion que no es http', [{ imagen: 'javascript:alert(1)' }], /dirección/i],
      ['un titulo larguisimo', [{ imagen: UNA, titulo: 'x'.repeat(81) }], /80 caracteres/i],
      [
        'demasiadas fotos',
        Array.from({ length: 61 }, () => ({ imagen: UNA })),
        /no puede pasar de 60/i
      ]
    ])('rechaza %s sin tocar la base', async (_descripcion, fotos, mensaje) => {
      const res = await guardar(fotos);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(mensaje);
      expect(from).not.toHaveBeenCalled();
    });
  });
});
