import { test, expect } from '@playwright/test';
import { PEDIDOS_DEL_PANEL } from './apoyo/datos.js';
import { conPedidosDelPanel, conCambioDeEstado } from './apoyo/api.js';
import { iniciarSesionEnElPanel } from './apoyo/flujos.js';

/**
 * El control de acceso del panel, probado de punta a punta.
 *
 * Acá no se simula nada de la sesión: el servidor firma el token con HMAC, lo
 * manda en una cookie httpOnly y getServerSideProps la verifica en cada
 * visita. Lo único simulado es la lista de pedidos, que vendría de Supabase.
 */

// La define playwright.config.mjs, que la sortea y se la pasa tanto al
// servidor de pruebas como a este proceso.
const PASSWORD = process.env.ADMIN_PASSWORD;

test('sin sesión, el panel redirige al login', async ({ page }) => {
  await page.goto('/akaristudio/admin');

  await expect(page).toHaveURL(/\/akaristudio\/admin\/login$/);
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

test('una contraseña incorrecta no abre el panel', async ({ page }) => {
  await iniciarSesionEnElPanel(page, 'esta-no-es-la-buena');

  await expect(page.getByText('Contraseña incorrecta.')).toBeVisible();
  await expect(page).toHaveURL(/\/akaristudio\/admin\/login$/);
});

test('con la contraseña correcta se entra y se ven los pedidos', async ({ page }) => {
  await conPedidosDelPanel(page, PEDIDOS_DEL_PANEL);

  await iniciarSesionEnElPanel(page, PASSWORD);

  await expect(page).toHaveURL(/\/akaristudio\/admin$/);
  await expect(page.getByText('AK-001042')).toBeVisible();
  await expect(page.getByText('María López')).toBeVisible();

  // El total facturado excluye los cancelados: 1110 + 420.
  await expect(page.getByText('L 1530.00')).toBeVisible();
});

test('cambiar el estado de un pedido lo envía al servidor', async ({ page }) => {
  await conPedidosDelPanel(page, PEDIDOS_DEL_PANEL);
  const enviados = await conCambioDeEstado(page, 42);

  await iniciarSesionEnElPanel(page, PASSWORD);
  await page.getByLabel('Estado del pedido AK-001042').selectOption('enviado');

  await expect.poll(() => enviados.length).toBe(1);
  expect(enviados[0]).toEqual({ status: 'enviado' });
});
