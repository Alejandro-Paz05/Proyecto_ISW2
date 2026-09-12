import { test, expect } from '@playwright/test';

/**
 * La parte de PWA: que la tienda siga abriendo con el dispositivo sin
 * internet.
 *
 * Es lo único que no se puede probar con Vitest ni a ojo: hace falta un
 * navegador de verdad que registre el service worker, guarde las copias y
 * después se quede sin red.
 */

// El resto de las pruebas bloquea el service worker para que no interfiera
// con las respuestas simuladas. Acá es justamente lo que se prueba.
test.use({ serviceWorkers: 'allow' });

/** El service worker se registra después del load, no durante. */
async function esperarAlServiceWorker(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

test('una página ya visitada sigue abriendo sin internet', async ({ page, context }) => {
  await page.goto('/akaristudio/productos');
  await esperarAlServiceWorker(page);

  // La primera visita no pasa por el worker: recién se registró. Al recargar,
  // el worker intercepta la navegación y guarda la copia que se usará después.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Abrir carrito' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('button', { name: 'Abrir carrito' })).toBeVisible();
});

test('una página nunca visitada muestra la pantalla sin conexión', async ({ page, context }) => {
  await page.goto('/akaristudio');
  await esperarAlServiceWorker(page);
  await page.reload();

  await context.setOffline(true);
  await page.goto('/akaristudio/productos');

  // No el error del navegador: la página propia, precargada al instalar.
  await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
});
