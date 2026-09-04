import { NEGOCIO, enlaceWhatsApp } from '@/lib/negocio';

const MENSAJE = `¡Hola ${NEGOCIO.nombre}! Quiero agendar una cita.`;

/**
 * Botón flotante para escribir por WhatsApp.
 *
 * Reemplaza al formulario de solicitud de cita. La dueña prefiere preguntar
 * el servicio, el día y el horario por chat, así que el sitio no los pide:
 * abre la conversación y ella la conduce.
 *
 * Es un enlace y no un botón porque lleva a otra parte, y así el navegador
 * ofrece "abrir en pestaña nueva" y el teclado lo alcanza con Tab sin que
 * haya que programar nada.
 */
export default function BotonWhatsApp() {
  return (
    <a
      className="whatsapp-flotante"
      href={enlaceWhatsApp(MENSAJE)}
      target="_blank"
      rel="noreferrer"
      aria-label="Agendar una cita por WhatsApp"
    >
      <svg
        className="whatsapp-icono"
        viewBox="0 0 24 24"
        width="28"
        height="28"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35z" />
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23z" />
      </svg>
      <span className="whatsapp-texto">Agendar cita</span>
    </a>
  );
}
