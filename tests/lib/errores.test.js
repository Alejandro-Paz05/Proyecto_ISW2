import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ rpc }) }));

import { normalizarMensaje, lugarDelError, huellaDelError, reportarError } from '@/lib/errores';

describe('normalizarMensaje', () => {
  it.each([
    ['números', 'No existe el pedido 1042', 'No existe el pedido 1043'],
    [
      'ids',
      'Perfil 3f2a1c9e-1111-4222-8333-944455556666 sin rol',
      'Perfil 00000000-aaaa-4bbb-8ccc-dddddddddddd sin rol'
    ],
    ['textos entre comillas', 'No hay stock de "Labial rojo"', 'No hay stock de "Kit de uñas"'],
    [
      'direcciones',
      'Falló https://proyecto.supabase.co/rest/v1/orders?id=1',
      'Falló https://proyecto.supabase.co/rest/v1/products?id=2'
    ]
  ])('iguala mensajes que solo difieren en %s', (_descripcion, uno, otro) => {
    expect(normalizarMensaje(uno)).toBe(normalizarMensaje(otro));
  });

  it('distingue mensajes que son problemas distintos', () => {
    expect(normalizarMensaje('No hay stock')).not.toBe(normalizarMensaje('No hay conexión'));
  });
});

describe('lugarDelError', () => {
  it('toma la función y el archivo del primer marco, sin línea ni columna', () => {
    const pila =
      'TypeError: x is undefined\n' +
      '    at handler (webpack-internal:///./pages/api/orders.js:42:15)\n' +
      '    at otra (otra.js:1:1)';

    expect(lugarDelError(pila)).toBe('handler orders.js');
  });

  it('ignora el hash que Next le pone a los archivos, que cambia en cada despliegue', () => {
    const antes = lugarDelError(
      'Error\n    at Carrito (https://www.alejandropaz.xyz/_next/static/chunks/pages/_app-3f9a1c2b4d5e.js:1:23456)'
    );
    const despues = lugarDelError(
      'Error\n    at Carrito (https://www.alejandropaz.xyz/_next/static/chunks/pages/_app-9e8d7c6b5a4f.js:1:99)'
    );

    expect(antes).toBe('Carrito _app.js');
    expect(despues).toBe(antes);
  });

  it('entiende el formato de pila de Firefox', () => {
    expect(
      lugarDelError('agregar@https://www.alejandropaz.xyz/_next/static/chunks/main-abcdef1234.js:1:500')
    ).toBe('agregar main.js');
  });

  it('marca las funciones anónimas', () => {
    expect(lugarDelError('Error\n    at https://sitio.com/x.js:1:2')).toBe('<anónima> x.js');
  });

  it('no confunde una hora en el mensaje con un marco de la pila', () => {
    expect(lugarDelError('Error: falló at 10:20:30')).toBe('');
  });

  it('sin pila devuelve vacío', () => {
    expect(lugarDelError(undefined)).toBe('');
  });
});

describe('huellaDelError', () => {
  const OCURRENCIA = {
    origen: 'servidor',
    nombre: 'TypeError',
    mensaje: 'No existe el pedido 1042',
    pila: '    at handler (./pages/api/orders.js:42:15)'
  };

  it('es la misma para dos ocurrencias del mismo bug', () => {
    const otra = {
      ...OCURRENCIA,
      mensaje: 'No existe el pedido 77',
      pila: '    at handler (./pages/api/orders.js:50:3)'
    };

    expect(huellaDelError(otra)).toBe(huellaDelError(OCURRENCIA));
  });

  it('cambia si el error salta en otro lugar', () => {
    const otra = { ...OCURRENCIA, pila: '    at listar (./pages/api/products.js:10:1)' };

    expect(huellaDelError(otra)).not.toBe(huellaDelError(OCURRENCIA));
  });

  it('separa el navegador del servidor', () => {
    expect(huellaDelError(OCURRENCIA)).toMatch(/^servidor:[0-9a-f]{16}$/);
    expect(huellaDelError({ ...OCURRENCIA, origen: 'navegador' })).not.toBe(
      huellaDelError(OCURRENCIA)
    );
  });
});

describe('reportarError', () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('abre o suma al ticket con la huella, el título y el contexto', async () => {
    rpc.mockResolvedValue({ data: 7, error: null });

    const huella = await reportarError(new TypeError('No existe el pedido 1042'), {
      ruta: '/api/orders',
      metodo: 'POST'
    });

    const [funcion, argumentos] = rpc.mock.calls[0];
    expect(funcion).toBe('registrar_error');
    expect(argumentos.p_fingerprint).toBe(huella);
    expect(argumentos.p_title).toBe('TypeError: No existe el pedido 1042');
    expect(argumentos.p_context).toEqual({
      origen: 'servidor',
      ruta: '/api/orders',
      metodo: 'POST',
      entorno: 'test'
    });
  });

  it('acepta los errores de Supabase, que no son instancias de Error', async () => {
    rpc.mockResolvedValue({ data: 1, error: null });

    await reportarError({ code: '42P01', message: 'relation "orders" does not exist' });

    expect(rpc.mock.calls[0][1].p_title).toBe('Error: relation "orders" does not exist');
    expect(rpc.mock.calls[0][1].p_detail).toBeNull();
  });

  it('recorta el título a lo que admite la columna', async () => {
    rpc.mockResolvedValue({ data: 1, error: null });

    await reportarError(new Error('x'.repeat(500)));

    expect(rpc.mock.calls[0][1].p_title).toHaveLength(200);
  });

  it('no lanza si registrar_error responde con un error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    await expect(reportarError(new Error('x'))).resolves.toBeNull();
  });

  it('no lanza si Supabase ni siquiera responde', async () => {
    rpc.mockRejectedValue(new Error('fetch failed'));

    await expect(reportarError(new Error('x'))).resolves.toBeNull();
  });

  it('no espera más de dos segundos', async () => {
    vi.useFakeTimers();
    rpc.mockReturnValue(new Promise(() => {}));

    const pendiente = reportarError(new Error('x'));
    await vi.advanceTimersByTimeAsync(2000);

    await expect(pendiente).resolves.toBeNull();
  });
});
