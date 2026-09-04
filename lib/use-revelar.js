import { useEffect } from 'react';

/**
 * Revela con una animación los elementos marcados con `data-revelar` cuando
 * entran en pantalla.
 *
 * El elemento arranca desplazado y transparente por CSS, y este hook le
 * agrega la clase `revelado` en cuanto asoma. Se usa un IntersectionObserver
 * y no el evento `scroll`: el evento se dispara decenas de veces por segundo
 * y obliga a leer la posición de cada elemento, lo que fuerza al navegador a
 * recalcular el diseño en medio del desplazamiento.
 *
 * `clave` sirve para volver a escanear cuando aparecen elementos nuevos: el
 * catálogo llega de la API después del primer render, así que sus tarjetas
 * no existen cuando el efecto corre por primera vez. Pasarle `productos.length`
 * hace que se observen apenas se pintan.
 */
export function useRevelar(clave) {
  useEffect(() => {
    const elementos = document.querySelectorAll('[data-revelar]:not(.revelado)');
    if (elementos.length === 0) return undefined;

    const mostrarTodo = () => {
      for (const elemento of elementos) elemento.classList.add('revelado');
    };

    // La animación es un adorno; el contenido no. Si el navegador no trae
    // IntersectionObserver, o si el sistema pide menos movimiento, se muestra
    // todo de una vez en vez de arriesgar que algo quede invisible.
    const sinSoporte = typeof IntersectionObserver === 'undefined';
    const menosMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (sinSoporte || menosMovimiento) {
      mostrarTodo();
      return undefined;
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;

          entrada.target.classList.add('revelado');
          // Una vez revelado no vuelve a ocultarse: reanimarlo al subir
          // marea, y ya no hay razón para seguir observándolo.
          observador.unobserve(entrada.target);
        }
      },
      // El margen negativo abajo retrasa un poco el disparo: si saltara
      // apenas el borde toca la pantalla, la animación terminaría antes de
      // que el elemento se vea entero.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
    );

    for (const elemento of elementos) observador.observe(elemento);

    return () => observador.disconnect();
  }, [clave]);
}
