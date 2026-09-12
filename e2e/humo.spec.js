import { test, expect } from '@playwright/test';

/**
 * Humo contra el sitio publicado.
 *
 * No prueba lógica: comprueba que lo que está en internet responde, sirve el
 * catálogo real y no deja entrar al panel sin contraseña. Sirve para mirar un
 * despliegue, y por eso es de solo lectura: nada de crear pedidos en la base
 * de la clienta.
 *
 * Se corre aparte, con `npm run e2e:humo`. Apuntá a otra URL con la variable
 * URL_PRODUCCION.
 */

test('la portada carga y ofrece ir a la tienda', async ({ page }) => {
  await page.goto('/akaristudio');

  await expect(page.getByRole('link', { name: /Comprar productos/ })).toBeVisible();
});

test('el catálogo real muestra productos con precio', async ({ page }) => {
  await page.goto('/akaristudio/productos');

  const tarjetas = page.locator('.product-card');
  await expect(tarjetas.first()).toBeVisible();
  expect(await tarjetas.count()).toBeGreaterThan(0);
  await expect(tarjetas.first()).toContainText('L ');
});

test('el panel privado no se abre sin sesión', async ({ page }) => {
  await page.goto('/akaristudio/admin');

  await expect(page).toHaveURL(/\/akaristudio\/admin\/login$/);
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

test('el healthcheck dice que la base responde', async ({ request }) => {
  const respuesta = await request.get('/api/health');

  expect(respuesta.ok()).toBeTruthy();
  expect((await respuesta.json()).estado).toBe('ok');
});
