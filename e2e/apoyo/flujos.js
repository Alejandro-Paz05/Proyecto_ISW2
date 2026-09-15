/**
 * Pasos que se repiten en varias pruebas, escritos una sola vez.
 *
 * Cada uno hace lo que haría una clienta: buscar la tarjeta por su nombre,
 * abrir el carrito desde el botón del menú, llenar el formulario. Ninguno
 * toca el estado interno de React.
 */

import { expect } from '@playwright/test';

/** La tarjeta de un producto, buscada por el nombre que se ve en pantalla. */
export function tarjetaDe(page, nombre) {
  return page.locator('.product-card', { hasText: nombre });
}

export async function agregarAlCarrito(page, nombre) {
  await tarjetaDe(page, nombre).getByRole('button', { name: 'Agregar' }).click();
}

/** Abre el carrito y devuelve el panel, ya listo para buscar dentro. */
export async function abrirCarrito(page) {
  await page.getByRole('button', { name: 'Abrir carrito' }).click();
  return page.getByRole('dialog', { name: 'Carrito de compras' });
}

const CLIENTA = {
  nombre: 'María López',
  correo: 'maria@ejemplo.com',
  telefono: '+504 9999-0000',
  direccion: 'San Pedro Sula, Bosques de Jucutuma 1'
};

/**
 * Llena el formulario de checkout y lo envía. Devuelve el diálogo, por si la
 * prueba necesita comprobar que siguió abierto.
 */
export async function completarCheckout(page, { pago = 'Efectivo', clienta = CLIENTA } = {}) {
  const formulario = page.getByRole('dialog', { name: 'Finalizar Pedido' });

  await formulario.getByLabel('Nombre completo').fill(clienta.nombre);
  await formulario.getByLabel('Correo electrónico').fill(clienta.correo);
  await formulario.getByLabel('Número de celular').fill(clienta.telefono);
  await formulario.getByLabel('Dirección de entrega').fill(clienta.direccion);
  // Se pulsa la etiqueta y no el input: el radio real está debajo de su propio
  // icono y su texto, así que nadie hace clic sobre él. Comprobar después que
  // quedó marcado verifica, de paso, que la etiqueta esté bien asociada, que
  // es lo que hace usable el formulario con teclado y con lector de pantalla.
  await formulario.locator('.payment-option', { hasText: pago }).click();
  await expect(formulario.getByRole('radio', { name: new RegExp(pago) })).toBeChecked();

  await formulario.getByRole('button', { name: 'Confirmar Pedido' }).click();

  return formulario;
}

/**
 * Entra al panel con la contraseña compartida del servidor de pruebas.
 *
 * Es el acceso temporal de la transición. El servidor de las E2E arranca sin
 * las variables públicas de Supabase, así que es el único formulario que se
 * muestra; los selectores igual nombran el campo completo, para no confundirlo
 * con el de correo y contraseña cuando los dos convivan.
 */
export async function iniciarSesionEnElPanel(page, password) {
  await page.goto('/akaristudio/admin/login');
  await page.getByLabel('Contraseña del panel').fill(password);
  await page.getByRole('button', { name: 'Entrar con la contraseña del panel' }).click();
}
