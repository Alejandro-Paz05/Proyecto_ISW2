import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  activarAvisos,
  avisosSoportados,
  desactivarAvisos,
  estadoDeAvisos
} from '@/lib/push-navegador';

/**
 * El lado del navegador de los avisos.
 *
 * Todo lo que toca —Notification, PushManager, el service worker— existe solo
 * en un navegador de verdad, así que acá se reemplaza por simulacros. Lo que
 * se verifica es la secuencia: pedir permiso, suscribirse una sola vez,
 * registrar el dispositivo en el servidor, y no dejar nunca una suscripción
 * viva en el navegador que el servidor no conozca.
 */

// Una clave VAPID pública real mide 65 bytes: 0x04 y las dos coordenadas del
// punto de la curva P-256.
const CLAVE = 'BIZDZNNMfkKb-FDrELeu7lPBAgQ65KkkB7UpJnAK29o-Kw-n-gxsaOsFNjg0R9mNvJJQ5FtMI9s7LZQPz3q3xIc';

const SUSCRIPCION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  toJSON: () => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: 'clave-del-navegador', auth: 'secreto-del-navegador' }
  }),
  unsubscribe: vi.fn(async () => true)
};

let registro;

function conNavegador({ permiso = 'default', suscripcion = null, soportado = true } = {}) {
  registro = {
    pushManager: {
      getSubscription: vi.fn(async () => suscripcion),
      subscribe: vi.fn(async () => SUSCRIPCION)
    }
  };

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: soportado
      ? { ready: Promise.resolve(registro), getRegistration: vi.fn(async () => registro) }
      : undefined
  });

  if (soportado) {
    window.PushManager = function PushManager() {};
    window.Notification = { permission: permiso, requestPermission: vi.fn(async () => 'granted') };
  } else {
    delete window.PushManager;
    delete window.Notification;
  }

  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = CLAVE;
}

describe('avisos en el navegador', () => {
  beforeEach(() => {
    conNavegador();
    SUSCRIPCION.unsubscribe.mockClear();
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    vi.restoreAllMocks();
  });

  describe('avisosSoportados', () => {
    it('es cierto con todas las piezas en su lugar', () => {
      expect(avisosSoportados()).toBe(true);
    });

    it('es falso sin la clave pública del proyecto', () => {
      delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      expect(avisosSoportados()).toBe(false);
    });

    it('es falso en un navegador sin push', () => {
      conNavegador({ soportado: false });

      expect(avisosSoportados()).toBe(false);
    });
  });

  describe('estadoDeAvisos', () => {
    it('dice no-soportado cuando el navegador no puede', async () => {
      conNavegador({ soportado: false });

      await expect(estadoDeAvisos()).resolves.toBe('no-soportado');
    });

    // Quien dijo que no una vez no vuelve a ver el cartel del navegador: sin
    // este estado la interfaz parecería rota.
    it('distingue bloqueado de inactivo', async () => {
      conNavegador({ permiso: 'denied' });
      await expect(estadoDeAvisos()).resolves.toBe('bloqueado');

      conNavegador({ permiso: 'default' });
      await expect(estadoDeAvisos()).resolves.toBe('inactivos');
    });

    it('dice activos cuando este dispositivo ya está suscrito', async () => {
      conNavegador({ permiso: 'granted', suscripcion: SUSCRIPCION });

      await expect(estadoDeAvisos()).resolves.toBe('activos');
    });
  });

  describe('activarAvisos', () => {
    it('pide permiso, se suscribe y registra el dispositivo', async () => {
      await expect(activarAvisos()).resolves.toBe('activos');

      expect(window.Notification.requestPermission).toHaveBeenCalled();
      expect(registro.pushManager.subscribe).toHaveBeenCalledOnce();

      const [ruta, opciones] = global.fetch.mock.calls[0];
      expect(ruta).toBe('/api/admin/push');
      expect(opciones.method).toBe('POST');

      const cuerpo = JSON.parse(opciones.body);
      expect(cuerpo.endpoint).toBe(SUSCRIPCION.endpoint);
      expect(cuerpo.navegador).toEqual(expect.any(String));
    });

    it('manda la clave del servidor como bytes, que es lo que exige el navegador', async () => {
      await activarAvisos();

      const { applicationServerKey } = registro.pushManager.subscribe.mock.calls[0][0];
      expect(applicationServerKey).toBeInstanceOf(Uint8Array);
      expect(applicationServerKey).toHaveLength(65);
      expect(applicationServerKey[0]).toBe(0x04);
    });

    it('sin permiso no se suscribe a nada', async () => {
      conNavegador();
      window.Notification.requestPermission = vi.fn(async () => 'denied');

      await expect(activarAvisos()).rejects.toThrow(/permiso/i);
      expect(registro.pushManager.subscribe).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('reutiliza la suscripción que este navegador ya tenía', async () => {
      conNavegador({ permiso: 'granted', suscripcion: SUSCRIPCION });

      await activarAvisos();

      expect(registro.pushManager.subscribe).not.toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledOnce();
    });

    // Dejarla viva haría creer que los avisos funcionan cuando el servidor no
    // sabe a dónde mandarlos.
    it('si el servidor no la guarda, deshace la suscripción del navegador', async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: 'Entrá con tu cuenta para activar los avisos.' })
      }));

      await expect(activarAvisos()).rejects.toThrow(/con tu cuenta/i);
      expect(SUSCRIPCION.unsubscribe).toHaveBeenCalledOnce();
    });

    it('en un navegador que no puede, ni lo intenta', async () => {
      conNavegador({ soportado: false });

      await expect(activarAvisos()).rejects.toThrow(/no puede recibir avisos/i);
    });
  });

  describe('desactivarAvisos', () => {
    it('avisa al servidor antes de darse de baja en el navegador', async () => {
      conNavegador({ permiso: 'granted', suscripcion: SUSCRIPCION });
      const orden = [];
      global.fetch = vi.fn(async () => {
        orden.push('servidor');
        return { ok: true, json: async () => ({ ok: true }) };
      });
      SUSCRIPCION.unsubscribe.mockImplementation(async () => {
        orden.push('navegador');
        return true;
      });

      await expect(desactivarAvisos()).resolves.toBe('inactivos');

      expect(orden).toEqual(['servidor', 'navegador']);
      expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
        endpoint: SUSCRIPCION.endpoint
      });
    });

    it('sin suscripción no llama a nadie', async () => {
      await expect(desactivarAvisos()).resolves.toBe('inactivos');

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
