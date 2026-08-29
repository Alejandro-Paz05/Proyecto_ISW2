# Akari Studio — Tienda Online

Tienda en línea para el salón de belleza **Akari Studio** (Honduras): catálogo de productos, inventario en tiempo real y checkout como invitado, sin necesidad de crear cuenta.

Proyecto de la asignatura **Ingeniería de Software II**.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14 (Pages Router) + React 18 |
| Backend | API Routes de Next.js |
| Base de datos | Supabase (PostgreSQL) |
| Despliegue | Vercel |

## Estructura

```
components/          Componentes de UI (catálogo, carrito, checkout)
context/             Estado global del carrito (React Context)
lib/supabase.js      Cliente de Supabase, solo servidor
pages/
  api/products.js    GET  — catálogo con stock actual
  api/orders.js      POST — crear un pedido
  index.js           Página principal
styles/globals.css   Estilos globales
supabase/
  schema.sql         Estructura: tablas, RLS y función create_order
  seed.sql           Catálogo de ejemplo, para pruebas
```

## Arquitectura y decisiones de diseño

**El navegador nunca habla con Supabase directamente.** Todo pasa por las API Routes. Por eso las credenciales no llevan el prefijo `NEXT_PUBLIC_`: una variable con ese prefijo queda incrustada en el JavaScript que descarga el usuario y es legible por cualquiera.

**Los precios y el total se calculan en la base de datos.** El navegador solo envía `[{ id, qty }]`. Si el total viniera del cliente, se podría enviar un pedido de L 4,500 por L 1.00 con solo editar la petición.

**Un pedido es una transacción atómica.** La función `create_order` ([supabase/schema.sql](supabase/schema.sql)) bloquea las filas de producto con `SELECT ... FOR UPDATE`, verifica el stock, crea el pedido con sus items y descuenta el inventario. Todo dentro de una transacción: si algo falla no quedan pedidos huérfanos, y dos compras simultáneas del último producto no pueden vender la misma unidad dos veces.

**RLS activado.** El rol público `anon` solo puede leer el catálogo. Las tablas `orders` y `order_items` no tienen políticas, así que son inaccesibles para cualquier cliente público: los datos personales de los clientes no se pueden consultar desde fuera del servidor.

## Configurar Supabase

1. Crea una cuenta gratuita en [supabase.com](https://supabase.com) y un proyecto nuevo.
2. Ve a **SQL Editor** → **New query**, pega el contenido de [supabase/schema.sql](supabase/schema.sql) y ejecútalo. Esto crea la estructura, vacía.
3. Opcional, para tener algo con qué probar: ejecuta también [supabase/seed.sql](supabase/seed.sql), que carga 16 productos de ejemplo.
4. Ve a **Project Settings** → **API** y copia:
   - **Project URL**
   - La clave **`service_role`** (hay que pulsar *Reveal*)

> **La clave `service_role` es secreta.** Salta las políticas de seguridad de la base de datos. Va únicamente en variables de entorno del servidor; nunca en el repositorio ni en código del navegador.

## Cargar el catálogo

`schema.sql` se ejecuta **una sola vez**, al montar la base: borra y recrea las tablas. Para cargar o modificar productos no hace falta volver a tocarlo, y no conviene hacerlo — se perderían los pedidos recibidos.

Para reemplazar el catálogo de ejemplo por los productos reales del salón, en el **SQL Editor**:

```sql
-- 1. Vaciar el catálogo de ejemplo.
--    Los pedidos ya registrados conservan el nombre y el precio con que
--    se vendieron, porque order_items guarda su propia copia.
DELETE FROM products;

-- 2. Cargar los productos reales. Una fila por producto.
INSERT INTO products (name, category, price, description, image, stock) VALUES
('Nombre del producto', 'unas', 450, 'Descripción que verá el cliente.', 'https://url-de-la-imagen.jpg', 10);
```

Las categorías válidas son las que muestra el filtro de la tienda: `unas`, `pestanas`, `cejas`, `maquillaje` y `accesorios`. El precio va en lempiras y `stock` es el inventario inicial, que la tienda descuenta sola con cada pedido.

## Variables de entorno

Copia `.env.example` a `.env.local` y completa:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Ejecutar localmente

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

Otros comandos: `npm run build` (compilar), `npm start` (servir la build), `npm run lint`.

## Desplegar en Vercel

1. Sube el repositorio a GitHub.
2. En [vercel.com](https://vercel.com): **Add New** → **Project** → importa el repositorio.
3. En **Environment Variables** agrega `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
4. **Deploy**.

## Funcionalidades

- Catálogo con filtro por categoría
- Inventario en tiempo real; los productos agotados se marcan y no se pueden comprar
- Carrito persistente en el navegador
- Checkout como invitado (nombre, correo, teléfono y dirección)
- Validación de los datos del cliente en la base de datos
- Descuento automático de stock, a prueba de pedidos simultáneos
- Número de pedido correlativo (`AK-001000`, `AK-001001`, …)
- Precios en lempiras

## Limitaciones conocidas

- **El pago no es real.** El método de pago (efectivo, tarjeta, transferencia) se guarda como texto, pero no hay cobro. Integrar una pasarela real (Stripe, PayPal o Tigo Money) es trabajo pendiente.
- **No se envían correos.** La pantalla de confirmación muestra el número de pedido; el contacto con el cliente es manual.
- **No hay panel de administración.** Los pedidos y el stock se gestionan desde el panel de Supabase.
