import { test, expect } from '@playwright/test';
import { PEDIDO_CREADO } from './apoyo/datos.js';
import { conCatalogo, conPedidoCreado } from './apoyo/api.js';
import { tarjetaDe, abrirCarrito, completarCheckout } from './apoyo/flujos.js';

/**
 * Comprar un producto que viene en varios colores.
 *
 * Es el recorrido que ninguna prueba unitaria cubre entera: elegir el color en
 * la tarjeta, que viaje al carrito como una línea propia y que llegue al
 * servidor dentro del pedido. Si eso se corta en algún punto, la dueña recibe
 * un pedido de "Balines" sin saber cuál de los dos preparar.
 */

const BALINES = 'Balines decorativos';

test.beforeEach(async ({ page }) => {
  await conCatalogo(page);
  await page.goto('/akaristudio/productos');
});

test('sin elegir color, el botón no deja agregar', async ({ page }) => {
  const tarjeta = tarjetaDe(page, BALINES);

  await expect(tarjeta.getByRole('button', { name: 'Elegí un color' })).toBeDisabled();
});

test('el color agotado se muestra, pero no se puede elegir', async ({ page }) => {
  const tarjeta = tarjetaDe(page, BALINES);

  // Que ese color exista pero no esté es información útil: esconderlo haría
  // pensar que nunca lo tuvieron.
  await expect(tarjeta.getByRole('button', { name: /Tornasol/ })).toBeVisible();
  await expect(tarjeta.getByRole('button', { name: /Tornasol/ })).toBeDisabled();
});

test('al elegir un color, el aviso de stock habla de ese color', async ({ page }) => {
  const tarjeta = tarjetaDe(page, BALINES);

  await tarjeta.getByRole('button', { name: /Plateado/ }).click();

  // Del plateado queda una sola unidad, aunque el producto tenga cinco.
  await expect(tarjeta).toContainText('¡Última unidad! en Plateado');
});

test('el color elegido llega hasta el pedido', async ({ page }) => {
  const enviados = await conPedidoCreado(page, PEDIDO_CREADO);
  const tarjeta = tarjetaDe(page, BALINES);

  await tarjeta.getByRole('button', { name: /Dorado/ }).click();
  await tarjeta.getByRole('button', { name: 'Agregar' }).click();

  const carrito = await abrirCarrito(page);
  // En el carrito se ve cuál de los dos es.
  await expect(carrito.locator('.cart-item')).toContainText('Dorado');

  await carrito.getByRole('button', { name: 'Realizar Pedido' }).click();
  await completarCheckout(page);

  await expect.poll(() => enviados.length).toBe(1);
  expect(enviados[0].items).toEqual([{ id: 5, qty: 1, color: 51 }]);
});

test('dos colores del mismo producto son dos líneas del carrito', async ({ page }) => {
  const tarjeta = tarjetaDe(page, BALINES);

  await tarjeta.getByRole('button', { name: /Dorado/ }).click();
  await tarjeta.getByRole('button', { name: 'Agregar' }).click();
  await tarjeta.getByRole('button', { name: /Plateado/ }).click();
  await tarjeta.getByRole('button', { name: 'Agregar' }).click();

  const carrito = await abrirCarrito(page);

  await expect(carrito.locator('.cart-item')).toHaveCount(2);
  await expect(carrito.locator('.cart-item').first()).toContainText('Dorado');
  await expect(carrito.locator('.cart-item').last()).toContainText('Plateado');
});
