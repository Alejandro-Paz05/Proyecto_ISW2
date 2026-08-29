/**
 * Cálculo de las franjas horarias de la agenda.
 *
 * Deliberadamente sin dependencias ni acceso a la base: recibe el horario
 * del día y las citas ya tomadas, y devuelve qué franjas ofrecerle a la
 * clienta. Así se puede probar entera sin levantar nada.
 */

/**
 * Honduras usa CST (UTC-6) todo el año: no aplica horario de verano, de modo
 * que un desfase fijo es correcto y evita sumar una librería de zonas
 * horarias. Si algún día el país adoptara horario de verano, este es el
 * único lugar a cambiar.
 */
export const OFFSET_HONDURAS = '-06:00';

/** Cada media hora en punto. Define la grilla que ve la clienta. */
export const GRANULARIDAD_MINUTOS = 30;

/** 'HH:MM' o 'HH:MM:SS' -> minutos desde la medianoche. */
export function minutosDeHora(hora) {
  const [h, m] = String(hora).split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) {
    throw new Error(`Hora no válida: ${hora}`);
  }
  return h * 60 + m;
}

/** Minutos desde la medianoche -> 'HH:MM'. */
export function horaDeMinutos(minutos) {
  const h = String(Math.floor(minutos / 60)).padStart(2, '0');
  const m = String(minutos % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** Un día ('YYYY-MM-DD') y una hora local -> el instante exacto, en UTC. */
export function instanteDesdeLocal(dia, minutos) {
  return new Date(`${dia}T${horaDeMinutos(minutos)}:00${OFFSET_HONDURAS}`);
}

/** El día local ('YYYY-MM-DD') al que pertenece un instante. */
export function diaLocalDe(instante) {
  const desplazado = new Date(instante.getTime() - 6 * 60 * 60 * 1000);
  return desplazado.toISOString().slice(0, 10);
}

export function esFechaValida(dia) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) && !Number.isNaN(Date.parse(`${dia}T00:00:00Z`));
}

/**
 * Día de la semana de una fecha local, con la misma convención que usa
 * Postgres en EXTRACT(DOW): 0 = domingo.
 *
 * Se calcula sobre el mediodía a propósito: al mediodía ningún desfase
 * horario razonable puede correr la fecha al día anterior o al siguiente.
 */
export function diaDeLaSemana(dia) {
  return new Date(`${dia}T12:00:00${OFFSET_HONDURAS}`).getUTCDay();
}

/** Cuántos días como máximo hacia adelante se puede reservar. */
export const DIAS_DE_ANTELACION = 60;

/**
 * Franjas de un día para un servicio concreto.
 *
 * Una franja se ofrece si el servicio entra completo antes del cierre, no
 * pisa ninguna cita existente y no está en el pasado.
 *
 * @param {object}   opciones
 * @param {string}   opciones.dia              'YYYY-MM-DD'
 * @param {string}   opciones.abre             'HH:MM:SS' hora local de apertura
 * @param {string}   opciones.cierra           'HH:MM:SS' hora local de cierre
 * @param {number}   opciones.duracionMinutos  cuánto dura el servicio
 * @param {Array}    opciones.ocupados         [{ desde: Date, hasta: Date }]
 * @param {Date}     opciones.ahora            para poder fijar el reloj en las pruebas
 * @param {number}   opciones.margenMinutos    antelación mínima para reservar
 */
export function generarFranjas({
  dia,
  abre,
  cierra,
  duracionMinutos,
  ocupados = [],
  ahora = new Date(),
  margenMinutos = 0
}) {
  const apertura = minutosDeHora(abre);
  const cierre = minutosDeHora(cierra);
  const limite = new Date(ahora.getTime() + margenMinutos * 60 * 1000);

  const franjas = [];

  // El servicio tiene que terminar antes del cierre: una cita de 120 minutos
  // no se ofrece a las 18:00 aunque el salón siga abierto hasta las 19:00.
  for (
    let inicio = apertura;
    inicio + duracionMinutos <= cierre;
    inicio += GRANULARIDAD_MINUTOS
  ) {
    const desde = instanteDesdeLocal(dia, inicio);
    const hasta = new Date(desde.getTime() + duracionMinutos * 60 * 1000);

    const yaPaso = desde <= limite;
    const seSolapa = ocupados.some(
      (cita) => desde < cita.hasta && hasta > cita.desde
    );

    franjas.push({
      hora: horaDeMinutos(inicio),
      inicio: desde.toISOString(),
      disponible: !yaPaso && !seSolapa,
      motivo: yaPaso ? 'pasado' : seSolapa ? 'ocupado' : null
    });
  }

  return franjas;
}
