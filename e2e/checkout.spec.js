import { test, expect } from '@playwright/test';
import { PEDIDO_CREADO } from './apoyo/datos.js';
import { conCatalogo, conPedidoCreado, conPedidoRechazado } from './apoyo/api.js';
import { agregarAlCarrito, abrirCarrito, completarCheckout } from './apoyo/flujos.js';

/**
 * El recorrido que da plata: agregar, abrir el carrito, llenar los datos y
 * recibir el número de pedido.
 *
 * Es el único camino que toca todas las piezas a la vez —catálogo, carrito,
 * formulario, API y confirmación—, y por eso es el que justifica tener E2E.
 */

test('un pedido completo termina mostrando el número de pedido', async ({ page }) => {
  await conCatalogo(page);
  const enviados = await conPedidoCreado(page, PEDIDO_CREADO);

  await page.goto('/akaristudio/productos');
  await agregarAlCarrito(page, 'Kit de uñas acrílicas');

  const carrito = await abrirCarrito(page);
  await expect(carrito).toContainText('L 850.00');
  await carrito.getByRole('button', { name: 'Realizar Pedido' }).click();

  await completarCheckout(page, { pago: 'Transferencia' });

  await expect(page.getByText('¡Pedido Confirmado!')).toBeVisible();
  await expect(page.getByText('AK-001042')).toBeVisible();

  // El carrito queda vacío: si no, la clienta podría pedir dos veces lo mismo
  // creyendo que el primer intento no salió.
  await expect(page.locator('.cart-count')).toHaveText('0');

  // Lo que viaja al servidor es solo el id y la cantidad. El precio y el total
  // los calcula la base (ADR-001): si el navegador pudiera mandarlos, se
  // pediría un producto de L 850 por L 1.
  expect(enviados).toHaveLength(1);
  expect(enviados[0].payment).toBe('transferencia');
  expect(enviados[0].items).toEqual([{ id: 1, qty: 1 }]);
  expect(Object.keys(enviados[0].items[0]).sort()).toEqual(['id', 'qty']);
});

test('si la base rechaza el pedido, se ve el motivo y el carrito no se vacía', async ({ page }) => {
  await conCatalogo(page);
  await conPedidoRechazado(page, 'Solo quedan 1 unidades de Labial mate rojo.');

  await page.goto('/akaristudio/productos');
  await agregarAlCarrito(page, 'Labial mate rojo');

  const carrito = await abrirCarrito(page);
  await carrito.getByRole('button', { name: 'Realizar Pedido' }).click();
  await completarCheckout(page);

  // El mensaje que se muestra es el que mandó la base, no uno genérico: la
  // clienta tiene que entender por qué no se pudo.
  await expect(page.getByText('Solo quedan 1 unidades de Labial mate rojo.')).toBeVisible();
  await expect(page.getByText('¡Pedido Confirmado!')).toHaveCount(0);
  await expect(page.locator('.cart-count')).toHaveText('1');
});
