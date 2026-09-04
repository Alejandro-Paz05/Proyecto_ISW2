import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { conCache, invalidar, limpiarCache, tamanoCache } from '@/lib/cache';

describe('cache en memoria', () => {
  beforeEach(() => {
    limpiarCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    limpiarCache();
  });

  it('consulta una sola vez mientras la entrada esta vigente', async () => {
    const producir = vi.fn(async () => 'catalogo');

    expect(await conCache('k', 1000, producir)).toBe('catalogo');
    expect(await conCache('k', 1000, producir)).toBe('catalogo');

    expect(producir).toHaveBeenCalledTimes(1);
  });

  it('vuelve a consultar cuando la entrada vence', async () => {
    const producir = vi.fn(async () => 'v');

    await conCache('k', 1000, producir);
    vi.advanceTimersByTime(1001);
    await conCache('k', 1000, producir);

    expect(producir).toHaveBeenCalledTimes(2);
  });

  it('mantiene separadas las claves distintas', async () => {
    await conCache('a', 1000, async () => 1);
    await conCache('b', 1000, async () => 2);

    expect(await conCache('a', 1000, async () => 99)).toBe(1);
    expect(await conCache('b', 1000, async () => 99)).toBe(2);
    expect(tamanoCache()).toBe(2);
  });

  it('invalidar obliga a consultar de nuevo', async () => {
    const producir = vi.fn(async () => 'v');

    await conCache('k', 60_000, producir);
    invalidar('k');
    await conCache('k', 60_000, producir);

    expect(producir).toHaveBeenCalledTimes(2);
  });

  // Diez visitas simultaneas con la cache recien vencida no deben lanzar
  // diez consultas identicas: es justo cuando mas se castigaria a la base.
  it('agrupa las peticiones simultaneas en una sola consulta', async () => {
    let resolver;
    const producir = vi.fn(() => new Promise((r) => { resolver = r; }));

    const pedidos = [
      conCache('k', 1000, producir),
      conCache('k', 1000, producir),
      conCache('k', 1000, producir)
    ];

    resolver('catalogo');
    const resultados = await Promise.all(pedidos);

    expect(producir).toHaveBeenCalledTimes(1);
    expect(resultados).toEqual(['catalogo', 'catalogo', 'catalogo']);
  });

  describe('cuando la consulta falla', () => {
    it('propaga el error si no hay copia previa', async () => {
      const producir = vi.fn(async () => {
        throw new Error('base caida');
      });

      await expect(conCache('k', 1000, producir)).rejects.toThrow('base caida');
    });

    // Un catalogo de hace un minuto no le hace dano a nadie; la
    // alternativa es una pantalla de error porque la base parpadeo.
    it('sirve la copia vencida antes que romper', async () => {
      const producir = vi
        .fn()
        .mockResolvedValueOnce('bueno')
        .mockRejectedValueOnce(new Error('base caida'));

      await conCache('k', 1000, producir);
      vi.advanceTimersByTime(5000);

      expect(await conCache('k', 1000, producir)).toBe('bueno');
    });

    it('deja de retener la peticion fallida', async () => {
      const producir = vi
        .fn()
        .mockRejectedValueOnce(new Error('primera'))
        .mockResolvedValueOnce('segunda');

      await expect(conCache('k', 1000, producir)).rejects.toThrow();

      expect(await conCache('k', 1000, producir)).toBe('segunda');
    });
  });

  it('limpiarCache vacia todo', async () => {
    await conCache('a', 1000, async () => 1);
    await conCache('b', 1000, async () => 2);

    limpiarCache();

    expect(tamanoCache()).toBe(0);
  });
});
