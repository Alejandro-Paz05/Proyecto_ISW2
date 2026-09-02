/**
 * Datos de contacto del salón, en un único lugar.
 *
 * Estaban repetidos a mano en la sección de contacto, en el pie de página y
 * en el panel. Al centralizarlos, cambiar el teléfono es una línea y no una
 * búsqueda por todo el proyecto.
 *
 * PENDIENTE: los valores marcados abajo todavía son de relleno. Hay que
 * reemplazarlos por los reales antes de entregarle el sitio al salón.
 */

/** Número de WhatsApp en formato internacional, solo dígitos. */
const WHATSAPP = '50499990000'; // PENDIENTE: número real del salón

export const NEGOCIO = {
  nombre: 'Akari Studio',
  descripcion: 'Belleza y elegancia en el corazón de Honduras.',

  telefono: '+504 9999-0000', // PENDIENTE
  telefonoEnlace: 'tel:+50499990000',

  whatsapp: WHATSAPP,
  whatsappVisible: '+504 9999-0000', // PENDIENTE

  correo: 'contacto@akaristudio.hn', // PENDIENTE
  direccion: 'Tegucigalpa, Honduras', // PENDIENTE
  horario: 'Lunes a sábado, 9:00 AM – 7:00 PM'
};

/**
 * Arma el enlace de WhatsApp con el mensaje ya escrito.
 *
 * wa.me funciona igual en el celular, donde abre la aplicación, y en la
 * computadora, donde abre WhatsApp Web. Por eso se usa en lugar de los
 * esquemas whatsapp:// o api.whatsapp.com, que fallan en uno de los dos.
 */
export function enlaceWhatsApp(mensaje) {
  const base = `https://wa.me/${NEGOCIO.whatsapp}`;
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base;
}
