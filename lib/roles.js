/**
 * Quién es quién, sin nada de servidor.
 *
 * Los roles y lo que cada uno puede vivían en lib/sesion.js, que importa el
 * cliente de Supabase y node:crypto. Con solo mencionar uno de estos valores
 * al dibujar una página, Next arrastraba todo eso al código que descarga la
 * clienta. Acá no hay más que listas y funciones puras, así que sirve igual
 * en el navegador y en el servidor.
 *
 * lib/sesion.js los reexporta, para que las rutas de API sigan pidiéndoselos
 * al módulo que se ocupa de los permisos.
 *
 * Deben coincidir con el CHECK de profiles.role en
 * supabase/migraciones/005_perfiles_y_roles.sql.
 */

export const ROLES = ['clienta', 'duena', 'admin', 'super_admin'];

export const DESCRIPCION_DE_ROL = {
  clienta: 'Compra y ve sus pedidos',
  duena: 'Gestiona pedidos y catálogo',
  admin: 'Todo, más tickets y cuentas',
  super_admin: 'Ve todo, no modifica nada'
};

/** Quiénes entran al panel de la tienda: pedidos y productos. */
export const PANEL_TIENDA = ['duena', 'admin', 'super_admin'];

/** Quiénes entran al portal del sistema: tickets, retroalimentación y cuentas. */
export const PORTAL_SISTEMA = ['admin', 'super_admin'];

/**
 * El super_admin es la cuenta de quien revisa el proyecto: ve todo y no
 * cambia nada. Un revisor no tiene por qué poder cancelar el pedido real de
 * una clienta.
 */
export function puedeEscribir(rol) {
  return rol !== 'super_admin';
}

/** El portal que le corresponde a cada rol. */
export function destinoSegunRol(rol) {
  if (PORTAL_SISTEMA.includes(rol)) return '/akaristudio/sistema';
  if (PANEL_TIENDA.includes(rol)) return '/akaristudio/admin';
  return '/akaristudio/cuenta';
}
