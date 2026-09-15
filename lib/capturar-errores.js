/**
 * Captura los errores del navegador y los manda a /api/errores.
 *
 * Tres fuentes: los errores que nadie atrapó, las promesas rechazadas sin
 * catch y los errores de render de React, que llegan desde LimiteDeErrores.
 *
 * Cada error distinto se manda una sola vez por carga de página: un error
 * dentro de un bucle de render dispararía cientos de envíos idénticos, y la
 * base igual los agruparía en un solo ticket.
 */

const enviados = new Set();

function enviar(reporte) {
  const clave = `${reporte.tipo}|${reporte.nombre}|${reporte.mensaje}`;
  if (enviados.has(clave)) return;
  enviados.add(clave);

  const cuerpo = JSON.stringify({ ...reporte, ruta: window.location.pathname });

  // sendBeacon sobrevive a que la página se cierre, que es justo cuando más
  // errores se pierden. Va como texto plano porque es el único tipo que los
  // navegadores aceptan sin trabas en un beacon.
  try {
    const encolado = navigator.sendBeacon?.(
      '/api/errores',
      new Blob([cuerpo], { type: 'text/plain;charset=UTF-8' })
    );
    if (encolado) return;
  } catch {
    // Sin sendBeacon, o bloqueado: se intenta con fetch.
  }

  fetch('/api/errores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo,
    keepalive: true
  }).catch(() => {
    // Si ni siquiera se puede reportar, no hay a quién avisarle.
  });
}

export function reportarErrorDelNavegador(error, tipo = 'error') {
  enviar({
    tipo,
    nombre: error?.name || 'Error',
    mensaje: String(error?.message ?? error ?? 'Error sin mensaje'),
    pila: typeof error?.stack === 'string' ? error.stack : ''
  });
}

/** Instala los escuchadores globales. Devuelve la función que los quita. */
export function instalarCapturaDeErrores() {
  function alFallar(evento) {
    // Sin error ni mensaje no hay nada que reportar.
    if (!evento.error && !evento.message) return;

    reportarErrorDelNavegador(
      evento.error ?? {
        name: 'Error',
        message: evento.message,
        stack: `    at ${evento.filename}:${evento.lineno}:${evento.colno}`
      },
      'error'
    );
  }

  function alRechazar(evento) {
    reportarErrorDelNavegador(evento.reason, 'promesa');
  }

  window.addEventListener('error', alFallar);
  window.addEventListener('unhandledrejection', alRechazar);

  return () => {
    window.removeEventListener('error', alFallar);
    window.removeEventListener('unhandledrejection', alRechazar);
  };
}
