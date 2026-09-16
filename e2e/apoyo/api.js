/**
 * Intercepta las rutas de API en el navegador.
 *
 * La petición no llega al servidor: Playwright la responde con datos fijos.
 * Es lo que permite correr los E2E contra la aplicación real sin credenciales
 * de Supabase, sin depender del stock del día y sin que una prueba de compra
 * cree un pedido de verdad que la dueña vería en su panel.
 *
 * Todo lo demás sí es real: el HTML lo renderiza Next, el carrito guarda en
 * localStorage y la cookie de sesión la firma el servidor.
 */

import { CATEGORIAS, PRODUCTOS } from './datos.js';

const comoJSON = (cuerpo, estado = 200) => ({
  status: estado,
  contentType: 'application/json; charset=utf-8',
  body: JSON.stringify(cuerpo)
});

/** El catálogo y sus categorías. */
export async function conCatalogo(page, { productos = PRODUCTOS, categorias = CATEGORIAS } = {}) {
  await page.route('**/api/products', (ruta) => ruta.fulfill(comoJSON(productos)));
  await page.route('**/api/categories', (ruta) => ruta.fulfill(comoJSON(categorias)));
}

/**
 * El pedido se registra bien. Devuelve el array donde se van guardando los
 * cuerpos que envió el navegador, para poder comprobar qué viajó al servidor.
 */
export async function conPedidoCreado(page, pedido) {
  const enviados = [];

  await page.route('**/api/orders', (ruta) => {
    enviados.push(ruta.request().postDataJSON());
    return ruta.fulfill(comoJSON({ success: true, order: pedido }, 201));
  });

  return enviados;
}

/** La base rechaza el pedido, como cuando el stock ya no alcanza. */
export async function conPedidoRechazado(page, mensaje) {
  await page.route('**/api/orders', (ruta) => ruta.fulfill(comoJSON({ error: mensaje }, 400)));
}

/** La lista de pedidos que ve el panel. */
export async function conPedidosDelPanel(page, pedidos) {
  await page.route('**/api/admin/orders', (ruta) => ruta.fulfill(comoJSON(pedidos)));
}

/** El cambio de estado de un pedido, con lo que se envió en cada PATCH. */
export async function conCambioDeEstado(page, idDelPedido) {
  const enviados = [];

  await page.route(`**/api/admin/orders/${idDelPedido}`, (ruta) => {
    enviados.push(ruta.request().postDataJSON());
    return ruta.fulfill(comoJSON({ ok: true }));
  });

  return enviados;
}

/** La retroalimentación se guarda bien. Devuelve lo que envió el navegador. */
export async function conRetroalimentacion(page) {
  const enviados = [];

  await page.route('**/api/feedback', (ruta) => {
    enviados.push(ruta.request().postDataJSON());
    return ruta.fulfill(comoJSON({ ok: true }, 201));
  });

  return enviados;
}
