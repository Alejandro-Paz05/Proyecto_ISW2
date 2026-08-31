# Akari Studio

[![CI](https://github.com/Alejandro-Paz05/Proyecto_ISW2/actions/workflows/ci.yml/badge.svg)](https://github.com/Alejandro-Paz05/Proyecto_ISW2/actions/workflows/ci.yml)

Sitio del salón de belleza **Akari Studio** (Honduras): reserva de citas con disponibilidad en tiempo real, tienda en línea con inventario, y un panel de administración para gestionar pedidos y catálogo.

Proyecto de la asignatura **Ingeniería de Software II**.

**Código de verificación:** `LEARN-CAP-76080609`

## En producción

| | |
|---|---|
| Inicio | https://www.alejandropaz.xyz/akaristudio |
| Reservar una cita | https://www.alejandropaz.xyz/akaristudio/citas |
| Tienda | https://www.alejandropaz.xyz/akaristudio/productos |
| Panel de administración | https://www.alejandropaz.xyz/akaristudio/admin |

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
  agenda.js            Cálculo de franjas horarias
  validar-producto.js  Validación del alta y edición de productos
  categorias.js        Categorías de productos y servicios
pages/
  akaristudio/         Sitio público: inicio, citas, productos
  akaristudio/admin/   Panel: pedidos y productos
  api/                 Rutas de API
styles/                globals.css, booking.css, admin.css
supabase/              Esquema, migraciones y datos de ejemplo
tests/                 Pruebas, espejando la estructura del código
.github/workflows/     Integración continua
```

## Arquitectura

El documento completo, con los diagramas C4 en Mermaid, el flujo de reserva y el modelo de datos, está en [docs/arquitectura.md](docs/arquitectura.md).

Decisiones registradas:

| ADR | Decisión |
|---|---|
| [ADR-001](docs/adr/ADR-001-reglas-de-negocio-en-la-base-de-datos.md) | Poner las reglas de integridad del negocio en la base de datos, no en la aplicación |
| [ADR-002](docs/adr/ADR-002-acceso-a-supabase-solo-desde-el-servidor.md) | Acceder a Supabase únicamente desde el servidor, nunca desde el navegador |

## Decisiones de diseño en resumen

**El navegador nunca habla con Supabase directamente.** Todo pasa por las API Routes. Por eso las credenciales no llevan el prefijo `NEXT_PUBLIC_`: una variable con ese prefijo queda incrustada en el JavaScript que descarga el usuario y es legible por cualquiera.

**Las reglas de negocio viven en la base de datos, no en el código.** Es la decisión que atraviesa todo el proyecto, y se aplica dos veces:

- **Un pedido es una transacción atómica.** `create_order` bloquea las filas de producto con `SELECT ... FOR UPDATE`, verifica el stock, crea el pedido con sus ítems y descuenta el inventario. Si algo falla no quedan pedidos huérfanos, y dos compras simultáneas de la última unidad no pueden vender la misma cosa dos veces.
- **Dos citas no pueden solaparse.** Una restricción de exclusión de PostgreSQL sobre el rango de tiempo de cada cita hace que la base rechace cualquier reserva que pise a otra, sin importar cuántas peticiones lleguen a la vez. La condición `WHERE (status <> 'cancelada')` deja que un horario cancelado vuelva a quedar libre.

**Los precios y los totales se calculan en la base.** El navegador solo envía qué producto y cuánto, o qué servicios y cuándo. Si el total viniera del cliente, se podría enviar un pedido de L 4,500 por L 1.00 editando la petición.

**RLS activado en todas las tablas.** El rol público `anon` solo puede leer el catálogo, los servicios y el horario de atención. Las tablas con datos personales —`orders`, `order_items`, `appointments`— no tienen políticas, así que son inaccesibles desde fuera del servidor.

**El panel se cierra solo si falta configuración.** Sin la variable `ADMIN_PASSWORD` responde 503 en vez de quedar abierto.

## Configurar Supabase

1. Crea una cuenta gratuita en [supabase.com](https://supabase.com) y un proyecto nuevo.
2. En **SQL Editor** → **New query**, ejecuta en este orden:
   - [supabase/schema.sql](supabase/schema.sql) — productos y pedidos
   - [supabase/citas.sql](supabase/citas.sql) — agenda de citas
   - [supabase/citas-v2.sql](supabase/citas-v2.sql) — varios servicios y personas por cita
   - [supabase/seed.sql](supabase/seed.sql) — opcional, 16 productos de ejemplo
3. En **Project Settings** → **API**, copia la **Project URL** y la clave **`service_role`** (hay que pulsar *Reveal*).

> **La clave `service_role` es secreta.** Salta las políticas de seguridad de la base. Va únicamente en variables de entorno del servidor; nunca en el repositorio ni en código del navegador.

## Cargar el catálogo

`schema.sql` se ejecuta **una sola vez**, al montar la base: borra y recrea las tablas. Para cargar o modificar productos no hace falta volver a tocarlo.

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
| `npm run test:watch` | Pruebas en modo continuo |
| `npm run lint` | Revisa el código con ESLint |
| `npm run build` | Compila para producción |
| `npm start` | Sirve la build compilada |

> No ejecutes `npm run build` con el servidor de desarrollo encendido: ambos escriben en `.next` y se pisan.

## Pruebas

141 pruebas con Vitest, jsdom y Testing Library, en `tests/`, espejando la estructura del código:

| Archivo | Qué cubre |
|---|---|
| `tests/context/CartContext.test.jsx` | Límites de stock, precios frescos, reconciliación del carrito |
| `tests/api/orders.test.js` | Validación de pedidos y traducción de errores de la base |
| `tests/lib/admin-auth.test.js` | Tokens de sesión, firma y protección de rutas |
| `tests/lib/validar-producto.test.js` | Alta y edición de productos |
| `tests/lib/agenda.test.js` | Cálculo de franjas horarias |

No hacen falta credenciales ni conexión a Supabase: el cliente de base de datos se simula.

Están fuera de `pages/` a propósito. Next.js convierte en ruta todo lo que hay en esa carpeta, así que un archivo de pruebas junto al código se publicaba como un endpoint real en producción.

Cada push ejecuta lint, pruebas y build en GitHub Actions ([ci.yml](.github/workflows/ci.yml)).

## Desplegar en Vercel

1. Sube el repositorio a GitHub.
2. En [vercel.com](https://vercel.com): **Add New** → **Project** → importa el repositorio.
3. En **Environment Variables** agrega las tres variables de arriba, en los tres entornos.
4. **Deploy**.

Las variables se leen al construir: después de cambiar una hay que redesplegar.

## Funcionalidades

**Citas**

- Combinación de varios servicios en una misma cita, con las duraciones sumadas
- Reserva para una o varias personas, multiplicando el tiempo y el precio
- Disponibilidad en tiempo real: solo se ofrecen los horarios donde el servicio entra completo antes de cerrar
- Horario de atención por día de la semana y días bloqueados para feriados
- Imposible reservar un horario ya tomado, garantizado por la base

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

## Limitaciones conocidas

- **El pago no es real.** El método de pago se guarda como texto, pero no hay cobro. Integrar una pasarela (Stripe, PayPal o Tigo Money) es trabajo pendiente.
- **No se envían correos.** La confirmación muestra el número de pedido o de cita; el contacto es manual.
- **Las citas todavía no se ven en el panel.** Se gestionan desde Supabase hasta que se agregue esa pantalla.
- **Una sola agenda.** El modelo asume que el salón atiende de a una clienta por vez.
