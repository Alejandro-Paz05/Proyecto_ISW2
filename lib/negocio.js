/**
 * Datos de contacto del salón, en un único lugar.
 *
 * Estaban repetidos a mano en la sección de contacto, en el pie de página y
 * en el panel. Al centralizarlos, cambiar el teléfono es una línea y no una
 * búsqueda por todo el proyecto.
 *
 * Los valores son los reales del salón desde el 2026-09-17, salvo el correo:
 * ver la nota más abajo.
 */

/** Número de WhatsApp en formato internacional, solo dígitos. */
const WHATSAPP = '50498640865';

export const NEGOCIO = {
  nombre: 'Akari Studio',
  descripcion: 'Belleza y elegancia en el corazón de Honduras.',

  telefono: '+504 9864-0865',
  telefonoEnlace: `tel:+${WHATSAPP}`,

  whatsapp: WHATSAPP,
  whatsappVisible: '+504 9864-0865',

  // PENDIENTE: el dominio akaristudio.hn no existe, así que esta dirección no
  // puede recibir nada y quien escriba recibe un rebote. Se deja a pedido de
  // Alejandro (2026-09-17) hasta que el salón tenga un buzón propio. El canal
  // que sí funciona es WhatsApp.
  correo: 'contacto@akaristudio.hn',

  direccion: 'Residencial Bosques de Jucutuma 1, San Pedro Sula',
  horario: 'Todos los días, 9:00 AM – 6:00 PM',

  instagram: 'akari_estudiohn',
  instagramUrl: 'https://www.instagram.com/akari_estudiohn'
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
