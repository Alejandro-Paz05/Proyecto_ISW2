import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase para uso EXCLUSIVO en el servidor (API routes).
 *
 * Usa la clave `service_role`, que salta Row Level Security. Por eso
 * ninguna de estas variables lleva el prefijo NEXT_PUBLIC_: si lo
 * llevaran, Next.js las incrustaría en el bundle del navegador y
 * cualquiera podría leer y borrar los pedidos de los clientes.
 *
 * El navegador nunca habla con Supabase directamente: pasa siempre por
 * /api/products y /api/orders.
 */

let client = null;

export function getSupabaseAdmin() {
  if (typeof window !== 'undefined') {
    throw new Error(
      'getSupabaseAdmin() solo puede usarse en el servidor. ' +
        'Consulta los datos desde /api/products o /api/orders.'
    );
  }

  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing = [
    !url && 'SUPABASE_URL',
    !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY'
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno: ${missing.join(', ')}. ` +
        'Copia env.example a .env.local y completa los valores.'
    );
  }

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return client;
}
