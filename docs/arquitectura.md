# Arquitectura — Akari Studio

Documento de arquitectura del sitio de Akari Studio: reserva de citas con disponibilidad en tiempo real, tienda en línea con inventario y panel de administración.

Código de verificación: `LEARN-CAP-76080609`

---

## 1. Contexto (C4 nivel 1)

Quiénes usan el sistema y con qué se conecta.

```mermaid
C4Context
    title Diagrama de contexto — Akari Studio

    Person(clienta, "Clienta", "Reserva citas y compra productos. Entra desde el celular, sin crear cuenta.")
    Person(duena, "Dueña del salón", "Gestiona pedidos, catálogo y agenda desde el panel.")

    System(akari, "Akari Studio", "Sitio del salón: agenda de citas, tienda con inventario y panel de administración.")

    System_Ext(supabase, "Supabase", "PostgreSQL gestionado. Guarda productos, pedidos, servicios y citas.")
    System_Ext(vercel, "Vercel", "Alojamiento y despliegue continuo desde GitHub.")
    System_Ext(github, "GitHub", "Repositorio e integración continua.")

    Rel(clienta, akari, "Reserva citas y compra", "HTTPS")
    Rel(duena, akari, "Administra el negocio", "HTTPS, con contraseña")
    Rel(akari, supabase, "Lee y escribe datos", "HTTPS, clave service_role")
    Rel(github, vercel, "Dispara el despliegue", "webhook")

    UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

**Nota importante:** no hay ninguna flecha entre la clienta y Supabase. Es deliberado y es el eje de la [ADR-002](adr/ADR-002-acceso-a-supabase-solo-desde-el-servidor.md): el navegador nunca habla con la base de datos.

---

## 2. Contenedores (C4 nivel 2)

Las piezas desplegables y cómo se comunican.

```mermaid
flowchart TB
    subgraph navegador["Navegador de la clienta"]
        spa["Páginas React<br/>Next.js Pages Router<br/><br/>Portada · Citas · Productos · Panel"]
        sw["Service Worker<br/>Cache de estáticos<br/>y respaldo sin conexión"]
        ls[("localStorage<br/>Carrito: solo ids y cantidades")]
    end

    subgraph vercel["Vercel"]
        api["API Routes<br/>Node.js<br/><br/>/api/products · /api/orders<br/>/api/services · /api/availability<br/>/api/appointments · /api/health<br/>/api/admin/*"]
        estaticos["Archivos estáticos<br/>manifest, iconos, robots"]
    end

    subgraph supabase["Supabase — PostgreSQL"]
        tablas[("Tablas<br/>products · orders · order_items<br/>services · appointments<br/>business_hours · blocked_dates")]
        funciones["Funciones SQL<br/>create_order<br/>create_appointment"]
        rls["Row Level Security<br/>+ restricción de exclusión"]
    end

    spa -->|"fetch JSON"| api
    spa <-->|"lee y escribe"| ls
    sw -.->|"intercepta"| spa
    spa -->|"solicita"| estaticos
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
| Funciones SQL | PL/pgSQL | Reglas de negocio: precios, stock, solapamiento de citas. |
| PostgreSQL | Supabase | Persistencia e integridad. |

---

## 3. Componentes del backend (C4 nivel 3)

```mermaid
flowchart LR
    subgraph rutas["API Routes"]
        publicas["Rutas públicas<br/>products · orders<br/>services · availability<br/>appointments · health"]
        privadas["Rutas del panel<br/>admin/orders<br/>admin/products"]
        login["admin/login<br/>admin/logout"]
    end

    subgraph modulos["Módulos de dominio"]
        auth["admin-auth<br/>Token HMAC en cookie httpOnly"]
        agenda["agenda<br/>Cálculo de franjas horarias"]
        validar["validar-producto<br/>Reglas del catálogo"]
        cliente["supabase<br/>Cliente solo servidor"]
    end

    subgraph base["PostgreSQL"]
        co["create_order()"]
        ca["create_appointment()"]
        excl["EXCLUDE USING gist<br/>sobre el rango de cada cita"]
    end

    publicas --> cliente
    privadas --> auth
    privadas --> validar
    privadas --> cliente
    login --> auth
    publicas --> agenda
    cliente --> co
    cliente --> ca
    ca --> excl
```

---

## 4. Flujo crítico: reservar una cita

El caso que mejor muestra dónde viven las decisiones.

```mermaid
sequenceDiagram
    autonumber
    participant C as Clienta
    participant P as Página de citas
    participant A as /api/availability
    participant R as /api/appointments
    participant D as PostgreSQL

    C->>P: Elige servicios y personas
    P->>A: GET ?date&services=1,2&people=2
    A->>D: Horario del día + citas ya tomadas
    D-->>A: Datos
    A->>A: Calcula franjas: suma duraciones × personas
    A-->>P: Solo los horarios donde entra completo
    P-->>C: Muestra los disponibles

    C->>P: Elige una hora y deja sus datos
    P->>R: POST { serviceIds, people, startsAt }
    Note over P,R: El navegador no envía precio ni duración
    R->>D: create_appointment(...)
    D->>D: Valida, calcula el total y la duración
    D->>D: Intenta insertar

    alt El horario sigue libre
        D-->>R: Cita creada
        R-->>P: 201 con el número de cita
    else Alguien lo tomó mientras completaba el formulario
        D-->>R: exclusion_violation
        R-->>P: 400 "Ese horario acaba de ser reservado"
        P->>A: Vuelve a consultar la disponibilidad
    end
```

---

## 5. Modelo de datos

```mermaid
erDiagram
    products ||--o{ order_items : "aparece en"
    orders ||--|{ order_items : contiene
    services ||--o{ appointment_services : "aparece en"
    appointments ||--|{ appointment_services : contiene
    business_hours }o--|| appointments : "restringe"

    products {
        int id PK
        text name
        text category
        numeric price
        int stock
    }
    orders {
        int id PK
        text order_number UK
        numeric total
        text status
    }
    order_items {
        int id PK
        int order_id FK
        text product_name
        numeric price
    }
    services {
        int id PK
        text name
        int duration_minutes
        numeric price
    }
    appointments {
        int id PK
        text reference UK
        timestamptz starts_at
        timestamptz ends_at
        int people
        numeric total
    }
    appointment_services {
        int id PK
        int appointment_id FK
        text service_name
        int duration_minutes
    }
```

`order_items` y `appointment_services` guardan **su propia copia** del nombre, el precio y la duración. No es redundancia por descuido: una venta ya cerrada debe conservar lo que se acordó ese día, aunque después cambie la tarifa o se elimine el producto del catálogo.

---

## 6. Decisiones registradas

| ADR | Decisión |
|---|---|
| [ADR-001](adr/ADR-001-reglas-de-negocio-en-la-base-de-datos.md) | Poner las reglas de integridad del negocio en la base de datos, no en la aplicación |
| [ADR-002](adr/ADR-002-acceso-a-supabase-solo-desde-el-servidor.md) | Acceder a Supabase únicamente desde el servidor, nunca desde el navegador |

---

## 7. Calidad y despliegue

```mermaid
flowchart LR
    dev["git push"] --> ci["GitHub Actions"]
    ci --> lint["ESLint"]
    ci --> test["141 pruebas<br/>Vitest"]
    ci --> build["next build"]
    dev --> vercel["Vercel"]
    vercel --> prod["alejandropaz.xyz/akaristudio"]
    prod --> health["/api/health<br/>consulta la base de verdad"]
```

Las pruebas corren sin base de datos: el cliente de Supabase se simula. Eso permite que el pipeline no necesite credenciales.
