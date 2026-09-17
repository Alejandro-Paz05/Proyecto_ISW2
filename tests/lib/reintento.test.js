import { describe, it, expect, vi } from 'vitest';
import { conReintento } from '@/lib/reintento';

/**
 * El reintento nació de un error real capturado en producción: Supabase
 * rechazó una lectura con "JWT issued at future", un desfase de reloj entre
 * sus propios servicios que dura milisegundos.
 */

describe('conReintento', () => {
  it('no reintenta lo que sale bien a la primera', async () => {
    const leer = vi.fn(async () => ['una categoría']);

    await expect(conReintento(leer)).resolves.toEqual(['una categoría']);
    expect(leer).toHaveBeenCalledOnce();
  });

  it('se recupera de un fallo pasajero', async () => {
    const leer = vi
      .fn()
      .mockRejectedValueOnce(new Error('JWT issued at future'))
      .mockResolvedValueOnce(['una categoría']);

    await expect(conReintento(leer, { esperaMs: 0 })).resolves.toEqual(['una categoría']);
    expect(leer).toHaveBeenCalledTimes(2);
  });

  // Que reintente no puede volverse una forma de esconder que la base está
  // caída: el error tiene que llegar igual, y con su mensaje original.
  it('si falla siempre, lanza el último error', async () => {
    const leer = vi.fn().mockRejectedValue(new Error('la base no responde'));

    await expect(conReintento(leer, { esperaMs: 0 })).rejects.toThrow('la base no responde');
    expect(leer).toHaveBeenCalledTimes(2);
  });

  it('lanza el error del último intento, no el del primero', async () => {
    const leer = vi
      .fn()
      .mockRejectedValueOnce(new Error('primero'))
      .mockRejectedValueOnce(new Error('segundo'));

    await expect(conReintento(leer, { esperaMs: 0 })).rejects.toThrow('segundo');
  });

  it('acepta más intentos cuando se le piden', async () => {
    const leer = vi
      .fn()
      .mockRejectedValueOnce(new Error('uno'))
      .mockRejectedValueOnce(new Error('dos'))
      .mockResolvedValueOnce('listo');

    await expect(conReintento(leer, { intentos: 3, esperaMs: 0 })).resolves.toBe('listo');
    expect(leer).toHaveBeenCalledTimes(3);
  });

  it('espera entre intentos en vez de reintentar de inmediato', async () => {
    vi.useFakeTimers();
    const leer = vi.fn().mockRejectedValueOnce(new Error('parpadeo')).mockResolvedValueOnce('ok');

    const promesa = conReintento(leer, { esperaMs: 150 });

    // Todavía no reintentó: está esperando.
    await vi.advanceTimersByTimeAsync(0);
    expect(leer).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(150);
    await expect(promesa).resolves.toBe('ok');
    expect(leer).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
