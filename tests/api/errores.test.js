import { describe, it, expect, vi, beforeEach } from 'vitest';
import { llamar } from '../helpers/http';

const { reportarError } = vi.hoisted(() => ({ reportarError: vi.fn() }));

vi.mock('@/lib/errores', () => ({ reportarError }));

import errores from '@/pages/api/errores';
import { reiniciarLimites } from '@/lib/limite';

const REPORTE = {
  tipo: 'error',
  nombre: 'TypeError',
  mensaje: 'producto is undefined',
  pila: '    at Carrito (https://www.alejandropaz.xyz/_next/static/chunks/pages/_app-abc12345.js:1:2)',
  ruta: '/akaristudio/productos'
};

function enviar(body) {
  return llamar(errores, {
    method: 'POST',
    body,
    headers: { 'x-forwarded-for': '203.0.113.7', 'user-agent': 'Mozilla/5.0 (prueba)' }
  });
}

describe('POST /api/errores', () => {
  beforeEach(() => {
    reiniciarLimites();
    reportarError.mockReset();
    reportarError.mockResolvedValue('navegador:0123456789abcdef');
  });

  it('rechaza cualquier método que no sea POST', async () => {
    const res = await llamar(errores, { method: 'GET' });

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('registra el error como ticket del navegador y responde 204', async () => {
    const res = await enviar(REPORTE);

    expect(res.statusCode).toBe(204);

    const [error, contexto] = reportarError.mock.calls[0];
    expect(error.name).toBe('TypeError');
    expect(error.message).toBe('producto is undefined');
    // La pila del navegador, no la del servidor: si no, todos los errores del
    // navegador compartirían huella.
    expect(error.stack).toBe(REPORTE.pila);
    expect(contexto).toEqual({
      origen: 'navegador',
      tipo: 'error',
      ruta: '/akaristudio/productos',
      navegador: 'Mozilla/5.0 (prueba)'
    });
  });

  it('acepta el cuerpo como texto, que es como lo manda sendBeacon', async () => {
    const res = await enviar(JSON.stringify(REPORTE));

    expect(res.statusCode).toBe(204);
    expect(reportarError).toHaveBeenCalledOnce();
  });

  it('guarda la ruta sin query ni ancla, que pueden traer datos personales', async () => {
    await enviar({ ...REPORTE, ruta: '/akaristudio/admin/login?volver=%2F&correo=maria@ejemplo.com#x' });

    expect(reportarError.mock.calls[0][1].ruta).toBe('/akaristudio/admin/login');
  });

  it('recorta un mensaje enorme', async () => {
    await enviar({ ...REPORTE, mensaje: 'x'.repeat(5000) });

    expect(reportarError.mock.calls[0][0].message).toHaveLength(500);
  });

  it.each([
    ['un reporte sin mensaje', { ...REPORTE, mensaje: '   ' }],
    ['un tipo inventado', { ...REPORTE, tipo: 'catastrofe' }],
    ['texto que no es JSON', 'esto no es json'],
    ['un cuerpo vacío', undefined]
  ])('rechaza %s con 400 sin tocar la base', async (_descripcion, body) => {
    const res = await enviar(body);

    expect(res.statusCode).toBe(400);
    expect(reportarError).not.toHaveBeenCalled();
  });

  it.each([
    ['Script error.'],
    ['ResizeObserver loop completed with undelivered notifications.']
  ])('descarta el ruido conocido: %s', async (mensaje) => {
    const res = await enviar({ ...REPORTE, mensaje });

    expect(res.statusCode).toBe(204);
    expect(reportarError).not.toHaveBeenCalled();
  });

  it('descarta los errores de las extensiones del navegador', async () => {
    const res = await enviar({
      ...REPORTE,
      pila: '    at inyectar (chrome-extension://abcdefgh/content.js:1:1)'
    });

    expect(res.statusCode).toBe(204);
    expect(reportarError).not.toHaveBeenCalled();
  });

  it('corta con 429 después de diez reportes en un minuto', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await enviar(REPORTE)).statusCode).toBe(204);
    }

    expect((await enviar(REPORTE)).statusCode).toBe(429);
  });
});
