import { describe, it, expect } from 'vitest';
import { diaLocalDe, esFechaValida, diaDeLaSemana, formatFechaLarga } from '@/lib/fechas';

describe('fechas en la zona horaria del salón', () => {
  describe('diaLocalDe', () => {
    it('resuelve a qué día local pertenece un instante', () => {
      // 05:00 UTC siguen siendo las 23:00 del día anterior en Honduras.
      expect(diaLocalDe(new Date('2026-08-29T05:00:00Z'))).toBe('2026-08-28');
      // 06:00 UTC ya es medianoche local del día siguiente.
      expect(diaLocalDe(new Date('2026-08-29T06:00:00Z'))).toBe('2026-08-29');
    });

    it('no corre el día a media tarde', () => {
      expect(diaLocalDe(new Date('2026-09-02T18:00:00Z'))).toBe('2026-09-02');
    });
  });

  describe('diaDeLaSemana', () => {
    it.each([
      ['2026-08-30', 0, 'domingo'],
      ['2026-08-31', 1, 'lunes'],
      ['2026-09-02', 3, 'miércoles'],
      ['2026-09-05', 6, 'sábado']
    ])('%s es %d (%s)', (dia, esperado) => {
      expect(diaDeLaSemana(dia)).toBe(esperado);
    });
  });

  describe('esFechaValida', () => {
    it.each([
      ['2026-09-02', true],
      ['2026-13-45', false],
      ['02/09/2026', false],
      ['mañana', false],
      ['', false],
      [undefined, false]
    ])('esFechaValida(%s) = %s', (dia, esperado) => {
      expect(esFechaValida(dia)).toBe(esperado);
    });
  });

  describe('formatFechaLarga', () => {
    it('escribe el día de la semana y el mes en palabras', () => {
      const texto = formatFechaLarga('2026-09-02');
      expect(texto).toMatch(/mi(é|e)rcoles/i);
      expect(texto).toMatch(/septiembre/i);
      expect(texto).toContain('2');
    });

    it('no se corre un día por el desfase horario', () => {
      // Sin fijar el mediodía, una fecha interpretada en UTC mostraría el
      // día anterior para quien está en Honduras.
      expect(formatFechaLarga('2026-09-01')).toMatch(/1 de septiembre/i);
    });
  });
});
