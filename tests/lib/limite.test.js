import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { permitir, ipDe, reiniciarLimites, cantidadDeVentanas } from '@/lib/limite';

const LIMITE = { maximo: 3, ventanaMs: 60_000 };

describe('permitir', () => {
  beforeEach(() => {
    reiniciarLimites();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deja pasar hasta el máximo y corta la siguiente', () => {
    const resultados = [1, 2, 3, 4].map(() => permitir('visitante-1', LIMITE));

    expect(resultados).toEqual([true, true, true, false]);
  });

  it('cada visitante lleva su propia cuenta', () => {
    for (let i = 0; i < 3; i += 1) permitir('visitante-1', LIMITE);

    expect(permitir('visitante-1', LIMITE)).toBe(false);
    expect(permitir('visitante-2', LIMITE)).toBe(true);
  });

  it('vuelve a dejar pasar cuando vence la ventana', () => {
    for (let i = 0; i < 3; i += 1) permitir('visitante-1', LIMITE);

    vi.advanceTimersByTime(60_000);

    expect(permitir('visitante-1', LIMITE)).toBe(true);
  });

  it('barre las ventanas vencidas para que el mapa no crezca sin fin', () => {
    for (let i = 0; i < 1000; i += 1) permitir(`visitante-${i}`, LIMITE);
    vi.advanceTimersByTime(60_000);

    permitir('uno-nuevo', LIMITE);

    expect(cantidadDeVentanas()).toBe(1);
  });
});

describe('ipDe', () => {
  it('toma la primera dirección de x-forwarded-for', () => {
    expect(ipDe({ headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } })).toBe('203.0.113.7');
  });

  it('sin esa cabecera usa la del socket', () => {
    expect(ipDe({ headers: {}, socket: { remoteAddress: '127.0.0.1' } })).toBe('127.0.0.1');
  });

  it('sin ningún dato no revienta', () => {
    expect(ipDe({})).toBe('desconocida');
  });
});
