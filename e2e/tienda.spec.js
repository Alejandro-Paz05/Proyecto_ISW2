import { test, expect } from '@playwright/test';
import { PRODUCTOS } from './apoyo/datos.js';
import { conCatalogo } from './apoyo/api.js';
import { tarjetaDe, agregarAlCarrito } from './apoyo/flujos.js';

/**
 * El catálogo tal como lo ve una clienta: qué se muestra, qué se puede
 * agregar y qué no.
 *
 * El límite de stock ya está probado en tests/context/CartContext.test.jsx.
 * Acá se comprueba algo distinto: que ese límite llegue hasta el botón y la
 * clienta no pueda pulsarlo.
 */

test.beforeEach(async ({ page }) => {
  await conCatalogo(page);
  await page.goto('/akaristudio/productos');
});

test('muestra el catálogo que devuelve la API', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Kit de uñas acrílicas' })).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(PRODUCTOS.length);
  await expect(tarjetaDe(page, 'Kit de uñas acrílicas')).toContainText('L 850.00');
});

test('el filtro deja solo los productos de esa categoría', async ({ page }) => {
  await page.getByRole('button', { name: 'Maquillaje', exact: true }).click();

  await expect(page.locator('.product-card')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Labial mate rojo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kit de uñas acrílicas' })).toBeHidden();
});

test('un producto agotado no se puede agregar', async ({ page }) => {
  const tarjeta = tarjetaDe(page, 'Base de maquillaje HD');

  await expect(tarjeta.getByText('Agotado')).toBeVisible();
  await expect(tarjeta.getByRole('button', { name: 'Agregar' })).toHaveCount(0);
});

test('avisa cuando queda poco stock', async ({ page }) => {
  await expect(tarjetaDe(page, 'Pestañas de seda volumen ruso')).toContainText('¡Solo quedan 2!');
  await expect(tarjetaDe(page, 'Labial mate rojo')).toContainText('¡Última unidad!');
});

test('no deja agregar más unidades de las que hay en stock', async ({ page }) => {
  const tarjeta = tarjetaDe(page, 'Pestañas de seda volumen ruso'); // stock: 2
  const agregar = tarjeta.getByRole('button', { name: 'Agregar' });

  await agregar.click();
  await agregar.click();

  // Agotado el stock desde el carrito, el botón deja de ser pulsable en vez
  // de aceptar una tercera unidad que el servidor rechazaría después.
  await expect(tarjeta.getByRole('button', { name: 'En el carrito' })).toBeDisabled();
  await expect(page.locator('.cart-count')).toHaveText('2');
});

test('el carrito sobrevive a recargar la página', async ({ page }) => {
  await agregarAlCarrito(page, 'Kit de uñas acrílicas');
  await expect(page.locator('.cart-count')).toHaveText('1');

  await page.reload();

  await expect(page.locator('.cart-count')).toHaveText('1');
});
