# Akari Studio

[![AkariStudio CI/CD](https://github.com/Alejandro-Paz05/Proyecto_ISW2/actions/workflows/ci.yml/badge.svg)](https://github.com/Alejandro-Paz05/Proyecto_ISW2/actions/workflows/ci.yml)
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
| Cuentas | Supabase Auth: correo y Google |
| Pruebas | Vitest + Testing Library |
| Pruebas E2E | Playwright |
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
  supabase-navegador.js Cliente del navegador: solo para iniciar sesión
  sesion.js            Quién hace la petición y qué puede hacer
  roles.js             Roles y destinos. Sirve en el navegador y en el servidor
  errores.js           Convierte un error en ticket, agrupado por huella
  limite.js            Tope de peticiones por visitante
  admin-auth.js        Contraseña compartida del panel, en retirada
  validar-producto.js  Validación del alta y edición de productos
  negocio.js           Datos de contacto y enlace de WhatsApp
  use-escape.js        Cierra los diálogos con la tecla Escape
  use-sesion.js        Si hay sesión, para el enlace de la barra
  categorias.js        Categorías de productos y servicios
pages/
  akaristudio/         Sitio público: inicio y productos
  akaristudio/cuenta/  Mi cuenta: nombre y pedidos propios
  akaristudio/admin/   Panel de la tienda: pedidos, productos y retroalimentación
  akaristudio/sistema/ Portal del sistema: tickets y cuentas
  api/                 Rutas de API
  api/auth/            Adónde va cada quien después de entrar
  api/cuenta/          Los pedidos y el perfil de quien mira
  api/sistema/         Tickets y cuentas
public/                Manifiesto, service worker, iconos, robots
scripts/               Generación de iconos y exportación del modelo
styles/                globals.css, whatsapp.css, admin.css
supabase/              Esquema, migraciones y datos de ejemplo
tests/                 Pruebas, espejando la estructura del código
e2e/                   Recorridos completos con Playwright
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
| [ADR-004](docs/adr/ADR-004-supabase-auth-solo-para-la-identidad.md) | Usar Supabase Auth para la identidad, y solo para eso. Revisa la ADR-002 |
| [ADR-005](docs/adr/ADR-005-roles-y-portales.md) | Cuatro roles, dos portales y una cuenta que solo mira |

## Decisiones de diseño en resumen

**El navegador habla con Supabase para una sola cosa: iniciar sesión.** Todos los datos pasan por las API Routes, con la clave secreta. Las dos variables `NEXT_PUBLIC_` que existen son la URL y la clave publicable, que es pública por diseño; lo que protege los datos es RLS. El porqué y el costo de esa excepción están en la [ADR-004](docs/adr/ADR-004-supabase-auth-solo-para-la-identidad.md), que revisa la ADR-002 sin borrarla.

**Cada cuenta tiene un rol, y el rol se lee de la base.** Nunca de algo que mande el navegador. Una cuenta nueva siempre nace `clienta`; subir un rol es cosa de un admin. La cuenta que revisa el proyecto (`super_admin`) ve todo y recibe 403 ante cualquier escritura. Ver la [ADR-005](docs/adr/ADR-005-roles-y-portales.md).

**Los errores se convierten en tickets agrupados por huella.** Cien visitas a una página rota son un ticket con cien ocurrencias, no cien tickets. Y un problema que reporta una clienta abre su propio ticket, en la misma transacción que guarda el mensaje.

**Un pedido es una transacción atómica.** `create_order` bloquea las filas de producto con `SELECT ... FOR UPDATE`, verifica el stock, crea el pedido con sus ítems y descuenta el inventario. Si algo falla no quedan pedidos huérfanos, y dos compras simultáneas de la última unidad no pueden vender la misma cosa dos veces.

**Los precios y los totales se calculan en la base.** El navegador solo envía qué producto y cuánto. Si el total viniera del cliente, se podría enviar un pedido de L 4,500 por L 1.00 editando la petición.

**RLS activado.** El rol público `anon` solo puede leer el catálogo: `products` y `categories`. Las tablas con datos personales no tienen políticas, así que son inaccesibles desde fuera del servidor.

**La integridad del catálogo la sostiene la base.** `products.category` tiene una clave foránea contra `categories.key`. Antes la validación vivía solo en la aplicación, así que un INSERT hecho desde el panel de Supabase la saltaba entera y dejaba el producto invisible en la tienda.

**La bitácora de estados la escribe un trigger, no la aplicación.** Si dependiera de que la ruta de API se acuerde de insertar la fila, cambiar el estado desde el panel de Supabase perdería el registro.

**El panel se cierra solo si falta configuración.** Sin la variable `ADMIN_PASSWORD` responde 503 en vez de quedar abierto.

**Las citas no pasan por el sistema.** Un botón flotante abre WhatsApp con un saludo, y ahí la dueña acuerda el servicio, el día y la hora. No hay página, ruta de API ni tabla detrás.

## Configurar Supabase

1. Crea una cuenta gratuita en [supabase.com](https://supabase.com) y un proyecto nuevo.
2. En **SQL Editor** → **New query**, ejecuta los archivos de [supabase/migraciones/](supabase/migraciones/) **en orden numérico**, del `000` al `004`. Qué deja cada uno está en [supabase/README.md](supabase/README.md).
3. En **Project Settings** → **Data API** copia la **Project URL**, y en **Project Settings** → **API Keys** crea o copia una **Secret key** (hay que pulsar *Reveal*).

Las migraciones son **idempotentes**: correrlas de nuevo sobre una base que ya está al día no cambia nada y no da error. Vale igual para una base vacía que para una que ya venía funcionando, así que no hay dos caminos que mantener.

Para saber en qué estado está una base, `npm run db:estado` la consulta y dice qué falta. Sale con código 1 si falta alguna migración, así que sirve para cortar un despliegue antes de que el código pida una tabla que todavía no existe.

> **La Secret key no se comparte.** Salta las políticas de seguridad de la base. Va únicamente en variables de entorno del servidor; nunca en el repositorio ni en código del navegador. Las claves *legacy* basadas en JWT están desactivadas en este proyecto, así que no sirven como reemplazo.

En [supabase/historico/](supabase/historico/) quedan los scripts de la agenda de reserva en línea, que se retiró según la [ADR-003](docs/adr/ADR-003-solicitud-de-citas-por-whatsapp.md). **No hay que correrlos**: se conservan porque documentan una decisión que se tomó y se revirtió.

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

Copia [`env.example`](env.example) a `.env.local` y completa las tres variables que lista: la URL del proyecto de Supabase, su Secret key y la contraseña del panel, de 8 caracteres o más. Cada una tiene al lado un comentario que dice de dónde sale.

Las mismas tres hacen falta en el despliegue.

En este repositorio no hay ninguna credencial real, ni en los archivos ni en el historial. Las reales viven en `.env.local`, que está en `.gitignore`, y en las variables de entorno de Vercel.

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
| `npm run db:estado` | Dice qué migraciones le faltan a la base |
| `npm run db:exportar` | Exporta el modelo de datos, verificándolo contra la base |
| `npm run cuentas:crear` | Da de alta una cuenta del personal y le asigna el rol |
| `npm run iconos` | Regenera los iconos de la aplicación |

> No ejecutes `npm run build` con el servidor de desarrollo encendido: ambos escriben en `.next` y se pisan.

Los tres últimos se pueden correr las veces que haga falta sin pensarlo: los iconos se regeneran byte por byte idénticos, el exportador solo escribe si el modelo cambió de verdad, y `db:estado` no escribe nada.

## Caché

Tres capas, cada una con una regla distinta, porque no todos los datos envejecen igual.

| Dónde | Catálogo (`/api/products`) | Categorías (`/api/categories`) | Panel |
|---|---|---|---|
| Memoria del servidor | 10 s, invalidada al escribir | 5 min | no |
| Navegador y CDN | `private, no-cache` + ETag | `s-maxage=300` + `stale-while-revalidate` | `no-store` |
| Service worker | nunca | copia mientras revalida | nunca |

**El stock manda.** Un catálogo cacheado muestra como disponible algo que ya se vendió, y el usuario no se entera hasta que paga. Por eso el catálogo obliga a revalidar siempre, no entra al CDN —que compartiría la copia de un visitante con otro— y el service worker no lo toca. La caché en memoria dura diez segundos y **la invalida cualquier escritura**: un pedido descuenta inventario, y el propio `/api/orders` borra la clave antes de responder. Lo mismo hacen las tres rutas del panel que tocan productos.

**El ETag es la parte que rinde.** Aunque el catálogo no se pueda servir de una copia, sí se puede evitar reenviarlo: se consulta la base igual, y si el resultado es idéntico se responde `304` sin cuerpo. Correcto y más barato a la vez.

**Las categorías son lo contrario.** Cambian una vez cada varios meses y ninguna decisión depende de que estén al día, así que son la única ruta de API que el service worker guarda y la única que el CDN puede servir.

Cuando la base parpadea, `lib/cache.js` entrega la copia vencida en vez de fallar: un catálogo de hace un minuto no le hace daño a nadie y la alternativa es una pantalla de error. Y si diez visitas llegan juntas con la caché recién vencida, se agrupan en una sola consulta en lugar de lanzar diez idénticas justo en el peor momento.

### Qué hace Vercel con esto

Medido en producción, no supuesto:

| | Lo que envía el código | Lo que llega al navegador |
|---|---|---|
| `/api/products` | `private, no-cache, must-revalidate` | igual, con `X-Vercel-Cache: MISS` |
| `/api/categories` | `public, s-maxage=300, stale-while-revalidate=600` | `public`, con `X-Vercel-Cache: HIT` y `Age` |
| ETag | `W/"..."` de `lib/respuesta-cacheable.js` | uno propio de Vercel |

El edge se queda con el `s-maxage` para su propia caché y reescribe la cabecera que ve el cliente, y reemplaza el ETag por el suyo. El resultado es el buscado —el catálogo revalida siempre y devuelve `304` si nada cambió; las categorías se sirven desde el edge— pero en producción lo resuelve la plataforma.

El código de `respuesta-cacheable.js` no sobra por eso: es lo que responde en desarrollo, con `npm start` y en cualquier despliegue sin un edge que lo haga. Que Vercel coincida es una optimización, no la premisa.

## Pruebas

510 pruebas con Vitest, en `tests/`, espejando la estructura del código. De esas, 44 corren sobre un **PostgreSQL real** —PGlite, Postgres compilado a WebAssembly, sin instalar nada— y son las que comprueban las migraciones y las políticas de RLS rol por rol; el resto usa jsdom y Testing Library. La cobertura de líneas es del **97%** sobre el código con lógica. Los resúmenes que leen las herramientas —[`coverage/lcov.info`](coverage/lcov.info) y [`coverage/coverage-summary.json`](coverage/coverage-summary.json)— están versionados, para que la cifra se pueda comprobar leyendo el repositorio en vez de confiar en una captura.

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
| `tests/api/admin-imagen.test.js` | Subida de fotos: quién puede, qué se acepta y cuánto pesa |
| `tests/db/colores.test.js` | Colores con stock propio: la suma, el descuento y lo que la base no deja vender |
| `tests/api/galeria.test.js` | La galería pública, incluida la portada abriendo sin la tabla todavía creada |
| `tests/lib/push.test.js` | Avisos de pedidos: qué dicen, a quién llegan y cuándo se descarta un dispositivo |
| `tests/lib/sesion.test.js` | Quién entra a dónde, y el modo lectura del super admin |
| `tests/lib/errores.test.js` | La huella de un error: qué agrupa y qué separa |
| `tests/api/feedback.test.js` | Retroalimentación: validación, trampa para bots y límite |
| `tests/api/sistema-tickets.test.js` | Tickets: filtros, resolución y el choque de huellas |
| `tests/api/sistema-cuentas.test.js` | Cuentas: cambiar roles, y no poder cambiarse el propio |
| `tests/api/cuenta.test.js` | Mis pedidos y mi nombre |
| `tests/db/migraciones.test.js` | Las migraciones, corridas dos veces sobre Postgres |
| `tests/db/rls.test.js` | Las políticas de RLS, rol por rol y en las dos direcciones |
| `tests/db/tickets.test.js` | Agrupación de errores, regresiones y tickets de clientas |
| `tests/helpers/` | Simulacros de req/res, del cliente de Supabase y la base de PGlite |

No hacen falta credenciales ni conexión a Supabase: el cliente de base de datos se simula.

Están fuera de `pages/` a propósito. Next.js convierte en ruta todo lo que hay en esa carpeta, así que un archivo de pruebas junto al código se publicaba como un endpoint real en producción.

Cada push ejecuta lint, pruebas con cobertura, build y análisis de SonarQube Cloud en GitHub Actions ([ci.yml](.github/workflows/ci.yml)). La configuración del análisis está en [sonar-project.properties](sonar-project.properties).

## Pruebas de extremo a extremo

15 pruebas con [Playwright](https://playwright.dev) sobre Chromium, en [e2e/](e2e/). Son la punta de la pirámide: recorren caminos completos —comprar, entrar al panel, quedarse sin internet— y no casos de borde, que en Vitest cuestan milisegundos y acá costarían minutos.

| Archivo | Qué recorre |
|---|---|
| `e2e/tienda.spec.js` | Catálogo, filtros, agotado, límite de stock y carrito que sobrevive a una recarga |
| `e2e/checkout.spec.js` | Un pedido completo hasta el número de pedido, y el rechazo de la base |
| `e2e/panel.spec.js` | Login real: redirección sin sesión, contraseña incorrecta y cambio de estado |
| `e2e/offline.spec.js` | Service worker: una página visitada sin internet y la pantalla sin conexión |
| `e2e/retroalimentacion.spec.js` | Dejar un comentario desde el pie de la tienda |
| `e2e/humo.spec.js` | Humo contra el sitio publicado, de solo lectura |

```bash
npm run e2e         # compila, levanta el servidor y corre los recorridos
npm run e2e:ui      # modo interactivo, para escribir o depurar una prueba
npm run e2e:humo    # solo el humo, contra https://www.alejandropaz.xyz
```

**Corren contra la aplicación real, pero no contra la base real.** Playwright compila el proyecto y levanta `next start`, así que el HTML, el router, el carrito, `localStorage` y la cookie de sesión son los de producción. Lo único simulado son las respuestas de las rutas de API, interceptadas en el navegador desde [e2e/apoyo/api.js](e2e/apoyo/api.js). Por eso no hacen falta credenciales: ninguna petición llega hasta Supabase.

Esa frontera es deliberada. Un E2E que comprara de verdad crearía un pedido en la base de la clienta y descontaría inventario en cada corrida del pipeline. Y al revés: el catálogo real cambia de stock con cada venta, así que una prueba que dependiera de él fallaría el día que alguien compre algo. El catálogo fijo de [e2e/apoyo/datos.js](e2e/apoyo/datos.js) son cuatro productos elegidos para cubrir stock holgado, stock bajo, última unidad y agotado.

Lo que sí es real es la sesión del panel: el servidor firma el token con HMAC, lo manda en una cookie `httpOnly` y `getServerSideProps` la verifica en cada visita. La prueba escribe la contraseña y entra como entraría la dueña. El servidor de pruebas arranca con una `ADMIN_PASSWORD` que [playwright.config.mjs](playwright.config.mjs) sortea en cada corrida, así que en el repositorio no queda ninguna contraseña escrita, ni siquiera de mentira.

El service worker se bloquea en todas las pruebas menos en `offline.spec.js`: si sirviera copias guardadas, las respuestas simuladas dejarían de ser las que llegan a la página.

## Integración y despliegue continuos

Todo vive en un solo workflow, [ci.yml](.github/workflows/ci.yml), con cuatro jobs:

| Job | Cuándo corre | Qué hace |
| --- | --- | --- |
| `verificar` | Cada push y cada pull request a `main` | `npm ci`, lint, pruebas con cobertura, build y SonarQube Cloud |
| `e2e` | Cada push y cada pull request a `main` | Compila, levanta la app y corre los recorridos de Playwright |
| `desplegar` | Solo en push a `main` | Publica en producción con la CLI de Vercel |
| `vista-previa` | Pull requests del propio repositorio | Publica una vista previa y deja la URL como comentario en el PR |

Los dos jobs de despliegue declaran `needs: [verificar, e2e]`, así que **nada sale a producción si el lint, las pruebas, el build o un recorrido completo fallan**. `verificar` y `e2e` corren en paralelo: el pipeline tarda lo que el más lento, no la suma.

Ese es el motivo de [vercel.json](vercel.json), que solo tiene una cosa:

```json
{ "git": { "deploymentEnabled": false } }
```

Sin eso, la integración de Vercel con GitHub construye por su cuenta en cada push, en paralelo al pipeline y sin esperarlo: un commit con las pruebas rotas se publicaba igual. Apagarlo desde el repositorio y no desde el panel de Vercel deja la decisión versionada y a la vista de cualquiera que lea el código. No afecta a los despliegues que manda el pipeline, porque esos son explícitos y no los dispara Git.

### Configurar el despliegue

1. Crea un token en **Account Settings** → **Tokens**. El alcance tiene que ser **All Projects**: uno acotado a un solo proyecto no puede leer su configuración y `vercel pull` falla con `Could not retrieve Project Settings`.
2. Toma el `Project ID` de **Project Settings** → **General** y el `Team ID` de los ajustes del equipo. Empiezan con `prj_` y `team_`. Si hace falta comprobarlos, `npx vercel link` los escribe en `.vercel/`.
3. En GitHub, **Settings** → **Secrets and variables** → **Actions**, agrega:

   | Secreto | De dónde sale |
   | --- | --- |
   | `VERCEL_TOKEN` | El token del paso 1 |
   | `VERCEL_ORG_ID` | El `Team ID` del paso 2 |
   | `VERCEL_PROJECT_ID` | El `Project ID` del paso 2 |

Las variables de entorno de la aplicación (las tres de Supabase) siguen viviendo en Vercel: `vercel pull` las baja durante el pipeline. No hace falta duplicarlas en GitHub.

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

**Cuentas**

- Registro con correo, ingreso con correo o con Google, y compra como invitada
- "Mi cuenta": el nombre y los pedidos hechos con la sesión iniciada
- Cuatro roles, dos portales, y una cuenta de revisión que ve todo y no escribe nada

**Panel de la tienda**

- Pedidos con detalle, datos de contacto y cambio de estado
- Aviso en el teléfono cuando entra un pedido, sin tener el panel abierto
- Alta, edición y baja de productos con precio, stock, colores e imagen
- Galería de trabajos: subir fotos, ordenarlas y quitarlas sin tocar el código
- La foto se sube desde la computadora o se pega su dirección, como prefiera quien carga
- La retroalimentación que dejan las clientas, para leerla y archivarla

**Portal del sistema**

- Tickets de los errores que el sistema captura solo, agrupados por huella
- Tickets de los problemas que reportan las clientas, enlazados a su mensaje
- Cuentas y roles, con el correo y la forma de ingreso de cada una

**Aplicación instalable**

- Manifiesto, service worker e iconos generados por código
- Funciona con la red caída para lo ya visitado, con página propia sin conexión
- Cabeceras de seguridad, Open Graph, `robots.txt` y `sitemap.xml`

## Limitaciones conocidas

- **Los datos de contacto son de relleno.** Teléfono, correo y dirección están marcados con `PENDIENTE` en [`lib/negocio.js`](lib/negocio.js) y hay que reemplazarlos por los reales, incluido el número de WhatsApp al que llegan las solicitudes.
- **El pago no es real.** El método de pago se guarda como texto, pero no hay cobro. Integrar una pasarela (Stripe, PayPal o Tigo Money) es trabajo pendiente.
- **No se envían correos.** La confirmación muestra el número de pedido; el contacto es manual.
- **Las citas no quedan registradas.** Viven en el historial del chat, no en la base. Fue una decisión consciente: ver la [ADR-003](docs/adr/ADR-003-solicitud-de-citas-por-whatsapp.md).
