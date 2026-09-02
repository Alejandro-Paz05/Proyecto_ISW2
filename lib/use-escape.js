import { useEffect } from 'react';

/**
 * Cierra un diálogo con la tecla Escape.
 *
 * Es lo que espera cualquiera que use el teclado, y hasta ahora la única
 * forma de cerrar el carrito o el checkout era hacer clic en la cruz o
 * fuera del recuadro. Quien no usa mouse quedaba atrapado.
 *
 * El listener se registra solo mientras el diálogo está abierto: dejarlo
 * puesto haría que cada Escape del sitio recorra manejadores de diálogos
 * que no se están mostrando.
 */
// El nombre empieza con "use" porque asi lo exige la regla de los hooks de
// React: sin ese prefijo el linter no lo reconoce como hook y se queja de
// que useEffect se llama fuera de un componente.
export function useCerrarConEscape(abierto, alCerrar) {
  useEffect(() => {
    if (!abierto) return undefined;

    function alPresionar(evento) {
      if (evento.key === 'Escape') alCerrar();
    }

    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [abierto, alCerrar]);
}
