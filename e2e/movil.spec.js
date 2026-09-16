import { test, expect } from '@playwright/test';
import { conCatalogo } from './apoyo/api.js';

/**
 * La barra en un teléfono.
 *
 * Hasta acá los enlaces se escondían bajo 768px y no había nada que los
 * mostrara: en un celular la barra quedaba con el logo y el carrito, y a
 * Servicios, Productos y Contacto no se llegaba por ningún lado. En un salón,
 * donde casi todo el tráfico entra desde el teléfono, eso es el camino
 * principal del sitio.
 *
 * Es de las pocas cosas que solo se ven en un navegador con un viewport
 * chico: una prueba unitaria renderiza el componente sin CSS y los enlaces le
 * parecen visibles siempre.
 */

const TELEFONO = { width: 390, height: 844 };

test.use({ viewport: TELEFONO });

test.beforeEach(async ({ page }) => {
  await conCatalogo(page);
  await page.goto('/akaristudio');
});

const menu = (page) => page.locator('#menu-principal');
const enlaceDe = (page, nombre) => menu(page).getByRole('link', { name: nombre });

test('el menú abre y lleva a la tienda', async ({ page }) => {
  await expect(enlaceDe(page, 'Productos')).toBeHidden();

  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await expect(enlaceDe(page, 'Productos')).toBeVisible();

  await enlaceDe(page, 'Productos').click();

  await expect(page).toHaveURL(/\/akaristudio\/productos$/);
  // Se cierra al navegar: si quedara abierto taparía lo que se fue a ver.
  await expect(enlaceDe(page, 'Productos')).toBeHidden();
});

test('la tecla Escape lo cierra', async ({ page }) => {
  const boton = page.getByRole('button', { name: 'Abrir menú' });

  await boton.click();
  await expect(menu(page)).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(menu(page)).toBeHidden();
  await expect(boton).toBeVisible();
});

test('el botón dice si está abierto, para quien no ve la cruz', async ({ page }) => {
  const boton = page.getByRole('button', { name: 'Abrir menú' });
  await expect(boton).toHaveAttribute('aria-expanded', 'false');

  await boton.click();

  await expect(page.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
});

test.describe('en una pantalla de escritorio', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('no hay botón de menú: los enlaces ya están a la vista', async ({ page }) => {
    await expect(enlaceDe(page, 'Productos')).toBeVisible();
    await expect(page.getByRole('button', { name: /menú/i })).toHaveCount(0);
  });
});
