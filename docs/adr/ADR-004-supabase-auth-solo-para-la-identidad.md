# ADR-004 — Usar Supabase Auth para la identidad, y solo para eso

- **Estado:** aceptada
- **Fecha:** 2026-09-15
- **Decide:** Alejandro Paz
- **Revisa:** [ADR-002](ADR-002-acceso-a-supabase-solo-desde-el-servidor.md)

---

## Contexto

El proyecto necesitaba cuentas: que las clientas puedan registrarse y ver sus pedidos, que el personal entre con su propia identidad en vez de una contraseña compartida, y que se pueda entrar con Google.

La [ADR-002](ADR-002-acceso-a-supabase-solo-desde-el-servidor.md) había decidido lo contrario de lo que eso pide: **el navegador nunca habla con Supabase**, y ninguna variable lleva el prefijo `NEXT_PUBLIC_`. Esa decisión se tomó cuando el sistema no tenía usuarios, y uno de sus argumentos era justamente ese: el checkout es como invitada, así que no hay un `auth.uid()` sobre el cual escribir políticas que distingan "mis pedidos" de "los de otra".

Ahora sí lo hay. Y el modelo de identidad tiene una particularidad: **la sesión vive en el navegador**. Iniciar sesión, refrescar el token, volver de Google con un código, cerrar sesión: todo eso ocurre del lado del cliente en cualquier implementación seria. Escribirlo a mano significa implementar PKCE, rotación de tokens, verificación de correo y recuperación de contraseña, que es criptografía propia en el camino crítico de la seguridad.

Supabase Auth ya hace todo eso y viene con el proyecto. Su cliente de navegador necesita la URL y la clave publicable.

## Decisión

**El navegador habla con Supabase únicamente para autenticarse. Los datos siguen pasando por las API Routes del servidor.**

En concreto:

- Aparecen exactamente **dos variables `NEXT_PUBLIC_`**: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. La clave publicable es pública por diseño; lo que protege los datos es RLS.
- **La sesión viaja en cookies**, no en `localStorage`, usando `@supabase/ssr`. Es lo que permite que el servidor la lea en cada petición.
- El servidor la valida con **`getUser()` y no con `getSession()`**: `getUser` la verifica contra Supabase, así que una sesión revocada deja de servir al instante; `getSession` se fía de lo que diga la cookie.
- **El rol nunca viene del navegador.** Se lee de `profiles` con la clave secreta, en el servidor, en cada petición.
- Las lecturas y escrituras de datos **no cambian**: siguen en `pages/api/`, con la clave secreta.

## Consecuencias

### Positivas

- **Cuentas, Google y recuperación de contraseña sin escribir criptografía propia.** Lo que se agregó es un módulo de sesión y una página de ingreso, no un sistema de autenticación.
- **La compra como invitada queda intacta**, que es la forma normal de comprar en esta tienda.
- **RLS deja de ser decorativa.** Antes era la segunda barrera detrás del servidor; ahora es la barrera de cualquier consulta directa con la clave publicable, y por eso pasó a tener pruebas propias (`tests/db/rls.test.js`, sobre un Postgres real).
- **Verificado en producción con la clave que cualquiera puede leer:** `products` y `categories` devuelven el catálogo; `orders`, `order_items`, `profiles`, `feedback` y `tickets` devuelven cero filas; `create_order` responde `permission denied`.

### Negativas — lo que se sacrificó

- **Se perdió una barrera.** Mientras no había clave en el navegador, un error en una política RLS no tenía consecuencias: nadie podía consultar la base directamente. Ahora un error ahí **es** una filtración. Es el costo real de esta decisión, y la razón de las pruebas de RLS.
- **Una llamada más por petición protegida.** `getUser()` consulta a Supabase; son decenas de milisegundos que antes no se pagaban.
- **Más dependencia de Supabase.** Migrar de proveedor ya no es mover tablas: ahora incluye las identidades.
- **Una pieza más en el navegador** que puede fallar: el cliente de Supabase, su manejo de cookies y el retorno de Google.

### Neutras

- La contraseña compartida del panel sigue funcionando mientras dure la transición, como sesión de dueña. Se retira cuando el personal entre con sus cuentas.

## Alternativas consideradas

**Escribir el OAuth de Google a mano.** Implica PKCE, validar el `id_token`, manejar refresh y guardar sesiones. Semanas de trabajo y criptografía propia en el punto más delicado del sistema, para llegar a lo que Supabase ya hace.

**NextAuth (Auth.js) con adaptador.** Habría dejado la identidad fuera de Supabase, con su propia tabla de usuarios: dos fuentes de verdad para la misma persona y RLS sin `auth.uid()` que funcione.

**Enlaces mágicos, sin contraseñas.** Evita la clave en el navegador solo a medias, y obliga a abrir el correo en cada ingreso. La dueña entra al panel desde el mostrador, muchas veces por día.

**Dejar la contraseña compartida y no tener cuentas.** Es lo que había. No permite que una clienta vea sus pedidos, ni que el ingeniero revise sin poder romper, ni saber quién cambió el estado de un pedido.

---

## Referencias

- Implementación: [`lib/sesion.js`](../../lib/sesion.js), [`lib/supabase-navegador.js`](../../lib/supabase-navegador.js), [`pages/api/auth/continuar.js`](../../pages/api/auth/continuar.js)
- Políticas: [`supabase/migraciones/005_perfiles_y_roles.sql`](../../supabase/migraciones/005_perfiles_y_roles.sql)
- Pruebas de RLS: [`tests/db/rls.test.js`](../../tests/db/rls.test.js)
- Revisa: [ADR-002](ADR-002-acceso-a-supabase-solo-desde-el-servidor.md) · Relacionada: [ADR-005](ADR-005-roles-y-portales.md)
