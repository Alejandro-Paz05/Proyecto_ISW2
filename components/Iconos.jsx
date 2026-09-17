/**
 * Los iconos del sitio, dibujados a mano en SVG.
 *
 * Antes eran emoji: 💅 para uñas, 📍 para la dirección. El problema no es que
 * se vean mal, es que cada sistema los dibuja a su manera —los de Apple no son
 * los de Android ni los de Windows—, así que la misma página se ve distinta en
 * cada teléfono y los iconos nunca combinan entre sí ni con la paleta.
 *
 * Estos comparten todo lo que hace que un juego de iconos parezca un juego: la
 * misma caja de 24, el mismo grosor de trazo, las mismas puntas redondeadas y
 * el color heredado del texto, así que el CSS decide si van dorados o grises.
 *
 * Van con aria-hidden porque al lado siempre hay una etiqueta que dice lo
 * mismo: un lector de pantalla que los anunciara repetiría "uñas, uñas".
 */

function Icono({ children, tamano = 24, className }) {
  return (
    <svg
      className={className}
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/**
 * Un frasco de esmalte, ancho y bajo, con un destello al lado.
 *
 * La silueta es a propósito distinta de la del labial: a 30 píxeles, dos
 * frascos altos y angostos se confunden, y la tarjeta de Uñas terminaba
 * pareciéndose a la de Maquillaje.
 */
export function IconoUnas(props) {
  return (
    <Icono {...props}>
      <path d="M6.5 21h11v-6a2.5 2.5 0 0 0-2.5-2.5H9A2.5 2.5 0 0 0 6.5 15z" />
      <path d="M10.3 12.5V10.2h3.4v2.3" />
      <rect x="10.6" y="4.6" width="2.8" height="5.6" rx="1.2" />
      <path d="M6.5 17h11" />
      <path d="m19.2 4 .65 1.75L21.6 6.4l-1.75.65L19.2 8.8l-.65-1.75L16.8 6.4l1.75-.65z" />
    </Icono>
  );
}

/** Un ojo con tres pestañas arriba. */
export function IconoPestanas(props) {
  return (
    <Icono {...props}>
      <path d="M2.8 13.5S6.2 9 12 9s9.2 4.5 9.2 4.5-3.4 4.5-9.2 4.5-9.2-4.5-9.2-4.5z" />
      <circle cx="12" cy="13.5" r="2.4" />
      <path d="M12 9V5.6M6.4 10.4 4.6 7.9M17.6 10.4l1.8-2.5" />
    </Icono>
  );
}

/** Una ceja con sus pelos, sobre la línea del párpado. */
export function IconoCejas(props) {
  return (
    <Icono {...props}>
      <path d="M3.8 10.4c3.2-4 9.4-5 15.6-2.2" />
      <path d="M6.6 9.3 5.3 6.6M9.8 8.2 9 5.4M13.2 8.1l.4-2.8M16.4 8.9l1-2.6" />
      <path d="M4.4 15.6S7.4 12 12 12s7.6 3.6 7.6 3.6" />
    </Icono>
  );
}

/** Un labial: estuche angosto y la barra cortada en diagonal, bien salida. */
export function IconoMaquillaje(props) {
  return (
    <Icono {...props}>
      <rect x="9" y="14.2" width="6" height="6.8" rx="1.2" />
      <path d="M8.7 12.2h6.6" />
      <path d="M10.2 12.2V7.6l3.6-2.6v7.2" />
    </Icono>
  );
}

/** Un pin de mapa. */
export function IconoUbicacion(props) {
  return (
    <Icono {...props}>
      <path d="M12 21.5s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10.2" r="2.6" />
    </Icono>
  );
}

/** Un auricular de teléfono. */
export function IconoTelefono(props) {
  return (
    <Icono {...props}>
      <path d="M21 16.9v2.6a1.8 1.8 0 0 1-2 1.8 17.6 17.6 0 0 1-7.7-2.7 17.3 17.3 0 0 1-5.3-5.3A17.6 17.6 0 0 1 3.3 5.6a1.8 1.8 0 0 1 1.8-2h2.6a1.8 1.8 0 0 1 1.8 1.6c.1.9.3 1.7.6 2.5a1.8 1.8 0 0 1-.4 1.9L8.6 10.8a14 14 0 0 0 5.3 5.3l1.2-1.1a1.8 1.8 0 0 1 1.9-.4c.8.3 1.6.5 2.5.6a1.8 1.8 0 0 1 1.5 1.7z" />
    </Icono>
  );
}

/** Un sobre. */
export function IconoCorreo(props) {
  return (
    <Icono {...props}>
      <rect x="2.8" y="5" width="18.4" height="14" rx="2.2" />
      <path d="m3.4 6.6 8.6 6 8.6-6" />
    </Icono>
  );
}

/** Un reloj. */
export function IconoReloj(props) {
  return (
    <Icono {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.8V12l3.4 2" />
    </Icono>
  );
}

/** La cámara cuadrada de Instagram. */
export function IconoInstagram(props) {
  return (
    <Icono {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </Icono>
  );
}
