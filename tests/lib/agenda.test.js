import { describe, it, expect } from 'vitest';
import {
  generarFranjas,
  minutosDeHora,
  horaDeMinutos,
  instanteDesdeLocal,
  diaLocalDe,
  diaDeLaSemana,
  esFechaValida
} from '@/lib/agenda';

// Un miércoles cualquiera, con el salón abierto de 9 a 19.
const DIA = '2026-09-02';
const ABRE = '09:00:00';
const CIERRA = '19:00:00';

/** Reloj fijo: las 6 de la mañana en Honduras del día anterior. */
const AYER = new Date('2026-09-01T12:00:00-06:00');

function franjas(opciones = {}) {
  return generarFranjas({
    dia: DIA,
    abre: ABRE,
    cierra: CIERRA,
    duracionMinutos: 60,
    ocupados: [],
    ahora: AYER,
    ...opciones
  });
}

function horasDisponibles(lista) {
  return lista.filter((f) => f.disponible).map((f) => f.hora);
}

describe('conversiones de hora', () => {
  it.each([
    ['09:00', 540],
    ['09:00:00', 540],
    ['00:00', 0],
    ['19:30', 1170],
    ['23:59', 1439]
  ])('%s son %d minutos', (hora, minutos) => {
    expect(minutosDeHora(hora)).toBe(minutos);
  });

  it('vuelve de minutos a hora con dos digitos', () => {
    expect(horaDeMinutos(540)).toBe('09:00');
    expect(horaDeMinutos(1170)).toBe('19:30');
    expect(horaDeMinutos(0)).toBe('00:00');
  });

  it('interpreta la hora local de Honduras como UTC-6', () => {
    // Las 9 de la mañana en Tegucigalpa son las 15:00 UTC.
    expect(instanteDesdeLocal(DIA, 540).toISOString()).toBe('2026-09-02T15:00:00.000Z');
  });

  it('resuelve a que dia local pertenece un instante', () => {
    // 05:00 UTC siguen siendo las 23:00 del día anterior en Honduras.
    expect(diaLocalDe(new Date('2026-08-29T05:00:00Z'))).toBe('2026-08-28');
    // 06:00 UTC ya es medianoche local del día siguiente.
    expect(diaLocalDe(new Date('2026-08-29T06:00:00Z'))).toBe('2026-08-29');
  });

  it('calcula el dia de la semana con la convencion de Postgres', () => {
    expect(diaDeLaSemana('2026-08-30')).toBe(0); // domingo
    expect(diaDeLaSemana('2026-08-31')).toBe(1); // lunes
    expect(diaDeLaSemana('2026-09-02')).toBe(3); // miércoles
    expect(diaDeLaSemana('2026-09-05')).toBe(6); // sábado
  });

  it.each([
    ['2026-09-02', true],
    ['2026-13-45', false],
    ['02/09/2026', false],
    ['ayer', false],
    ['', false]
  ])('esFechaValida(%s) = %s', (dia, esperado) => {
    expect(esFechaValida(dia)).toBe(esperado);
  });
});

describe('generacion de franjas', () => {
  it('va de la apertura al cierre, cada media hora', () => {
    const lista = franjas({ duracionMinutos: 60 });

    expect(lista[0].hora).toBe('09:00');
    expect(lista[1].hora).toBe('09:30');
    // La última de 60 minutos que termina a las 19:00 arranca a las 18:00.
    expect(lista.at(-1).hora).toBe('18:00');
    expect(lista).toHaveLength(19);
  });

  it('no ofrece una franja donde el servicio no termina antes de cerrar', () => {
    const dosHoras = franjas({ duracionMinutos: 120 });

    // Un servicio de 2 horas no entra a las 18:00 si se cierra a las 19:00.
    expect(dosHoras.at(-1).hora).toBe('17:00');
    expect(dosHoras.map((f) => f.hora)).not.toContain('18:00');
  });

  it('un servicio corto llega mas cerca del cierre', () => {
    expect(franjas({ duracionMinutos: 30 }).at(-1).hora).toBe('18:30');
  });

  it('todas quedan disponibles si no hay citas ni pasado', () => {
    expect(franjas().every((f) => f.disponible)).toBe(true);
  });
});

describe('citas ya tomadas', () => {
  it('bloquea la franja que pisa una cita existente', () => {
    const lista = franjas({
      duracionMinutos: 60,
      ocupados: [
        {
          desde: new Date('2026-09-02T11:00:00-06:00'),
          hasta: new Date('2026-09-02T12:00:00-06:00')
        }
      ]
    });

    const disponibles = horasDisponibles(lista);
    expect(disponibles).not.toContain('11:00');
    // Una cita de 60 minutos a las 10:30 terminaría a las 11:30: se solapa.
    expect(disponibles).not.toContain('10:30');
    expect(disponibles).toContain('10:00');
    expect(disponibles).toContain('12:00');
  });

  it('una cita pegada no bloquea: si una termina a las 12:00, las 12:00 estan libres', () => {
    const lista = franjas({
      duracionMinutos: 60,
      ocupados: [
        {
          desde: new Date('2026-09-02T11:00:00-06:00'),
          hasta: new Date('2026-09-02T12:00:00-06:00')
        }
      ]
    });

    expect(horasDisponibles(lista)).toContain('12:00');
  });

  it('una cita larga bloquea varias franjas seguidas', () => {
    const lista = franjas({
      duracionMinutos: 30,
      ocupados: [
        {
          desde: new Date('2026-09-02T14:00:00-06:00'),
          hasta: new Date('2026-09-02T16:00:00-06:00')
        }
      ]
    });

    const disponibles = horasDisponibles(lista);
    for (const hora of ['14:00', '14:30', '15:00', '15:30']) {
      expect(disponibles).not.toContain(hora);
    }
    expect(disponibles).toContain('13:30');
    expect(disponibles).toContain('16:00');
  });

  it('marca el motivo por el que una franja no esta disponible', () => {
    const lista = franjas({
      ocupados: [
        {
          desde: new Date('2026-09-02T11:00:00-06:00'),
          hasta: new Date('2026-09-02T12:00:00-06:00')
        }
      ]
    });

    expect(lista.find((f) => f.hora === '11:00').motivo).toBe('ocupado');
    expect(lista.find((f) => f.hora === '09:00').motivo).toBeNull();
  });
});

describe('franjas que ya pasaron', () => {
  it('no ofrece horarios anteriores al momento actual', () => {
    // Son las 13:00 del mismo día.
    const lista = franjas({ ahora: new Date('2026-09-02T13:00:00-06:00') });
    const disponibles = horasDisponibles(lista);

    expect(disponibles).not.toContain('09:00');
    expect(disponibles).not.toContain('12:30');
    expect(disponibles).not.toContain('13:00');
    expect(disponibles).toContain('13:30');
  });

  it('respeta la antelacion minima', () => {
    // 12:50, con 30 minutos de margen: las 13:00 quedan demasiado cerca.
    const lista = franjas({
      ahora: new Date('2026-09-02T12:50:00-06:00'),
      margenMinutos: 30
    });
    const disponibles = horasDisponibles(lista);

    expect(disponibles).not.toContain('13:00');
    expect(disponibles).toContain('13:30');
  });

  it('marca el motivo pasado', () => {
    const lista = franjas({ ahora: new Date('2026-09-02T13:00:00-06:00') });
    expect(lista.find((f) => f.hora === '09:00').motivo).toBe('pasado');
  });

  it('un dia entero pasado no deja ninguna franja disponible', () => {
    const lista = franjas({ ahora: new Date('2026-09-03T09:00:00-06:00') });
    expect(horasDisponibles(lista)).toHaveLength(0);
  });
});

describe('horarios de atencion distintos', () => {
  it('respeta una jornada reducida', () => {
    const lista = franjas({ abre: '10:00:00', cierra: '14:00:00', duracionMinutos: 60 });

    expect(lista[0].hora).toBe('10:00');
    expect(lista.at(-1).hora).toBe('13:00');
  });

  it('no devuelve nada si el servicio no entra en la jornada', () => {
    // Dos horas de servicio en una jornada de una hora.
    expect(franjas({ abre: '10:00:00', cierra: '11:00:00', duracionMinutos: 120 })).toEqual([]);
  });
});
