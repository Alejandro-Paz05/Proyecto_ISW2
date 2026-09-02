/**
 * Manejo de fechas en la zona horaria del salón.
 *
 * Honduras usa CST (UTC-6) todo el año: no aplica horario de verano, de modo
 * que un desfase fijo es correcto y evita sumar una librería de zonas
 * horarias. Si algún día el país adoptara horario de verano, este es el
 * único lugar a cambiar.
 */

export const OFFSET_HONDURAS = '-06:00';

/** El día local ('YYYY-MM-DD') al que pertenece un instante. */
export function diaLocalDe(instante) {
  const desplazado = new Date(instante.getTime() - 6 * 60 * 60 * 1000);
  return desplazado.toISOString().slice(0, 10);
}

export function esFechaValida(dia) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) && !Number.isNaN(Date.parse(`${dia}T00:00:00Z`));
}

/**
 * Día de la semana de una fecha local: 0 = domingo.
 *
 * Se calcula sobre el mediodía a propósito: al mediodía ningún desfase
 * horario razonable puede correr la fecha al día anterior o al siguiente.
 */
export function diaDeLaSemana(dia) {
  return new Date(`${dia}T12:00:00${OFFSET_HONDURAS}`).getUTCDay();
}

/** Formatea 'YYYY-MM-DD' como "martes 8 de septiembre". */
export function formatFechaLarga(dia) {
  return new Date(`${dia}T12:00:00${OFFSET_HONDURAS}`).toLocaleDateString('es-HN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}
