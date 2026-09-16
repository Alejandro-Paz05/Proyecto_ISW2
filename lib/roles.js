/**
 * Los roles del sistema.
 *
 * Viven en su propio módulo porque los necesitan los dos lados: el servidor,
 * para decidir quién entra a dónde, y el navegador, para dibujar el selector
 * de la página de cuentas. lib/sesion.js no sirve para eso: importa el
 * cliente de Supabase y node:crypto, y con solo mencionarlo en el render
 * Next los arrastraría al código que descarga la clienta.
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
