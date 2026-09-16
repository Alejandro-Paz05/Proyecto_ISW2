import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente de Supabase para el navegador.
 *
 * Sirve únicamente para iniciar y cerrar sesión. Los datos se siguen pidiendo
 * a las rutas de API, igual que antes: ver ADR-004, que revisa en ese solo
 * punto la ADR-002.
 *
 * Usa la clave publicable, que es pública por diseño. La sesión queda en
 * cookies y no en localStorage, que es lo que permite que el servidor la lea
 * en cada petición.
 *
 * Devuelve null si faltan las variables: la página de ingreso lo usa para
 * no ofrecer cuentas que todavía no funcionan.
 */

let cliente = null;

export function supabaseNavegador() {
  // Referencias literales a propósito: Next.js solo incrusta en el bundle las
  // variables NEXT_PUBLIC_ que aparecen escritas así.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !clave) return null;

  cliente ??= createBrowserClient(url, clave);
  return cliente;
}
