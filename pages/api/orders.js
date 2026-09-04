import { getSupabaseAdmin } from '@/lib/supabase';
import { invalidar, CLAVE_PRODUCTOS } from '@/lib/cache';

// Códigos de Postgres que corresponden a un error del cliente, no del
// servidor. `create_order` los usa para rechazar datos inválidos o
// stock insuficiente, y su mensaje sí es seguro mostrarle al usuario.
const CLIENT_ERROR_CODES = new Set(['22023', 'P0001']);

const MAX_ITEMS = 50;

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
      p_items: normalizedItems
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
    return res.status(500).json({ error: 'Error al procesar el pedido' });
  }
}
