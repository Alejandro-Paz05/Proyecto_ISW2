# Arquitectura — Akari Studio

Documento de arquitectura del sitio de Akari Studio: tienda en línea con inventario, contacto por WhatsApp para las citas, y panel de administración.

Código de verificación: `LEARN-CAP-76080609`

---

## 1. Contexto (C4 nivel 1)

Quiénes usan el sistema y con qué se conecta.

```mermaid
C4Context
    title Diagrama de contexto — Akari Studio

    Person(clienta, "Clienta", "Compra desde el celular. Con cuenta, o como invitada.")
    Person(duena, "Dueña del salón", "Gestiona pedidos, catálogo y lo que dejan las clientas. Confirma las citas por chat.")
    Person(equipo, "Quien desarrolla y quien revisa", "Atiende los tickets y administra las cuentas. La cuenta que revisa solo mira.")

    System(akari, "Akari Studio", "Tienda con inventario, panel de la tienda y portal del sistema.")

    System_Ext(whatsapp, "WhatsApp", "Canal por el que se piden y confirman las citas.")
    System_Ext(supabase, "Supabase", "PostgreSQL gestionado y servicio de identidad.")
    System_Ext(google, "Google", "Identidad para entrar sin crear otra contraseña.")
    System_Ext(vercel, "Vercel", "Alojamiento y despliegue continuo desde GitHub.")
    System_Ext(github, "GitHub", "Repositorio e integración continua.")

    Rel(clienta, akari, "Compra productos y deja comentarios", "HTTPS")
    Rel(clienta, supabase, "Inicia sesión", "HTTPS, clave publicable")
    Rel(clienta, whatsapp, "Escribe para pedir su cita", "wa.me")
    Rel(duena, whatsapp, "Confirma o propone otro horario")
    Rel(duena, akari, "Administra el negocio", "HTTPS, con su cuenta")
    Rel(equipo, akari, "Atiende tickets y cuentas", "HTTPS, con su cuenta")
    Rel(supabase, google, "Delega el ingreso", "OAuth")
    Rel(akari, supabase, "Lee y escribe datos", "HTTPS, clave secreta")
    Rel(github, vercel, "Dispara el despliegue", "webhook")

    UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

Tres cosas que vale señalar en este diagrama:

- **La única flecha entre la clienta y Supabase es la de iniciar sesión.** Ningún dato del negocio pasa por ahí: el catálogo, los pedidos y todo lo demás siguen entrando por el servidor. La [ADR-002](adr/ADR-002-acceso-a-supabase-solo-desde-el-servidor.md) decía que esa flecha no debía existir; la [ADR-004](adr/ADR-004-supabase-auth-solo-para-la-identidad.md) la abre solo para la identidad y explica qué se gana y qué se pierde con eso.
- **Entrar con cuenta es opcional.** Comprar como invitada sigue siendo la forma normal, y no hay ninguna pantalla que la obligue a registrarse para pagar.
- **Las citas salen del sistema.** El sitio solo abre la conversación con un botón; el servicio, el día y la hora los acuerda la dueña por chat. Es el resultado de la [ADR-003](adr/ADR-003-solicitud-de-citas-por-whatsapp.md).

---

## 2. Contenedores (C4 nivel 2)

Las piezas desplegables y cómo se comunican.

```mermaid
flowchart TB
    subgraph navegador["Navegador"]
        spa["Páginas React<br/>Next.js Pages Router<br/><br/>Tienda · Mi cuenta<br/>Panel · Portal del sistema"]
        sw["Service Worker<br/>Cache de estáticos<br/>y respaldo sin conexión"]
        ls[("localStorage<br/>Carrito: solo ids y cantidades")]
        cookie[("Cookies<br/>Sesión de Supabase")]
    end

    subgraph vercel["Vercel"]
        api["API Routes · Node.js<br/><br/>products · orders · feedback<br/>errores · auth · admin/* · sistema/*"]
        estaticos["Archivos estáticos<br/>manifest, iconos, robots"]
    end

    subgraph supabase["Supabase"]
        auth["Auth<br/>Correo y Google"]
        tablas[("Tablas<br/>categories · products<br/>orders · order_items<br/>order_status_history<br/>profiles · feedback · tickets")]
        funciones["Funciones SQL<br/>create_order · registrar_error<br/>triggers de bitácora y tickets"]
        rls["Row Level Security<br/>por cuenta y por rol"]
    end

    wa["WhatsApp"]

    spa -->|"fetch JSON"| api
    spa <-->|"lee y escribe"| ls
    spa -->|"iniciar sesión<br/>clave publicable"| auth
    auth -->|"escribe la sesión"| cookie
    cookie -->|"viaja en cada petición"| api
    sw -.->|"intercepta"| spa
    spa -->|"solicita"| estaticos
    spa -->|"botón flotante<br/>enlace wa.me"| wa
    api -->|"valida la sesión"| auth
    api -->|"clave secreta"| funciones
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
| Cookies de sesión | `@supabase/ssr` | La sesión, donde el servidor pueda leerla. Nunca en localStorage. |
| API Routes | Node.js sobre Vercel | Única vía hacia los datos. Valida la forma, decide por rol y traduce errores. |
| Supabase Auth | Supabase | Identidad: correo, Google y la verificación de cada sesión. |
| Funciones SQL | PL/pgSQL | Reglas de negocio: precios, stock, bitácora y agrupación de errores. |
| PostgreSQL | Supabase | Persistencia, integridad y, desde la ADR-004, filtrado por cuenta y rol. |

El pedido de cita **no tiene contenedor de ningún tipo**: es un enlace `wa.me` en un botón flotante. No hay página, ni ruta de API, ni tabla, ni estado.

---

## 3. Componentes del backend (C4 nivel 3)

```mermaid
flowchart LR
    subgraph rutas["API Routes"]
        publicas["Rutas públicas<br/>products · categories<br/>orders · health<br/>feedback · errores"]
        cuenta["Rutas de la cuenta<br/>cuenta/pedidos<br/>cuenta/perfil"]
        privadas["Rutas del panel<br/>admin/orders · admin/products<br/>admin/feedback"]
        sistema["Rutas del sistema<br/>sistema/tickets<br/>sistema/cuentas"]
        login["auth/continuar<br/>admin/login · admin/logout"]
    end

    subgraph modulos["Módulos de dominio"]
        sesion["sesion<br/>Quién es y qué puede.<br/>Valida contra Supabase Auth"]
        roles["roles<br/>Listas y destinos.<br/>Sirve en los dos lados"]
        errores["errores<br/>Huella de cada error"]
        limite["limite<br/>Tope por visitante"]
        auth["admin-auth<br/>Contraseña compartida,<br/>en retirada"]
        validar["validar-producto<br/>Reglas del catálogo"]
        cliente["supabase<br/>Cliente solo servidor"]
    end

    subgraph estaticos["Datos en el código"]
        negocio["negocio<br/>Contacto y enlace wa.me"]
        categorias["categorias<br/>Espejo de la tabla,<br/>para el modo sin conexión"]
    end

    subgraph base["PostgreSQL"]
        co["create_order()"]
        lock["SELECT ... FOR UPDATE<br/>sobre cada producto"]
        trig["registrar_estado_pedido()<br/>trigger sobre orders"]
    end

    publicas --> cliente
    publicas --> limite
    publicas --> errores
    cuenta --> sesion
    privadas --> sesion
    privadas --> validar
    privadas --> cliente
    sistema --> sesion
    sistema --> cliente
    login --> sesion
    sesion --> roles
    sesion --> auth
    sesion --> cliente
    errores --> cliente
    validar -.->|"valida contra"| categorias
    cliente --> co
    co --> lock
    co --> trig
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
    categories ||--o{ products : clasifica
    products ||--o{ order_items : "aparece en"
    orders ||--|{ order_items : contiene
    orders ||--o{ order_status_history : registra
    profiles ||--o{ orders : "hizo, si tenía cuenta"
    profiles ||--o{ feedback : "dejó, si tenía cuenta"
    tickets ||--o{ feedback : "abre un problema"

    profiles {
        uuid id PK
        text full_name
        text role
        timestamptz created_at
    }
    feedback {
        int id PK
        uuid user_id FK
        text kind
        text message
        text contact_email
        text page
        text status
        int ticket_id FK
        timestamptz created_at
    }
    tickets {
        int id PK
        text source
        text title
        text severity
        text status
        text fingerprint
        int occurrences
        jsonb context
        text resolution
        timestamptz resolved_at
    }
    categories {
        int id PK
        text key UK
        text label
        int position
    }
    products {
        int id PK
        text name
        text category FK
        numeric price
        text description
        text image
        int stock
    }
    orders {
        int id PK
        text order_number UK
        uuid user_id FK
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
    order_status_history {
        int id PK
        int order_id FK
        text status
        text note
        timestamptz changed_at
    }
```

Cinco decisiones de modelado que no se leen solas en el diagrama:

**`order_items` guarda su propia copia del nombre y el precio.** No es redundancia por descuido: una venta ya cerrada debe conservar lo que se cobró ese día, aunque después cambie la tarifa o se elimine el producto del catálogo. Por eso su clave foránea es `ON DELETE SET NULL` y no `CASCADE`.

**`products.category` apunta a `categories.key` y no a `categories.id`.** Un id numérico sería lo ortodoxo, pero la clave de texto es la que ya viaja en la URL del filtro y la que devuelve la API, así que un id obligaría a resolver la traducción en cada consulta a cambio de nada. `key` es `UNIQUE`, que es todo lo que PostgreSQL pide para ser destino de una clave foránea.

**`order_status_history` la escribe un trigger, no la aplicación.** Si dependiera de que la ruta de API se acuerde de insertar la fila, bastaría con cambiar el estado desde el panel de Supabase para perder el registro. Es la misma lógica de la [ADR-001](adr/ADR-001-reglas-de-negocio-en-la-base-de-datos.md) aplicada a la auditoría.

**`orders.user_id` es opcional y `profiles` no es la tabla de usuarios.** Los pedidos de invitada —la forma normal de comprar acá— lo dejan en `NULL`, y borrar una cuenta no borra sus compras: la relación es `ON DELETE SET NULL`, porque la venta existió igual. Las cuentas viven en `auth.users`, que administra Supabase; `profiles` solo agrega lo que es del negocio, el nombre y el rol, y la crea un trigger cuando nace la cuenta.

**Un solo ticket abierto por huella, y eso lo garantiza un índice.** `tickets` tiene un índice único parcial sobre `fingerprint` que solo rige mientras el ticket está abierto o en progreso. Es lo que convierte cien ocurrencias del mismo error en un ticket con cien ocurrencias, incluso si llegan a la vez, y lo que hace que el mismo error después de resuelto abra uno nuevo: eso es una regresión y tiene que verse como tal.

---

## 6. Decisiones registradas

| ADR | Decisión |
|---|---|
| [ADR-001](adr/ADR-001-reglas-de-negocio-en-la-base-de-datos.md) | Poner las reglas de integridad del negocio en la base de datos, no en la aplicación |
| [ADR-002](adr/ADR-002-acceso-a-supabase-solo-desde-el-servidor.md) | Acceder a Supabase únicamente desde el servidor, nunca desde el navegador |
| [ADR-003](adr/ADR-003-solicitud-de-citas-por-whatsapp.md) | Reemplazar la reserva en línea por una solicitud enviada por WhatsApp |
| [ADR-004](adr/ADR-004-supabase-auth-solo-para-la-identidad.md) | Usar Supabase Auth para la identidad, y solo para eso. **Revisa la ADR-002** |
| [ADR-005](adr/ADR-005-roles-y-portales.md) | Cuatro roles, dos portales y una cuenta que solo mira |

La ADR-004 es la primera que revisa una decisión anterior sin borrarla: la ADR-002 sigue explicando por qué los datos no pasan por el navegador, y la ADR-004 abre la única excepción, la identidad, con sus costos anotados.

La ADR-003 retiró una funcionalidad completa que ya estaba en producción, a pedido de la clienta. El sistema retirado —agenda con disponibilidad en tiempo real y restricción de exclusión sobre rangos de tiempo— queda en el historial de git.

---

## 7. Calidad y despliegue

```mermaid
flowchart LR
    dev["git push"] --> ci["GitHub Actions"]
    ci --> lint["ESLint"]
    ci --> test["Vitest<br/>510 pruebas, 44 de ellas<br/>sobre un Postgres real"]
    ci --> e2e["Playwright<br/>15 recorridos en Chromium"]
    ci --> build["next build"]
    ci --> sonar["SonarQube Cloud"]
    dev --> vercel["Vercel"]
    vercel --> prod["alejandropaz.xyz/akaristudio"]
    prod --> health["/api/health<br/>consulta la base de verdad"]
```

Ninguna prueba necesita credenciales, y cada capa lo resuelve distinto:

- Las **unitarias** simulan el cliente de Supabase.
- Las de **base de datos** levantan un PostgreSQL real en memoria con PGlite, aplican las migraciones y comprueban las políticas de RLS rol por rol. Son las que sostienen la [ADR-004](adr/ADR-004-supabase-auth-solo-para-la-identidad.md): desde que la clave publicable viaja en el navegador, una política mal escrita es una filtración.
- Las **E2E** usan la aplicación compilada e interceptan las rutas de API en el navegador, así que no crean pedidos de verdad.
