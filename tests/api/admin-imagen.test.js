import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llamar } from '../helpers/http';
import { crearCadena } from '../helpers/supabase';
import { COOKIE_SESION, crearToken } from '@/lib/admin-auth';
import { LIMITE_DE_BYTES } from '@/lib/imagen';

const { from, upload, getPublicUrl, getUser, reportarError, almacenPedido } = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  getUser: vi.fn(),
  reportarError: vi.fn(),
  almacenPedido: { bucket: null }
}));

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from,
    storage: {
      from: (bucket) => {
        almacenPedido.bucket = bucket;
        return { upload, getPublicUrl };
      }
    }
  })
}));
vi.mock('@/lib/errores', () => ({ reportarError }));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }));

import imagen from '@/pages/api/admin/products/imagen';

const PASSWORD = 'contrasena-de-prueba';
const URL_PUBLICA =
  'https://proyecto.supabase.co/storage/v1/object/public/productos/foto.png';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Un archivo con esa firma y el peso pedido. */
function archivo(firma, bytes = 64) {
  const datos = Buffer.alloc(bytes);
  datos.set(firma, 0);
  return datos;
}

/** Una petición con la contraseña del panel, que entra como dueña. */
function comoDuena(extra = {}) {
  return { cookies: { [COOKIE_SESION]: crearToken() }, ...extra };
}

/** Una petición con cuenta de Supabase y el rol que se le pase. */
function conCuenta(rol) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'clave-publicable-de-prueba';
  getUser.mockResolvedValue({
    data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
    error: null
  });
  from.mockImplementation(() => crearCadena({ data: { role: rol }, error: null }));
}

describe('subir la imagen de un producto', () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = PASSWORD;
    from.mockReset();
    getUser.mockReset();
    upload.mockReset();
    getPublicUrl.mockReset();
    reportarError.mockReset();
    almacenPedido.bucket = null;

    upload.mockResolvedValue({ data: { path: 'foto.png' }, error: null });
    getPublicUrl.mockReturnValue({ data: { publicUrl: URL_PUBLICA } });
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    vi.restoreAllMocks();
  });

  describe('quién puede subir', () => {
    it('exige sesion', async () => {
      const res = await llamar(imagen, { method: 'POST', cuerpoCrudo: archivo(PNG) });

      expect(res.statusCode).toBe(401);
      expect(upload).not.toHaveBeenCalled();
    });

    it('una cuenta de solo lectura no sube nada', async () => {
      conCuenta('super_admin');

      const res = await llamar(imagen, { method: 'POST', cuerpoCrudo: archivo(PNG) });

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/solo lectura/i);
      expect(upload).not.toHaveBeenCalled();
    });

    it('rechaza cualquier metodo que no sea POST', async () => {
      const res = await llamar(imagen, comoDuena({ method: 'GET' }));

      expect(res.statusCode).toBe(405);
      expect(res.headers.Allow).toBe('POST');
    });
  });

  describe('qué acepta', () => {
    it('guarda un PNG y devuelve su direccion publica', async () => {
      const res = await llamar(
        imagen,
        comoDuena({ method: 'POST', cuerpoCrudo: archivo(PNG, 2048) })
      );

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ url: URL_PUBLICA });
      expect(almacenPedido.bucket).toBe('productos');

      const [ruta, datos, opciones] = upload.mock.calls[0];
      expect(ruta).toMatch(/^[0-9a-f-]{36}\.png$/);
      expect(datos).toHaveLength(2048);
      expect(opciones.contentType).toBe('image/png');
    });

    it('el nombre no repite el del archivo que llego', async () => {
      await llamar(
        imagen,
        comoDuena({
          method: 'POST',
          cuerpoCrudo: archivo(PNG),
          headers: { 'content-disposition': 'attachment; filename="mi foto.png"' }
        })
      );
      await llamar(imagen, comoDuena({ method: 'POST', cuerpoCrudo: archivo(PNG) }));

      const [primera] = upload.mock.calls[0];
      const [segunda] = upload.mock.calls[1];

      expect(primera).not.toContain('mi foto');
      expect(primera).not.toBe(segunda);
    });

    it('junta los trozos en los que llega el archivo', async () => {
      const res = await llamar(
        imagen,
        comoDuena({
          method: 'POST',
          cuerpoCrudo: [Buffer.from(PNG), Buffer.alloc(100), Buffer.alloc(56)]
        })
      );

      expect(res.statusCode).toBe(201);
      expect(upload.mock.calls[0][1]).toHaveLength(164);
    });

    it('rechaza lo que no es una imagen aunque diga serlo', async () => {
      const res = await llamar(
        imagen,
        comoDuena({
          method: 'POST',
          cuerpoCrudo: Buffer.from('<svg onload="robar()"></svg>'),
          headers: { 'content-type': 'image/png' }
        })
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/PNG, JPG o WebP/);
      expect(upload).not.toHaveBeenCalled();
    });
  });

  describe('peso', () => {
    it('rechaza sin leer nada cuando la cabecera ya dice que se pasa', async () => {
      const res = await llamar(
        imagen,
        comoDuena({
          method: 'POST',
          cuerpoCrudo: archivo(PNG),
          headers: { 'content-length': String(LIMITE_DE_BYTES + 1) }
        })
      );

      expect(res.statusCode).toBe(413);
      expect(res.body.error).toContain('3.0 MB');
      expect(upload).not.toHaveBeenCalled();
    });

    it('corta la subida cuando el archivo se pasa del limite en el camino', async () => {
      const megabyte = Buffer.alloc(1024 * 1024);

      const res = await llamar(
        imagen,
        comoDuena({
          method: 'POST',
          // La cabecera miente: dice que pesa poco y manda cuatro megas.
          headers: { 'content-length': '2048' },
          cuerpoCrudo: [Buffer.concat([Buffer.from(PNG), megabyte]), megabyte, megabyte, megabyte]
        })
      );

      expect(res.statusCode).toBe(413);
      expect(upload).not.toHaveBeenCalled();
    });

    it('acepta un archivo justo en el limite', async () => {
      const res = await llamar(
        imagen,
        comoDuena({ method: 'POST', cuerpoCrudo: archivo(PNG, LIMITE_DE_BYTES) })
      );

      expect(res.statusCode).toBe(201);
    });
  });

  describe('cuando el almacen falla', () => {
    it('responde 500, lo reporta y no inventa una direccion', async () => {
      upload.mockResolvedValue({ data: null, error: new Error('se cayó la conexión') });

      const res = await llamar(imagen, comoDuena({ method: 'POST', cuerpoCrudo: archivo(PNG) }));

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toMatch(/No se pudo guardar la imagen/);
      expect(getPublicUrl).not.toHaveBeenCalled();
      expect(reportarError).toHaveBeenCalledOnce();
    });

    // Le pasó a Alejandro con la galería: subió una foto antes de correr la
    // migración y el mensaje solo decía "No se pudo guardar la imagen", que no
    // alcanza para saber que falta crear el bucket.
    it('si el bucket no existe, lo dice en vez de dejarlo adivinando', async () => {
      upload.mockResolvedValue({ data: null, error: new Error('Bucket not found') });

      const res = await llamar(imagen, comoDuena({ method: 'POST', cuerpoCrudo: archivo(PNG) }));

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toMatch(/bucket "productos"/i);
      expect(res.body.error).toMatch(/migración/i);
    });
  });
});
