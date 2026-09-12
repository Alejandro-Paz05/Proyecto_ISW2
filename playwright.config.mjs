import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración de las pruebas E2E.
 *
 * Son la punta de la pirámide: pocas, lentas y caras de mantener, así que
 * cubren recorridos completos —comprar, entrar al panel, quedarse sin
 * internet— y no casos de borde. Esos ya están en las 271 pruebas de Vitest,
 * que corren en segundos.
 *
 * Las pruebas se ejecutan contra la aplicación real, compilada como en
 * producción: React, el router de Next, el carrito, localStorage y la cookie
 * de sesión firmada son los de verdad. Lo único que se simula son las
 * respuestas de las rutas de API, interceptadas en el navegador (ver
 * e2e/apoyo/api.js), para que ninguna prueba escriba en Supabase ni descuente
 * inventario real.
 */

const PUERTO = 3000;
const URL_LOCAL = `http://localhost:${PUERTO}`;

// El sitio en vivo, para el proyecto "humo". Se puede apuntar a otra parte
// —por ejemplo una vista previa— sin tocar este archivo.
const URL_PRODUCCION = process.env.URL_PRODUCCION ?? 'https://www.alejandropaz.xyz';

// Contraseña del panel para el servidor de pruebas.
//
// Se sortea en cada corrida en vez de dejar una escrita acá: en el
// repositorio no queda ninguna credencial, ni siquiera de mentira, y la
// prueba de login sirve igual porque comprueba el mecanismo —firmar el token,
// mandarlo en la cookie y verificarlo— y no un valor concreto.
//
// El proceso principal la deja en process.env antes de levantar el servidor y
// de repartir el trabajo, así que los workers heredan la misma. Si ya hay un
// servidor corriendo con su propia contraseña, exportá ADMIN_PASSWORD y se
// usa esa.
const PASSWORD_DEL_PANEL = process.env.ADMIN_PASSWORD ?? `e2e-${randomBytes(12).toString('hex')}`;
process.env.ADMIN_PASSWORD = PASSWORD_DEL_PANEL;

// Levantar el servidor local no tiene sentido cuando solo se corre el humo,
// que apunta a un sitio ya desplegado: serían dos minutos de build para nada.
const soloHumo = process.argv.some((argumento) => argumento.includes('humo'));

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,

  // Un .only olvidado hace que el pipeline pase habiendo corrido una sola
  // prueba, que es peor que fallar.
  forbidOnly: Boolean(process.env.CI),

  // Un reintento en CI y ninguno en local. En local un fallo intermitente hay
  // que verlo; en CI, volver a correr distingue una prueba frágil de una
  // regresión, y la traza del reintento queda guardada.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: URL_LOCAL,
    locale: 'es-HN',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',

    // El service worker se bloquea por defecto: si sirviera copias guardadas,
    // las respuestas simuladas de cada prueba dejarían de ser las que llegan a
    // la página. offline.spec.js lo vuelve a habilitar, porque ahí el worker
    // es justamente lo que se prueba.
    serviceWorkers: 'block'
  },

  projects: [
    {
      name: 'local',
      testIgnore: /humo\.spec\.js/,
      use: { ...devices['Desktop Chrome'] }
    },
    {
      // Solo lectura y contra el sitio publicado: sirve para comprobar un
      // despliegue, no para probar lógica. Se corre con `npm run e2e:humo`.
      name: 'humo',
      testMatch: /humo\.spec\.js/,
      use: { ...devices['Desktop Chrome'], baseURL: URL_PRODUCCION }
    }
  ],

  webServer: soloHumo
    ? undefined
    : {
        // Solo levantar, no compilar: del build se encarga `npm run e2e`
        // antes de llamar a Playwright. Compilar acá adentro metía los
        // minutos del build dentro de este timeout, y la corrida se caía sin
        // haber ejecutado una sola prueba.
        //
        // `next start` y no `next dev`: el service worker solo se registra en
        // producción, y así se prueba el mismo build que publica el pipeline.
        command: 'npm start',
        // Se espera a /akaristudio y no a la raíz: el sitio no tiene página en
        // `/` —responde 404— y Playwright no da por levantado un servidor que
        // contesta 404. El servidor arranca en menos de un segundo; lo que
        // parecía un arranque lento era esto.
        url: `${URL_LOCAL}/akaristudio`,
        // En local se reutiliza un servidor ya levantado. En CI nunca, para
        // que la corrida no dependa de nada que haya quedado de antes.
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ADMIN_PASSWORD: PASSWORD_DEL_PANEL,

          // Apuntan a un puerto muerto a propósito. Las pruebas interceptan
          // las rutas de API en el navegador, así que el servidor no debería
          // consultar nada; si alguna dejara de interceptar, la petición
          // falla en el acto en vez de ir a la base de la clienta. Sin esto,
          // `next start` toma las credenciales reales de .env.local.
          SUPABASE_URL: 'http://127.0.0.1:9999',
          SUPABASE_SERVICE_ROLE_KEY: 'las-pruebas-no-tocan-la-base'
        }
      }
});
