import webpush from 'web-push';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Avisos push al personal cuando entra un pedido.
 *
 * Antes la dueña se enteraba de un pedido solo si abría el panel. Uno que
 * entra a las nueve de la noche podía quedar sin ver hasta el otro día, y en
 * un negocio que compite con responder por WhatsApp eso es la venta perdida.
 *
 * Tres decisiones que no se ven en el código:
 *
 *   - El aviso NO lleva datos de la clienta. Aparece en una pantalla
 *     bloqueada, que cualquiera que levante el teléfono puede leer. Van el
 *     número de pedido, el total y cuántos productos: lo suficiente para
 *     decidir si vale la pena abrir el panel.
 *   - Un fallo acá nunca rompe el pedido. La venta ya está registrada cuando
 *     esto corre; que no llegue el aviso es una molestia, perder el pedido
 *     sería un desastre.
 *   - Una suscripción que el navegador ya no reconoce se borra sola. Pasa
 *     cada vez que alguien reinstala la aplicación o limpia sus datos, y sin
 *     esto la tabla se llenaría de destinatarios muertos.
 */

const ROLES_QUE_RECIBEN = ['duena', 'admin'];

// Más que esto y el pedido se quedaría esperando a un servidor de push para
// poder responderle a la clienta.
const LIMITE_DE_ESPERA_MS = 3000;

// El navegador ya no reconoce esa suscripción: se dio de baja o caducó.
const MUERTAS = new Set([404, 410]);

let configurado = null;

/** Las claves VAPID, o null si el proyecto todavía no las tiene. */
function configurar() {
  if (configurado !== null) return configurado;

  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;

  if (!publica || !privada) {
    configurado = false;
    return configurado;
  }

  webpush.setVapidDetails(
    process.env.VAPID_CONTACTO || 'mailto:contacto@akaristudio.hn',
    publica,
    privada
  );
  configurado = true;
  return configurado;
}

/** Solo para pruebas: obliga a releer las variables de entorno. */
export function olvidarConfiguracion() {
  configurado = null;
}

/** El texto que se ve en la pantalla bloqueada. Sin nombre ni dirección. */
export function avisoDePedido({ order_number: numero, total }, unidades) {
  const lempiras = `L ${Number(total).toFixed(2)}`;
  const productos = unidades === 1 ? '1 producto' : `${unidades} productos`;

  return {
    titulo: `Pedido nuevo · ${numero}`,
    cuerpo: `${lempiras} · ${productos}`,
    url: '/akaristudio/admin',
    // Dos avisos del mismo pedido se reemplazan en vez de apilarse.
    etiqueta: `pedido-${numero}`
  };
}

async function suscripcionesDelPersonal(db) {
  const { data: perfiles, error: errorPerfiles } = await db
    .from('profiles')
    .select('id')
    .in('role', ROLES_QUE_RECIBEN);

  if (errorPerfiles) throw errorPerfiles;
  if (!perfiles?.length) return [];

  const { data, error } = await db
    .from('suscripciones_push')
    .select('id, endpoint, p256dh, auth')
    .in(
      'user_id',
      perfiles.map((perfil) => perfil.id)
    );

  if (error) throw error;
  return data ?? [];
}

async function enviarA(suscripcion, contenido) {
  try {
    await webpush.sendNotification(
      {
        endpoint: suscripcion.endpoint,
        keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth }
      },
      contenido
    );
    return null;
  } catch (error) {
    // El código viene en statusCode, no en status: lo pone la propia librería.
    return MUERTAS.has(error?.statusCode) ? suscripcion.id : null;
  }
}

/**
 * Avisa del pedido a todo el personal suscrito. No lanza nunca.
 *
 * @returns {Promise<{enviados: number, borrados: number}>} para las pruebas y
 * para poder registrarlo si algún día hace falta.
 */
export async function avisarDePedido(pedido, unidades) {
  const vacio = { enviados: 0, borrados: 0 };

  try {
    if (!configurar()) return vacio;

    const db = getSupabaseAdmin();
    const suscripciones = await suscripcionesDelPersonal(db);
    if (suscripciones.length === 0) return vacio;

    const contenido = JSON.stringify(avisoDePedido(pedido, unidades));

    const resultados = await Promise.race([
      Promise.all(suscripciones.map((suscripcion) => enviarA(suscripcion, contenido))),
      new Promise((resolver) => setTimeout(() => resolver(null), LIMITE_DE_ESPERA_MS))
    ]);

    // Se acabó el tiempo: los envíos siguen su curso, pero el pedido no espera.
    if (resultados === null) return vacio;

    const muertas = resultados.filter(Boolean);
    if (muertas.length > 0) {
      await db.from('suscripciones_push').delete().in('id', muertas);
    }

    return { enviados: suscripciones.length - muertas.length, borrados: muertas.length };
  } catch (error) {
    console.error('No se pudo avisar del pedido:', error);
    return vacio;
  }
}
