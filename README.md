# Akari Studio

[![CI](https://github.com/Alejandro-Paz05/Proyecto_ISW2/actions/workflows/ci.yml/badge.svg)](https://github.com/Alejandro-Paz05/Proyecto_ISW2/actions/workflows/ci.yml)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=Alejandro-Paz05_Proyecto_ISW2&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Alejandro-Paz05_Proyecto_ISW2)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Alejandro-Paz05_Proyecto_ISW2&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Alejandro-Paz05_Proyecto_ISW2)

Sitio del salón de belleza **Akari Studio** (Honduras): tienda en línea con inventario en tiempo real, contacto directo por WhatsApp para agendar citas, y un panel de administración para gestionar pedidos y catálogo.

Proyecto de la asignatura **Ingeniería de Software II**.

**Código de verificación:** `LEARN-CAP-76080609`

## En producción

| | |
|---|---|
| Inicio | https://www.alejandropaz.xyz/akaristudio |
| Tienda | https://www.alejandropaz.xyz/akaristudio/productos |
| Panel de administración | https://www.alejandropaz.xyz/akaristudio/admin |
| Estado del servicio | https://www.alejandropaz.xyz/api/health |

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14 (Pages Router) + React 18 |
| Backend | API Routes de Next.js |
| Base de datos | Supabase (PostgreSQL) |
| Pruebas | Vitest + Testing Library |
| Integración continua | GitHub Actions |
| Despliegue | Vercel |

## Estructura

```
components/            Componentes de UI
  admin/               Envoltorio del panel
context/
  CartContext.jsx      Carrito: guarda solo ids y cantidades
  CatalogoContext.jsx  Catálogo, cargado una sola vez
lib/
  supabase.js          Cliente de Supabase, solo servidor
  admin-auth.js        Sesión del panel, con token firmado
  validar-producto.js  Validación del alta y edición de productos
  negocio.js           Datos de contacto y enlace de WhatsApp
  use-escape.js        Cierra los diálogos con la tecla Escape
  categorias.js        Categorías de productos y servicios
pages/
  akaristudio/         Sitio público: inicio y productos
  akaristudio/admin/   Panel: pedidos y productos
  api/                 Rutas de API
public/                Manifiesto, service worker, iconos, robots
scripts/               Generación de iconos y exportación del modelo
styles/                globals.css, whatsapp.css, admin.css
supabase/              Esquema, migraciones y datos de ejemplo
tests/                 Pruebas, espejando la estructura del código
docs/                  Arquitectura, ADR y modelo de datos
.github/workflows/     Integración continua
```

## Arquitectura

El documento completo, con los diagramas C4 en Mermaid, el flujo de un pedido y el modelo de datos, está en [docs/arquitectura.md](docs/arquitectura.md).

El modelo de datos se exporta a dos archivos, ambos con `node scripts/exportar-modelo.mjs`:

| Archivo | Qué contiene |
|---|---|
| [docs/db-export.json](docs/db-export.json) | Formato de intercambio: tablas, columnas, tipos, índices, relaciones, políticas RLS y el conteo real de filas |
| [docs/modelo-de-datos.json](docs/modelo-de-datos.json) | La versión anotada, con el porqué de cada decisión |

Salen de la misma declaración, así que no pueden desincronizarse entre sí. El script **verifica el modelo contra la base en producción antes de escribir nada**: comprueba que cada tabla exista, que las columnas coincidan una a una, y consulta cuántas filas tiene realmente cada una. Si algo no cuadra, no escribe los archivos y sale con código 1. Un modelo escrito a mano se desactualiza en silencio; este falla ruidosamente.

Decisiones registradas:

| ADR | Decisión |
|---|---|
| [ADR-001](docs/adr/ADR-001-reglas-de-negocio-en-la-base-de-datos.md) | Poner las reglas de integridad del negocio en la base de datos, no en la aplicación |
| [ADR-002](docs/adr/ADR-002-acceso-a-supabase-solo-desde-el-servidor.md) | Acceder a Supabase únicamente desde el servidor, nunca desde el navegador |
| [ADR-003](docs/adr/ADR-003-solicitud-de-citas-por-whatsapp.md) | Reemplazar la reserva en línea por una solicitud enviada por WhatsApp |

## Decisiones de diseño en resumen

**El navegador nunca habla con Supabase directamente.** Todo pasa por las API Routes. Por eso las credenciales no llevan el prefijo `NEXT_PUBLIC_`: una variable con ese prefijo queda incrustada en el JavaScript que descarga el usuario y es legible por cualquiera.

**Un pedido es una transacción atómica.** `create_order` bloquea las filas de producto con `SELECT ... FOR UPDATE`, verifica el stock, crea el pedido con sus ítems y descuenta el inventario. Si algo falla no quedan pedidos huérfanos, y dos compras simultáneas de la última unidad no pueden vender la misma cosa dos veces.

**Los precios y los totales se calculan en la base.** El navegador solo envía qué producto y cuánto. Si el total viniera del cliente, se podría enviar un pedido de L 4,500 por L 1.00 editando la petición.

**RLS activado.** El rol público `anon` solo puede leer el catálogo: `products` y `categories`. Las tablas con datos personales no tienen políticas, así que son inaccesibles desde fuera del servidor.

**La integridad del catálogo la sostiene la base.** `products.category` tiene una clave foránea contra `categories.key`. Antes la validación vivía solo en la aplicación, así que un INSERT hecho desde el panel de Supabase la saltaba entera y dejaba el producto invisible en la tienda.

**La bitácora de estados la escribe un trigger, no la aplicación.** Si dependiera de que la ruta de API se acuerde de insertar la fila, cambiar el estado desde el panel de Supabase perdería el registro.

**El panel se cierra solo si falta configuración.** Sin la variable `ADMIN_PASSWORD` responde 503 en vez de quedar abierto.

**Las citas no pasan por el sistema.** Un botón flotante abre WhatsApp con un saludo, y ahí la dueña acuerda el servicio, el día y la hora. No hay página, ruta de API ni tabla detrás.

## Configurar Supabase

1. Crea una cuenta gratuita en [supabase.com](https://supabase.com) y un proyecto nuevo.
2. En **SQL Editor** → **New query**, ejecuta:
   - [supabase/schema.sql](supabase/schema.sql) — las cinco tablas, los índices, las políticas RLS y las dos funciones
   - [supabase/seed.sql](supabase/seed.sql) — opcional, 16 productos de ejemplo
3. En **Project Settings** → **API**, copia la **Project URL** y la clave **`service_role`** (hay que pulsar *Reveal*).

Sobre una base que ya existía desde antes de septiembre de 2026, `schema.sql` no sirve: borra las tablas y las vuelve a crear vacías. Para agregar `categories` y `order_status_history` conservando los datos está [supabase/migracion-categorias-e-historial.sql](supabase/migracion-categorias-e-historial.sql), que es idempotente y corre dentro de una transacción.

> **La clave `service_role` es secreta.** Salta las políticas de seguridad de la base. Va únicamente en variables de entorno del servidor; nunca en el repositorio ni en código del navegador.

Los archivos [`citas.sql`](supabase/citas.sql) y [`citas-v2.sql`](supabase/citas-v2.sql) crearon la agenda de reserva en línea, que se retiró según la [ADR-003](docs/adr/ADR-003-solicitud-de-citas-por-whatsapp.md). Se conservan como referencia; para eliminar esas tablas de una base donde ya se ejecutaron, está [`eliminar-citas.sql`](supabase/eliminar-citas.sql).

## Cargar el catálogo

La forma normal de administrar el catálogo es el panel, en `/akaristudio/admin/productos`. Para una carga masiva inicial, desde el **SQL Editor**:

```sql
-- Vaciar el catálogo de ejemplo. Los pedidos ya registrados conservan
-- el nombre y el precio con que se vendieron, porque order_items guarda
-- su propia copia.
DELETE FROM products;

INSERT INTO products (name, category, price, description, image, stock) VALUES
('Nombre del producto', 'unas', 450, 'Descripción que verá el cliente.', 'https://url-de-la-imagen.jpg', 10);
```

Categorías válidas: `unas`, `pestanas`, `cejas`, `maquillaje` y `accesorios`.

## Variables de entorno

Copia `env.example` a `.env.local` y completa:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<la clave service_role de tu proyecto>
ADMIN_PASSWORD=<una contraseña de 8 caracteres o más>
```

Las mismas tres hacen falta en el despliegue.

Los valores de arriba son marcadores de posición: en este repositorio no hay ninguna credencial real, ni en los archivos ni en el historial. Las reales viven en `.env.local`, que está en `.gitignore`, y en las variables de entorno de Vercel.

## Ejecutar localmente

```bash
npm install
npm run dev
```

Abre [http://localhost:3000/akaristudio](http://localhost:3000/akaristudio).

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Corre las pruebas una vez |
| `npm run test:coverage` | Pruebas con reporte de cobertura |
| `npm run test:watch` | Pruebas en modo continuo |
| `npm run lint` | Revisa el código con ESLint |
| `npm run build` | Compila para producción |
| `npm start` | Sirve la build compilada |
| `node scripts/generar-iconos.mjs` | Regenera los iconos de la aplicación |
| `node scripts/exportar-modelo.mjs` | Exporta el modelo de datos, verificándolo contra la base |

> No ejecutes `npm run build` con el servidor de desarrollo encendido: ambos escriben en `.next` y se pisan.

## Pruebas

226 pruebas con Vitest, jsdom y Testing Library, en `tests/`, espejando la estructura del código. La cobertura de líneas es del **97%** sobre el código con lógica. Los resúmenes que leen las herramientas —[`coverage/lcov.info`](coverage/lcov.info) y [`coverage/coverage-summary.json`](coverage/coverage-summary.json)— están versionados, para que la cifra se pueda comprobar leyendo el repositorio en vez de confiar en una captura.

| Archivo | Qué cubre |
|---|---|
| `tests/context/CartContext.test.jsx` | Límites de stock, precios frescos, reconciliación del carrito |
| `tests/context/CatalogoContext.test.jsx` | Carga del catálogo y respaldo de categorías sin conexión |
| `tests/api/orders.test.js` | Validación de pedidos y traducción de errores de la base |
| `tests/lib/admin-auth.test.js` | Tokens de sesión, firma y protección de rutas |
| `tests/lib/validar-producto.test.js` | Alta y edición de productos |
| `tests/lib/negocio.test.js` | Enlace de WhatsApp y codificación del mensaje |
| `tests/lib/use-escape.test.jsx` | Cierre de diálogos con Escape |
| `tests/api/health.test.js` | Healthcheck: 503 ante base caída, sin filtrar detalles |
| `tests/api/products.test.js` | Catálogo público y manejo de errores |
| `tests/api/categories.test.js` | Categorías públicas, orden y cacheo |
| `tests/api/admin-sesion.test.js` | Login, cierre de sesión y retardo ante intentos fallidos |
| `tests/api/admin-orders.test.js` | Pedidos del panel: acceso, estados y validaciones |
| `tests/api/admin-products.test.js` | Alta, edición y baja de productos |
| `tests/helpers/` | Simulacros de req/res y del cliente de Supabase |

No hacen falta credenciales ni conexión a Supabase: el cliente de base de datos se simula.

Están fuera de `pages/` a propósito. Next.js convierte en ruta todo lo que hay en esa carpeta, así que un archivo de pruebas junto al código se publicaba como un endpoint real en producción.

Cada push ejecuta lint, pruebas con cobertura, build y análisis de SonarQube Cloud en GitHub Actions ([ci.yml](.github/workflows/ci.yml)). La configuración del análisis está en [sonar-project.properties](sonar-project.properties).

## Desplegar en Vercel

1. Sube el repositorio a GitHub.
2. En [vercel.com](https://vercel.com): **Add New** → **Project** → importa el repositorio.
3. En **Environment Variables** agrega las tres variables de arriba, en los tres entornos.
4. **Deploy**.

Las variables se leen al construir: después de cambiar una hay que redesplegar.

## Funcionalidades

**Citas**

- Botón flotante que abre WhatsApp con un saludo ya escrito
- El servicio, el día y la hora los acuerda la dueña por chat

**Tienda**

- Catálogo con filtro por categoría e inventario en tiempo real
- Carrito persistente que se reconcilia contra el catálogo al volver
- Checkout como invitado, sin crear cuenta
- Descuento automático de stock, a prueba de pedidos simultáneos
- Número de pedido correlativo (`AK-001000`, `AK-001001`, …)

**Panel de administración**

- Pedidos con detalle, datos de contacto y cambio de estado
- Alta, edición y baja de productos con precio, stock e imagen
- Acceso con contraseña, sesión en cookie httpOnly firmada

**Aplicación instalable**

- Manifiesto, service worker e iconos generados por código
- Funciona con la red caída para lo ya visitado, con página propia sin conexión
- Cabeceras de seguridad, Open Graph, `robots.txt` y `sitemap.xml`

## Limitaciones conocidas

- **Los datos de contacto son de relleno.** Teléfono, correo y dirección están marcados con `PENDIENTE` en [`lib/negocio.js`](lib/negocio.js) y hay que reemplazarlos por los reales, incluido el número de WhatsApp al que llegan las solicitudes.
- **El pago no es real.** El método de pago se guarda como texto, pero no hay cobro. Integrar una pasarela (Stripe, PayPal o Tigo Money) es trabajo pendiente.
- **No se envían correos.** La confirmación muestra el número de pedido; el contacto es manual.
- **Las citas no quedan registradas.** Viven en el historial del chat, no en la base. Fue una decisión consciente: ver la [ADR-003](docs/adr/ADR-003-solicitud-de-citas-por-whatsapp.md).
