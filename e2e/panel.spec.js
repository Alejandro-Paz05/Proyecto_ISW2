import { test, expect } from '@playwright/test';
import { PEDIDOS_DEL_PANEL } from './apoyo/datos.js';
import {
  conPedidosDelPanel,
  conCambioDeEstado,
  conCatalogoDelPanel,
  conImagenSubida
} from './apoyo/api.js';
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

  // Con o sin ?volver=: el login recuerda a dónde se quería ir.
  await expect(page).toHaveURL(/\/akaristudio\/admin\/login(\?|$)/);
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

test('una contraseña incorrecta no abre el panel', async ({ page }) => {
  await iniciarSesionEnElPanel(page, 'esta-no-es-la-buena');

  await expect(page.getByText('Contraseña incorrecta.')).toBeVisible();
  // Con o sin ?volver=: el login recuerda a dónde se quería ir.
  await expect(page).toHaveURL(/\/akaristudio\/admin\/login(\?|$)/);
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

// Un PNG de 1x1 transparente: lo mínimo que el servidor reconoce como imagen.
const PNG_MINIMO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test('una foto elegida en la computadora se sube y queda en el formulario', async ({ page }) => {
  await conCatalogoDelPanel(page, []);
  const subidas = await conImagenSubida(page, 'https://ejemplo.test/foto-subida.png');

  await iniciarSesionEnElPanel(page, PASSWORD);
  // El ingreso todavía está navegando: pedir otra página en el medio la aborta.
  await expect(page).toHaveURL(/\/akaristudio\/admin$/);

  await page.goto('/akaristudio/admin/productos');
  await page.getByRole('button', { name: '+ Agregar producto' }).click();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'esmalte.png',
    mimeType: 'image/png',
    buffer: PNG_MINIMO
  });

  // La dirección que devolvió el servidor queda en el campo y en la vista previa.
  await expect(page.getByPlaceholder('https://...')).toHaveValue(
    'https://ejemplo.test/foto-subida.png'
  );
  await expect(page.locator('.admin-vista-previa img')).toHaveAttribute(
    'src',
    'https://ejemplo.test/foto-subida.png'
  );

  // Viajaron los bytes del archivo, no su nombre.
  expect(subidas).toHaveLength(1);
  expect(Buffer.from(subidas[0])).toEqual(PNG_MINIMO);
});

test('cambiar el estado de un pedido lo envía al servidor', async ({ page }) => {
  await conPedidosDelPanel(page, PEDIDOS_DEL_PANEL);
  const enviados = await conCambioDeEstado(page, 42);

  await iniciarSesionEnElPanel(page, PASSWORD);
  await page.getByLabel('Estado del pedido AK-001042').selectOption('enviado');

  await expect.poll(() => enviados.length).toBe(1);
  expect(enviados[0]).toEqual({ status: 'enviado' });
});
