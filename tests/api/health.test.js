import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llamar } from '../helpers/http';

const { select } = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({ from: () => ({ select }) })
}));

import handler from '@/pages/api/health';

describe('GET /api/health', () => {
  beforeEach(() => {
    select.mockReset();
    select.mockResolvedValue({ error: null, count: 16 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rechaza cualquier metodo que no sea GET', async () => {
    const res = await llamar(handler, { method: 'POST' });

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });

  describe('cuando la base responde', () => {
    it('devuelve 200 y estado saludable', async () => {
      const res = await llamar(handler);

      expect(res.statusCode).toBe(200);
      expect(res.body.estado).toBe('ok');
      expect(res.body.status).toBe('healthy');
      expect(res.body.dependencias.base_de_datos.estado).toBe('ok');
    });

    it('informa servicio, version y hora', async () => {
      const res = await llamar(handler);

      expect(res.body.servicio).toBe('akari-studio');
      expect(res.body.version).toBeTruthy();
      expect(Number.isNaN(Date.parse(res.body.hora))).toBe(false);
    });

    it('mide la latencia de la consulta', async () => {
      const res = await llamar(handler);

      expect(typeof res.body.dependencias.base_de_datos.latencia_ms).toBe('number');
      expect(res.body.tiempo_respuesta_ms).toBeGreaterThanOrEqual(0);
    });

    it('no se cachea: el estado de ahora no sirve dentro de un minuto', async () => {
      const res = await llamar(handler);

      expect(res.headers['Cache-Control']).toBe('no-store');
    });
  });

  describe('cuando la base no responde', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    // 503 y no 200: un monitor externo necesita un codigo de error para
    // disparar la alerta. Un healthcheck que siempre devuelve 200 no sirve.
    it('devuelve 503 ante un error de la consulta', async () => {
      select.mockResolvedValue({ error: { message: 'relation does not exist' } });

      const res = await llamar(handler);

      expect(res.statusCode).toBe(503);
      expect(res.body.estado).toBe('degradado');
      expect(res.body.status).toBe('unhealthy');
      expect(res.body.dependencias.base_de_datos.estado).toBe('error');
    });

    it('devuelve 503 si la conexion se cae', async () => {
      select.mockRejectedValue(new Error('fetch failed'));

      const res = await llamar(handler);

      expect(res.statusCode).toBe(503);
      expect(res.body.status).toBe('unhealthy');
    });

    it('no filtra el detalle del error en la respuesta', async () => {
      select.mockResolvedValue({ error: { message: 'relation "products" does not exist' } });

      const res = await llamar(handler);

      expect(JSON.stringify(res.body)).not.toMatch(/relation/);
    });
  });
});
