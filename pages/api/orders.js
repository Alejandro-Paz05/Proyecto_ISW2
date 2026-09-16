import { getSupabaseAdmin } from '@/lib/supabase';
import { reportarError } from '@/lib/errores';
import { cuentaDeSesion } from '@/lib/sesion';
import { invalidar, CLAVE_PRODUCTOS } from '@/lib/cache';
import { permitir, ipDe } from '@/lib/limite';

// Códigos de Postgres que corresponden a un error del cliente, no del
// servidor. `create_order` los usa para rechazar datos inválidos o
// stock insuficiente, y su mensaje sí es seguro mostrarle al usuario.
const CLIENT_ERROR_CODES = new Set(['22023', 'P0001']);

const MAX_ITEMS = 50;

// Cinco pedidos cada cuarto de hora desde la misma dirección. Una clienta que
// compra dos veces seguidas porque se olvidó algo entra sin enterarse; un
// script que crea pedidos en bucle, no. Acá el abuso no llena una tabla: cada
// pedido DESCUENTA INVENTARIO REAL, así que en media hora deja el catálogo en
// cero y a la dueña con cien pedidos falsos que cancelar.
const LIMITE = { maximo: 5, ventanaMs: 15 * 60 * 1000 };

// Debe coincidir con la restricción CHECK de orders.payment_method.
// Sin esta validación, un método inventado llega hasta el INSERT y la
// base responde con un check_violation, que el handler traduciría a un
// 500 en lugar del 400 que corresponde.
const PAYMENT_METHODS = new Set(['efectivo', 'tarjeta', 'transferencia']);

/**
 * Normaliza el carrito que llega del navegador a `[{ id, qty }]`.
 * Nombre, precio y total se ignoran a propósito: los pone la base de
 * datos. Si vinieran del cliente, cualquiera podría pedir un producto
 * de L 4,500 por L 1.
 */
function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
    return null;
  }

  const normalized = [];

  for (const item of items) {
    const id = Number(item?.id);
    const qty = Number(item?.qty);

    if (!Number.isInteger(id) || id <= 0) return null;
    if (!Number.isInteger(qty) || qty <= 0) return null;

    normalized.push({ id, qty });
  }

  return normalized;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { customer, items, payment } = req.body ?? {};

  const normalizedItems = normalizeItems(items);
  if (!normalizedItems) {
    return res.status(400).json({ error: 'El pedido no tiene productos válidos.' });
  }

  if (!PAYMENT_METHODS.has(payment)) {
    return res.status(400).json({ error: 'El método de pago no es válido.' });
  }

  if (!permitir(`pedidos:${ipDe(req)}`, LIMITE)) {
    return res.status(429).json({
      error:
        'Recibimos varios pedidos desde este dispositivo. Esperá unos minutos ' +
        'o escribinos por WhatsApp y lo tomamos por ahí.'
    });
  }

  // Si hay sesión, el pedido queda asociado a esa cuenta y la clienta lo ve
  // después en "Mis pedidos". Comprar como invitada sigue siendo la forma
  // normal, y deja la cuenta vacía. Si la sesión no se puede leer, el pedido
  // se toma como de invitada: perder una venta por eso sería mucho peor.
  const cuenta = await cuentaDeSesion(req, res).catch(() => null);

  try {
    // Una sola llamada: valida, reserva stock, crea el pedido y sus
    // items dentro de la misma transacción.
    // Ver supabase/migraciones/002_pedidos.sql.
    const { data, error } = await getSupabaseAdmin().rpc('create_order', {
      p_customer_name: customer?.name ?? '',
      p_customer_email: customer?.email ?? '',
      p_customer_phone: customer?.phone ?? '',
      p_customer_address: customer?.address ?? '',
      p_payment_method: payment ?? '',
      p_items: normalizedItems,
      p_user_id: cuenta?.id ?? null
    });

    if (error) {
      if (CLIENT_ERROR_CODES.has(error.code)) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }

    // El pedido descontó inventario: la copia del catálogo quedó vieja en
    // este mismo instante. Esperar a que venza mostraría como disponible
    // algo que se acaba de vender.
    invalidar(CLAVE_PRODUCTOS);

    return res.status(201).json({ success: true, order: data });
  } catch (error) {
    console.error('Error al crear pedido:', error);
    // Solo los errores inesperados llegan acá: los de validación ya salieron
    // como 400 y no son un bug. El cuerpo del pedido no viaja al ticket.
    await reportarError(error, { ruta: '/api/orders', metodo: req.method });
    return res.status(500).json({ error: 'Error al procesar el pedido' });
  }
}
