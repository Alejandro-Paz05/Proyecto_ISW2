# Arquitectura — Akari Studio

Documento de arquitectura del sitio de Akari Studio: tienda en línea con inventario, contacto por WhatsApp para las citas, y panel de administración.

Código de verificación: `LEARN-CAP-76080609`

---

## 1. Contexto (C4 nivel 1)

Quiénes usan el sistema y con qué se conecta.

```mermaid
C4Context
    title Diagrama de contexto — Akari Studio

    Person(clienta, "Clienta", "Compra productos y escribe para su cita. Entra desde el celular, sin crear cuenta.")
    Person(duena, "Dueña del salón", "Gestiona pedidos y catálogo desde el panel. Confirma las citas por chat.")

    System(akari, "Akari Studio", "Tienda con inventario y panel de administración.")

    System_Ext(whatsapp, "WhatsApp", "Canal por el que se piden y confirman las citas.")
    System_Ext(supabase, "Supabase", "PostgreSQL gestionado. Guarda productos y pedidos.")
    System_Ext(vercel, "Vercel", "Alojamiento y despliegue continuo desde GitHub.")
    System_Ext(github, "GitHub", "Repositorio e integración continua.")

    Rel(clienta, akari, "Compra productos", "HTTPS")
    Rel(clienta, whatsapp, "Escribe para pedir su cita", "wa.me")
    Rel(duena, whatsapp, "Confirma o propone otro horario")
    Rel(duena, akari, "Administra el negocio", "HTTPS, con contraseña")
    Rel(akari, supabase, "Lee y escribe datos", "HTTPS, clave service_role")
    Rel(github, vercel, "Dispara el despliegue", "webhook")

    UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

Dos cosas que vale señalar en este diagrama:

- **No hay ninguna flecha entre la clienta y Supabase.** Es deliberado y es el eje de la [ADR-002](adr/ADR-002-acceso-a-supabase-solo-desde-el-servidor.md): el navegador nunca habla con la base de datos.
- **Las citas salen del sistema.** El sitio solo abre la conversación con un botón; el servicio, el día y la hora los acuerda la dueña por chat. Es el resultado de la [ADR-003](adr/ADR-003-solicitud-de-citas-por-whatsapp.md).

---

## 2. Contenedores (C4 nivel 2)

Las piezas desplegables y cómo se comunican.

```mermaid
flowchart TB
    subgraph navegador["Navegador de la clienta"]
        spa["Páginas React<br/>Next.js Pages Router<br/><br/>Portada · Productos · Panel"]
        sw["Service Worker<br/>Cache de estáticos<br/>y respaldo sin conexión"]
        ls[("localStorage<br/>Carrito: solo ids y cantidades")]
    end

    subgraph vercel["Vercel"]
        api["API Routes · Node.js<br/><br/>/api/products · /api/orders<br/>/api/health · /api/admin/*"]
        estaticos["Archivos estáticos<br/>manifest, iconos, robots"]
    end

    subgraph supabase["Supabase — PostgreSQL"]
        tablas[("Tablas<br/>products · orders · order_items")]
        funciones["Función SQL<br/>create_order"]
        rls["Row Level Security"]
    end

    wa["WhatsApp"]

    spa -->|"fetch JSON"| api
    spa <-->|"lee y escribe"| ls
    sw -.->|"intercepta"| spa
    spa -->|"solicita"| estaticos
    spa -->|"botón flotante<br/>enlace wa.me"| wa
    api -->|"clave service_role"| funciones
    funciones --> tablas
    rls -.->|"protege"| tablas

    style navegador fill:#1a1a1a,color:#fff
    style vercel fill:#1a1a1a,color:#fff
    style supabase fill:#1a1a1a,color:#fff
```

| Contenedor | Tecnología | Responsabilidad |
|---|---|---|
| Páginas React | Next.js 14 + React 18 | Interfaz y estado de la pantalla. No decide nada con consecuencias. |
| Service Worker | API del navegador | Cachea estáticos y da respaldo sin conexión. Nunca cachea la API. |
| localStorage | API del navegador | Carrito entre visitas. Guarda solo ids y cantidades. |
| API Routes | Node.js sobre Vercel | Única vía hacia la base. Valida la forma de los datos y traduce errores. |
| Función SQL | PL/pgSQL | Reglas de negocio: precios y stock. |
| PostgreSQL | Supabase | Persistencia e integridad. |

El pedido de cita **no tiene contenedor de ningún tipo**: es un enlace `wa.me` en un botón flotante. No hay página, ni ruta de API, ni tabla, ni estado.

---

## 3. Componentes del backend (C4 nivel 3)

```mermaid
flowchart LR
    subgraph rutas["API Routes"]
        publicas["Rutas públicas<br/>products · orders · health"]
        privadas["Rutas del panel<br/>admin/orders<br/>admin/products"]
        login["admin/login<br/>admin/logout"]
    end

    subgraph modulos["Módulos de dominio"]
        auth["admin-auth<br/>Token HMAC en cookie httpOnly"]
        validar["validar-producto<br/>Reglas del catálogo"]
        cliente["supabase<br/>Cliente solo servidor"]
    end

    subgraph estaticos["Datos en el código"]
        negocio["negocio<br/>Contacto y enlace wa.me"]
        categorias["categorias<br/>Categorías del catálogo"]
    end

    subgraph base["PostgreSQL"]
        co["create_order()"]
        lock["SELECT ... FOR UPDATE<br/>sobre cada producto"]
    end

    publicas --> cliente
    privadas --> auth
    privadas --> validar
    privadas --> cliente
    login --> auth
    cliente --> co
    co --> lock
```

---

## 4. Flujo crítico: hacer un pedido

El caso que mejor muestra dónde viven las decisiones.

```mermaid
sequenceDiagram
    autonumber
    participant C as Clienta
    participant P as Página de productos
    participant R as /api/orders
    participant D as PostgreSQL

    C->>P: Arma el carrito
    Note over P: El carrito guarda solo ids y cantidades
    P->>R: POST { customer, items:[{id, qty}], payment }
    Note over P,R: El navegador no envía precio ni total

    R->>R: Valida la forma: ids enteros, cantidades positivas
    R->>D: create_order(...)

    D->>D: SELECT ... FOR UPDATE sobre cada producto
    D->>D: Verifica el stock y suma el total con precios de la base

    alt Hay stock
        D->>D: Inserta pedido + items, descuenta inventario
        Note over D: Todo en una transacción
        D-->>R: Pedido creado
        R-->>P: 201 con el número y el total real
    else No alcanza
        D-->>R: 22023 con el stock restante
        R-->>P: 400 "Solo quedan N unidades"
    end
```

## 4b. Flujo de un pedido de cita

```mermaid
flowchart LR
    a["Toca el botón<br/>flotante"] --> b["Se abre WhatsApp<br/>con un saludo"]
    b --> c["La dueña pregunta<br/>servicio, día y hora"]
    c --> d["Acuerdan la cita<br/>en el chat"]
```

Sin servidor, sin base de datos, sin página y sin estado. Es el flujo más simple del sistema porque, según la [ADR-003](adr/ADR-003-solicitud-de-citas-por-whatsapp.md), la dueña prefiere conducir esa conversación ella.

---

## 5. Modelo de datos

```mermaid
erDiagram
    products ||--o{ order_items : "aparece en"
    orders ||--|{ order_items : contiene

    products {
        int id PK
        text name
        text category
        numeric price
        text description
        text image
        int stock
    }
    orders {
        int id PK
        text order_number UK
        text customer_name
        text customer_email
        text customer_phone
        text customer_address
        text payment_method
        numeric total
        text status
        timestamptz created_at
    }
    order_items {
        int id PK
        int order_id FK
        int product_id FK
        text product_name
        int quantity
        numeric price
    }
```

`order_items` guarda **su propia copia** del nombre y el precio. No es redundancia por descuido: una venta ya cerrada debe conservar lo que se cobró ese día, aunque después cambie la tarifa o se elimine el producto del catálogo. Por eso su clave foránea es `ON DELETE SET NULL` y no `CASCADE`.

---

## 6. Decisiones registradas

| ADR | Decisión |
|---|---|
| [ADR-001](adr/ADR-001-reglas-de-negocio-en-la-base-de-datos.md) | Poner las reglas de integridad del negocio en la base de datos, no en la aplicación |
| [ADR-002](adr/ADR-002-acceso-a-supabase-solo-desde-el-servidor.md) | Acceder a Supabase únicamente desde el servidor, nunca desde el navegador |
| [ADR-003](adr/ADR-003-solicitud-de-citas-por-whatsapp.md) | Reemplazar la reserva en línea por una solicitud enviada por WhatsApp |

La ADR-003 retiró una funcionalidad completa que ya estaba en producción, a pedido de la clienta. El sistema retirado —agenda con disponibilidad en tiempo real y restricción de exclusión sobre rangos de tiempo— queda en el historial de git.

---

## 7. Calidad y despliegue

```mermaid
flowchart LR
    dev["git push"] --> ci["GitHub Actions"]
    ci --> lint["ESLint"]
    ci --> test["206 pruebas<br/>Vitest<br/>89% de cobertura"]
    ci --> build["next build"]
    ci --> sonar["SonarQube Cloud"]
    dev --> vercel["Vercel"]
    vercel --> prod["alejandropaz.xyz/akaristudio"]
    prod --> health["/api/health<br/>consulta la base de verdad"]
```

Las pruebas corren sin base de datos: el cliente de Supabase se simula. Eso permite que el pipeline no necesite credenciales.
