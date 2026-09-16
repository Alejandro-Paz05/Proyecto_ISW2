import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * La captura de errores del navegador.
 *
 * El módulo recuerda qué ya mandó, así que cada prueba lo vuelve a importar
 * en limpio: si no, la segunda prueba con el mismo mensaje no enviaría nada.
 */

let capturar;
let sendBeacon;
let fetchSimulado;

/** Lo que viajó en el cuerpo del beacon. */
async function cuerpoDelBeacon(llamada = 0) {
  const [, blob] = sendBeacon.mock.calls[llamada];
  return JSON.parse(await blob.text());
}

beforeEach(async () => {
  vi.resetModules();

  sendBeacon = vi.fn(() => true);
  navigator.sendBeacon = sendBeacon;

  fetchSimulado = vi.fn(() => Promise.resolve({ ok: true }));
  global.fetch = fetchSimulado;

  capturar = await import('@/lib/capturar-errores');
});

afterEach(() => {
  vi.restoreAllMocks();
  delete navigator.sendBeacon;
});

describe('reportarErrorDelNavegador', () => {
  it('manda el error a /api/errores con la ruta de la página', async () => {
    capturar.reportarErrorDelNavegador(new TypeError('producto is undefined'));

    const [ruta] = sendBeacon.mock.calls[0];
    expect(ruta).toBe('/api/errores');

    const cuerpo = await cuerpoDelBeacon();
    expect(cuerpo).toMatchObject({
      tipo: 'error',
      nombre: 'TypeError',
      mensaje: 'producto is undefined',
      ruta: window.location.pathname
    });
    expect(cuerpo.pila).toContain('TypeError');
  });

  // Un error dentro de un bucle de render dispararía cientos de envíos
  // idénticos; la base igual los agruparía en un solo ticket.
  it('manda una sola vez el mismo error por carga de página', () => {
    capturar.reportarErrorDelNavegador(new Error('el mismo'));
    capturar.reportarErrorDelNavegador(new Error('el mismo'));

    expect(sendBeacon).toHaveBeenCalledOnce();
  });

  it('distingue dos errores distintos', () => {
    capturar.reportarErrorDelNavegador(new Error('uno'));
    capturar.reportarErrorDelNavegador(new Error('otro'));

    expect(sendBeacon).toHaveBeenCalledTimes(2);
  });

  it('acepta algo que no es un Error', async () => {
    capturar.reportarErrorDelNavegador('se rompió algo', 'promesa');

    expect(await cuerpoDelBeacon()).toMatchObject({
      tipo: 'promesa',
      nombre: 'Error',
      mensaje: 'se rompió algo',
      pila: ''
    });
  });

  it('si el navegador no tiene sendBeacon, usa fetch', () => {
    delete navigator.sendBeacon;

    capturar.reportarErrorDelNavegador(new Error('sin beacon'));

    expect(fetchSimulado).toHaveBeenCalledWith('/api/errores', expect.objectContaining({
      method: 'POST',
      // keepalive: que el envío sobreviva a que la página se cierre.
      keepalive: true
    }));
  });

  it('si sendBeacon rechaza el envío, cae a fetch', () => {
    sendBeacon.mockReturnValue(false);

    capturar.reportarErrorDelNavegador(new Error('beacon lleno'));

    expect(fetchSimulado).toHaveBeenCalled();
  });

  it('si sendBeacon lanza, cae a fetch en vez de romper la página', () => {
    sendBeacon.mockImplementation(() => {
      throw new Error('bloqueado por el navegador');
    });

    expect(() => capturar.reportarErrorDelNavegador(new Error('x'))).not.toThrow();
    expect(fetchSimulado).toHaveBeenCalled();
  });

  it('si ni fetch funciona, tampoco rompe nada', () => {
    delete navigator.sendBeacon;
    fetchSimulado.mockReturnValue(Promise.reject(new Error('sin red')));

    expect(() => capturar.reportarErrorDelNavegador(new Error('x'))).not.toThrow();
  });
});

describe('instalarCapturaDeErrores', () => {
  let quitar;

  afterEach(() => {
    quitar?.();
  });

  it('atrapa un error que nadie manejó', async () => {
    quitar = capturar.instalarCapturaDeErrores();

    const evento = new Event('error');
    evento.error = new RangeError('índice fuera de rango');
    evento.message = 'índice fuera de rango';
    window.dispatchEvent(evento);

    expect(await cuerpoDelBeacon()).toMatchObject({
      tipo: 'error',
      nombre: 'RangeError',
      mensaje: 'índice fuera de rango'
    });
  });

  // Los errores de scripts de otro dominio llegan sin objeto de error: solo
  // con el mensaje y la ubicación.
  it('atrapa un error que llega sin objeto, armando la pila con la ubicación', async () => {
    quitar = capturar.instalarCapturaDeErrores();

    const evento = new Event('error');
    evento.message = 'Script error.';
    evento.filename = 'https://sitio.com/x.js';
    evento.lineno = 12;
    evento.colno = 5;
    window.dispatchEvent(evento);

    const cuerpo = await cuerpoDelBeacon();
    expect(cuerpo.mensaje).toBe('Script error.');
    expect(cuerpo.pila).toContain('https://sitio.com/x.js:12:5');
  });

  it('ignora un evento sin error ni mensaje', () => {
    quitar = capturar.instalarCapturaDeErrores();

    window.dispatchEvent(new Event('error'));

    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('atrapa una promesa rechazada sin catch', async () => {
    quitar = capturar.instalarCapturaDeErrores();

    const evento = new Event('unhandledrejection');
    evento.reason = new Error('la API no respondió');
    window.dispatchEvent(evento);

    expect(await cuerpoDelBeacon()).toMatchObject({
      tipo: 'promesa',
      mensaje: 'la API no respondió'
    });
  });

  // Se comprueba contra addEventListener y no disparando un evento: sin
  // escuchadores, un evento de error queda suelto y el propio Vitest lo toma
  // como un fallo real de la prueba. Y de paso esto verifica algo más
  // estricto: que se quiten las mismas funciones que se pusieron, y no otras.
  it('quita exactamente los escuchadores que puso', () => {
    const puestos = vi.spyOn(window, 'addEventListener');
    const quitados = vi.spyOn(window, 'removeEventListener');

    capturar.instalarCapturaDeErrores()();

    const deError = ([tipo]) => tipo === 'error' || tipo === 'unhandledrejection';
    const funciones = (llamadas) => llamadas.filter(deError).map(([, funcion]) => funcion);

    expect(funciones(quitados.mock.calls)).toEqual(funciones(puestos.mock.calls));
    expect(funciones(quitados.mock.calls)).toHaveLength(2);
  });
});
