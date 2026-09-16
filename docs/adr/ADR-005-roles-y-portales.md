# ADR-005 — Cuatro roles, dos portales y una cuenta que solo mira

- **Estado:** aceptada
- **Fecha:** 2026-09-15
- **Decide:** Alejandro Paz

---

## Contexto

Hasta acá el sistema tenía un solo nivel de acceso: quien supiera la contraseña del panel podía hacer todo —cambiar estados de pedidos, editar precios, borrar productos— y no quedaba registro de quién había sido. Con una sola persona usándolo funcionaba; con cuentas reales, no.

Aparecieron tres necesidades distintas que ese esquema no distingue:

1. **La dueña** gestiona pedidos y catálogo. No necesita ver errores del sistema ni administrar cuentas.
2. **Quien desarrolla** necesita además los tickets, la retroalimentación y los roles de las demás cuentas.
3. **Quien revisa el proyecto** —un ingeniero, un profesor— necesita ver todo para evaluarlo, y **no debería poder cambiar nada**: son los pedidos reales de las clientas de un negocio que está funcionando.

El pedido original para ese tercer caso era un usuario `JALEMAN` con contraseña `123`. Eso choca con el código: la clave con la que se firman los tokens de sesión se deriva de la propia contraseña (`lib/admin-auth.js`), así que una contraseña de tres caracteres no debilita solo ese acceso, debilita la firma.

## Decisión

**Cuatro roles en `profiles.role`, dos portales, y el rol de revisión sin permiso de escritura.**

| Rol | Entra a | Puede |
|---|---|---|
| `clienta` | Su cuenta | Comprar y ver sus propios pedidos |
| `duena` | Panel de la tienda | Pedidos, catálogo y retroalimentación |
| `admin` | Los dos portales | Todo, más tickets y cuentas |
| `super_admin` | Los dos portales | Ver todo. **Nada más.** |

En concreto:

- **Toda cuenta nace `clienta`.** El rol lo sube un `admin` desde el portal; si el registro pudiera elegirlo, cualquiera se daría de alta como administrador.
- **Nadie se cambia el rol a sí mismo.** Si el único `admin` se bajara por error, no quedaría nadie que pueda devolver los roles y habría que arreglarlo a mano en la base.
- **El `super_admin` recibe 403 en cualquier método que no sea `GET` o `HEAD`**, y la interfaz directamente no le muestra los controles que escriben.
- **Las cuentas del personal se crean sin contraseña** (`npm run cuentas:crear`) y entran con Google. Así nunca existe una contraseña que haya que hacerle llegar a alguien.
- Las reglas viven en **un solo lugar**, `lib/sesion.js`, y las listas de roles en `lib/roles.js`, que no importa nada del servidor y por eso puede usarse también al dibujar.

## Consecuencias

### Positivas

- **El proyecto se puede mostrar sin riesgo.** Quien lo revisa entra con su cuenta, recorre los dos portales y no puede cancelar el pedido de una clienta ni con un clic accidental.
- **Cada acción tiene dueño.** Antes, "alguien con la contraseña" cambió un estado; ahora es una cuenta.
- **Cambiar lo que puede un rol es cambiar una línea**, no buscar condiciones repartidas por las rutas.
- **La contraseña `123` no existe en ninguna parte.** Tampoco ninguna otra: las dos cuentas del personal entran con Google.

### Negativas — lo que se sacrificó

- **Más piezas que mantener**: una tabla de perfiles, un trigger, políticas por rol y una página de cuentas que antes no hacían falta.
- **El super_admin puede ver datos personales de las clientas.** Es lo mínimo para revisar el sistema, pero es un acceso real a información sensible, y por eso el rol se da a una persona concreta y no a "quien tenga el enlace".
- **La interfaz duplica la regla**: el servidor decide, y además la página esconde los botones. Si un día divergen, la que manda es la del servidor, pero hay que acordarse de tocar las dos.
- **Un rol mal asignado abre un portal entero.** No hay permisos finos: es todo o nada por portal.

### Neutras

- La contraseña compartida sigue abriendo el panel como `duena` hasta que se retire.

## Alternativas consideradas

**Permisos finos por recurso** (quién puede editar precios, quién solo verlos). Más flexible y más difícil de razonar. Para un salón con dos o tres personas en el panel, alcanza con cuatro roles.

**Un solo portal con secciones ocultas según el rol.** Es esconder, no proteger: sin verificación en el servidor, basta con escribir la URL. Y con verificación, el portal separado se lee mejor.

**Una cuenta compartida de "solo lectura" con contraseña.** Vuelve al problema de origen: una contraseña que circula y una acción sin dueño.

---

## Referencias

- Implementación: [`lib/sesion.js`](../../lib/sesion.js), [`lib/roles.js`](../../lib/roles.js)
- Esquema y políticas: [`supabase/migraciones/005_perfiles_y_roles.sql`](../../supabase/migraciones/005_perfiles_y_roles.sql)
- Alta de cuentas: [`scripts/crear-cuenta.mjs`](../../scripts/crear-cuenta.mjs)
- Relacionada: [ADR-004](ADR-004-supabase-auth-solo-para-la-identidad.md)
