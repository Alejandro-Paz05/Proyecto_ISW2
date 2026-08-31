# ADR-002 — Acceder a Supabase únicamente desde el servidor, nunca desde el navegador

- **Estado:** aceptada
- **Fecha:** 2026-08-28
- **Decide:** Alejandro Paz

---

## Contexto

Supabase promueve un modelo en el que el navegador habla directamente con la base de datos usando una clave pública (`anon`), y la seguridad la aporta Row Level Security. Es cómodo: se ahorra escribir un backend.

La primera versión del proyecto siguió ese camino a medias, y quedó en el peor lugar posible:

- Las credenciales estaban en variables con prefijo `NEXT_PUBLIC_`, así que **Next.js las incrustaba en el JavaScript que descarga cualquier visitante**.
- El esquema **desactivaba RLS explícitamente** en las tres tablas, con un comentario que decía "para simplificar el acceso de los clientes".

La combinación significaba que cualquiera podía abrir la consola del navegador, tomar la clave del bundle y leer todos los pedidos con nombre, correo, teléfono y dirección de cada clienta. También modificar precios, cambiar el stock o borrar productos.

Se verificó en la base real antes de cambiar nada: con la clave pública se leían las tablas completas.

Además había un requisito que el modelo directo no resuelve bien: **el total de un pedido no puede venir del cliente**. Si el navegador escribe en la tabla de pedidos, el precio que se registra es el que el navegador diga.

## Decisión

**El navegador nunca se comunica con Supabase. Todo el acceso a datos pasa por las API Routes del servidor.**

En concreto:

- Las variables de entorno **pierden el prefijo `NEXT_PUBLIC_`**: pasan a ser `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, que solo existen en el servidor.
- El servidor usa la clave **`service_role`**, que salta RLS, porque es él quien decide qué se puede hacer.
- **RLS queda activado igualmente**, como segunda barrera: el rol `anon` solo puede leer el catálogo, los servicios y el horario de atención. Las tablas con datos personales no tienen ninguna política, lo que con RLS activo significa cero acceso.
- El cliente de Supabase se construye en un módulo que **lanza un error si se lo invoca desde el navegador**, para que el error aparezca en desarrollo y no en producción.

## Consecuencias

### Positivas

- **Los datos personales de las clientas dejan de ser públicos.** Verificado con la clave pública contra la base real: `orders`, `order_items` y `appointments` devuelven cero filas.
- **El servidor pasa a ser el único lugar donde se decide.** Eso es lo que hace posible calcular los totales en la base (ver [ADR-001](ADR-001-reglas-de-negocio-en-la-base-de-datos.md)): si el navegador escribiera directo, no habría dónde interceptar.
- **Defensa en profundidad.** Si algún día la clave pública se filtrara, RLS sigue impidiendo el acceso a lo sensible.
- **Un solo lugar donde mirar.** Todas las consultas están en `pages/api/`, lo que hace revisable de un vistazo qué toca la base.
- Se verificó que el bundle que descarga el visitante no contiene ninguna credencial: 367 KB analizados, cero coincidencias.

### Negativas — lo que se sacrificó

- **Hay que escribir y mantener el backend** que el modelo directo evitaba. Son diez rutas de API que en el otro esquema no existirían.
- **Se pierden las suscripciones en tiempo real de Supabase**, que funcionan desde el navegador. Si mañana se quisiera que la agenda se actualice sola cuando otra clienta reserva, habría que resolverlo aparte.
- **Un salto de red más** en cada consulta: navegador → Vercel → Supabase. Son unas decenas de milisegundos.
- **La clave `service_role` es un secreto crítico.** Salta todas las políticas, así que su filtración es total. Obliga a cuidar las variables de entorno y a poder rotarla.
- **Migrar costó una ruptura.** Hubo que renombrar variables en Vercel y volver a ejecutar el esquema en Supabase.

### Neutras

- El panel de administración usa el mismo cliente y las mismas rutas, con una capa de sesión encima.

## Alternativas consideradas

**Dejar el acceso directo pero activar RLS con políticas finas.** Es el modelo que Supabase recomienda y es legítimo. Se descartó por dos razones: el checkout es **como invitado**, sin usuario autenticado, así que no hay un `auth.uid()` sobre el cual escribir una política que distinga "mis pedidos" de "los de otra"; y aunque se resolviera, el total seguiría viniendo del navegador.

**Un backend aparte, fuera de Next.js.** Más limpio en teoría, pero agrega un despliegue, un dominio y una configuración de CORS, para un proyecto que ya tiene servidor gratis dentro del mismo framework.

**Usar la clave `publishable` en vez de `anon`.** Se probó: no permite las escrituras necesarias, y de todos modos no resuelve el problema de fondo, que es quién decide el precio.

---

## Referencias

- Implementación: [`lib/supabase.js`](../../lib/supabase.js)
- Políticas RLS: [`supabase/schema.sql`](../../supabase/schema.sql), [`supabase/citas.sql`](../../supabase/citas.sql)
- Relacionada: [ADR-001](ADR-001-reglas-de-negocio-en-la-base-de-datos.md)
