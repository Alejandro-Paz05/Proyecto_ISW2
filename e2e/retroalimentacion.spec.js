import { test, expect } from '@playwright/test';
import { conCatalogo, conRetroalimentacion } from './apoyo/api.js';

/**
 * Dejar un comentario desde la tienda.
 *
 * Lo que las pruebas de /api/feedback no pueden ver: que el botón esté donde
 * la clienta lo encuentra, que el formulario se pueda completar y que lo que
 * viaja al servidor sea lo que ella eligió.
 */

test('una clienta reporta un problema desde el pie de la tienda', async ({ page }) => {
  await conCatalogo(page);
  const enviados = await conRetroalimentacion(page);

  await page.goto('/akaristudio/productos');
  await page.getByRole('button', { name: '¿Algo que mejorar? Contanos' }).click();

  const formulario = page.getByRole('dialog', { name: 'Contanos' });
  await formulario.locator('.payment-option', { hasText: 'Problema' }).click();
  await formulario.getByLabel('Tu mensaje').fill('No me carga la foto del labial rojo.');
  await formulario.getByRole('button', { name: 'Enviar' }).click();

  await expect(page.getByRole('heading', { name: '¡Gracias por contarnos!' })).toBeVisible();
  await expect(page.getByText('Quedó anotado para revisarlo y corregirlo.')).toBeVisible();

  expect(enviados).toHaveLength(1);
  expect(enviados[0]).toMatchObject({
    tipo: 'problema',
    mensaje: 'No me carga la foto del labial rojo.',
    pagina: '/akaristudio/productos'
  });
  // La trampa para bots viaja vacía: una persona no la ve.
  expect(enviados[0].sitio_web).toBe('');
});
