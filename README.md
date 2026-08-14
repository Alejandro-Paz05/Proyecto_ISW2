# ✨ Akari Studio — Tienda Online de Salón de Belleza

Página web para el salón de belleza **Akari Studio** (Honduras). Tienda online con carrito de compras, inventario en tiempo real y checkout como invitado (sin crear cuenta).

## 🚀 Tecnologías

- **Next.js 14** (React) — Framework full-stack
- **Supabase** — Base de datos PostgreSQL (inventario y pedidos)
- **Vercel** — Despliegue gratuito

## 📁 Estructura

```
├── components/        # Componentes de UI
├── context/           # Estado global del carrito
├── lib/               # Cliente de Supabase
├── pages/
│   ├── api/           # API routes (productos, pedidos)
│   └── index.js       # Página principal
├── styles/            # Estilos globales
└── supabase/          # Esquema de base de datos
```

## 🗄️ Configurar la base de datos (Supabase)

1. Crea una cuenta gratis en [supabase.com](https://supabase.com)
2. Crea un nuevo proyecto (elige una región cercana a Honduras)
3. Ve a **SQL Editor** → **New query**
4. Copia y pega el contenido de `supabase/schema.sql` y ejecútalo
5. Ve a **Project Settings** → **API Keys** y copia:
   - `Project URL`
   - La clave **`anon`** (en la sección **Legacy API Keys**, empieza con `eyJ...`)

> ⚠️ **Importante:** Usa la clave **`anon`** (JWT), no la `publishable`. La clave `publishable` no permite operaciones de escritura (INSERT) necesarias para guardar pedidos.

## ⚙️ Configurar variables de entorno

1. Copia `.env.example` a `.env.local`
2. Completa los valores:

```env
NEXT_PUBLIC_SUPABASE_URL=tu_url_de_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave_anonima
```

## 💻 Ejecutar localmente

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

## 🌐 Desplegar en Vercel

1. Sube tu proyecto a **GitHub** (si aún no lo has hecho)
2. Crea una cuenta gratis en [vercel.com](https://vercel.com)
3. Haz clic en **Add New** → **Project**
4. Importa tu repositorio de GitHub
5. En **Environment Variables**, agrega:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Haz clic en **Deploy**
7. ¡Listo! Tu página estará disponible en una URL pública como `https://akari-studio.vercel.app`

## 🛒 Funcionalidades

- ✅ Catálogo de productos con filtros por categoría
- ✅ **Inventario en tiempo real** (muestra stock disponible)
- ✅ **Out of stock** (productos agotados se marcan y no se pueden comprar)
- ✅ Carrito de compras (persistente en el navegador)
- ✅ Checkout como **invitado** (solo correo, teléfono y dirección)
- ✅ Pedidos guardados en la base de datos
- ✅ Descuento automático de stock al hacer un pedido
- ✅ Precios en Lempiras (Honduras)

## 💳 Pago

Actualmente el pago es **estático** (Efectivo, Tarjeta, Transferencia). Para pagos reales se puede integrar Stripe, PayPal o Mercado Pago más adelante.