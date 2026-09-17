import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crearCadena } from '../helpers/supabase';

const { sendNotification, setVapidDetails, from, estado } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
  from: vi.fn(),
  estado: { perfiles: null, suscripciones: null, borradas: null }
}));

vi.mock('web-push', () => ({ default: { sendNotification, setVapidDetails } }));
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from }) }));

import { avisarDePedido, avisoDePedido, olvidarConfiguracion } from '@/lib/push';

const PEDIDO = {
  id: 42,
  order_number: 'AK-001042',
  customer_email: 'maria@ejemplo.com',
  total: 1360
};

const SUSCRIPCION = (id, endpoint) => ({
  id,
  endpoint,
  p256dh: `clave-publica-${id}`,
  auth: `secreto-${id}`
});

function conDatos({ perfiles = [{ id: 'duena-1' }], suscripciones = [] } = {}) {
  estado.perfiles = { data: perfiles, error: null };
  estado.suscripciones = { data: suscripciones, error: null };

  from.mockImplementation((tabla) => {
    if (tabla === 'profiles') return crearCadena(estado.perfiles);

    const cadena = crearCadena(estado.suscripciones);
    estado.borradas = cadena;
    return cadena;
  });
}

describe('avisoDePedido', () => {
  it('dice el número, el total y cuántos productos', () => {
    expect(avisoDePedido(PEDIDO, 3)).toEqual({
      titulo: 'Pedido nuevo · AK-001042',
      cuerpo: 'L 1360.00 · 3 productos',
      url: '/akaristudio/admin',
      etiqueta: 'pedido-AK-001042'
    });
  });

  it('no filtra datos de la clienta, que se leerían en la pantalla bloqueada', () => {
    const texto = JSON.stringify(avisoDePedido({ ...PEDIDO, customer_name: 'María López' }, 1));

    expect(texto).not.toContain('María');
    expect(texto).not.toContain('maria@ejemplo.com');
  });

  it('usa el singular cuando es un solo producto', () => {
    expect(avisoDePedido(PEDIDO, 1).cuerpo).toBe('L 1360.00 · 1 producto');
  });
});

describe('avisarDePedido', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'clave-publica-de-prueba';
    process.env.VAPID_PRIVATE_KEY = 'clave-privada-de-prueba';
    process.env.VAPID_CONTACTO = 'mailto:prueba@ejemplo.com';

    sendNotification.mockReset();
    setVapidDetails.mockReset();
    from.mockReset();
    sendNotification.mockResolvedValue({});
    olvidarConfiguracion();
    conDatos();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_CONTACTO;
    vi.restoreAllMocks();
  });

  it('sin claves VAPID no intenta nada, y no es un error', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    olvidarConfiguracion();

    await expect(avisarDePedido(PEDIDO, 2)).resolves.toEqual({ enviados: 0, borrados: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('manda el aviso a cada dispositivo del personal', async () => {
    conDatos({
      suscripciones: [SUSCRIPCION(1, 'https://push.ejemplo/uno'), SUSCRIPCION(2, 'https://push.ejemplo/dos')]
    });

    const resultado = await avisarDePedido(PEDIDO, 3);

    expect(resultado).toEqual({ enviados: 2, borrados: 0 });
    expect(sendNotification).toHaveBeenCalledTimes(2);

    const [destino, contenido] = sendNotification.mock.calls[0];
    expect(destino).toEqual({
      endpoint: 'https://push.ejemplo/uno',
      keys: { p256dh: 'clave-publica-1', auth: 'secreto-1' }
    });
    expect(JSON.parse(contenido).titulo).toBe('Pedido nuevo · AK-001042');
  });

  it('sin nadie suscrito no llama al servicio de push', async () => {
    conDatos({ suscripciones: [] });

    await avisarDePedido(PEDIDO, 1);

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('sin personal cargado tampoco', async () => {
    conDatos({ perfiles: [] });

    await avisarDePedido(PEDIDO, 1);

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it.each([404, 410])('borra la suscripción que el navegador ya no reconoce (%i)', async (codigo) => {
    conDatos({
      suscripciones: [SUSCRIPCION(1, 'https://push.ejemplo/viva'), SUSCRIPCION(7, 'https://push.ejemplo/muerta')]
    });
    sendNotification.mockImplementation((destino) =>
      destino.endpoint.includes('muerta')
        ? Promise.reject(Object.assign(new Error('gone'), { statusCode: codigo }))
        : Promise.resolve({})
    );

    const resultado = await avisarDePedido(PEDIDO, 1);

    expect(resultado).toEqual({ enviados: 1, borrados: 1 });
    expect(estado.borradas.delete).toHaveBeenCalled();
    expect(estado.borradas.in).toHaveBeenLastCalledWith('id', [7]);
  });

  it('un fallo pasajero no borra nada: el dispositivo sigue existiendo', async () => {
    conDatos({ suscripciones: [SUSCRIPCION(1, 'https://push.ejemplo/uno')] });
    sendNotification.mockRejectedValue(Object.assign(new Error('timeout'), { statusCode: 500 }));

    const resultado = await avisarDePedido(PEDIDO, 1);

    expect(resultado).toEqual({ enviados: 1, borrados: 0 });
    expect(estado.borradas.delete).not.toHaveBeenCalled();
  });

  it('si la base falla, el pedido no se entera', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    from.mockImplementation(() => crearCadena({ data: null, error: new Error('sin conexión') }));

    await expect(avisarDePedido(PEDIDO, 1)).resolves.toEqual({ enviados: 0, borrados: 0 });
  });
});
