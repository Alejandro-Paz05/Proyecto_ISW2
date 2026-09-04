# ADR-003 — Reemplazar la reserva en línea por una solicitud enviada por WhatsApp

- **Estado:** aceptada, con una segunda iteración
- **Fecha:** 2026-09-01
- **Decide:** Alejandro Paz, a pedido de la dueña de Akari Studio
- **Reemplaza parcialmente a:** [ADR-001](ADR-001-reglas-de-negocio-en-la-base-de-datos.md)

> **Actualización del 2026-09-02.** La primera versión de esta decisión mantenía un formulario: la clienta elegía servicios, día y franja horaria, y el sitio armaba con eso el mensaje de WhatsApp. Al mostrárselo, la dueña pidió sacar también ese formulario y dejar únicamente un botón flotante que abra la conversación.
>
> Su argumento fue el mismo que la primera vez, llevado un paso más allá: **si de todos modos va a preguntar por chat, el formulario le agrega una pantalla a la clienta sin ahorrarle trabajo a ella.** Prefiere abrir la conversación en frío y conducirla.
>
> Lo que se retiró en esta segunda vuelta: el componente del formulario, la página `/akaristudio/citas`, la lista de servicios con precios y las utilidades de fecha. Quedó un enlace `wa.me` con un saludo de una línea.
>
> El resto de este documento describe el razonamiento original, que sigue siendo el que explica por qué las citas salieron del sistema.

---

## Contexto

Durante dos días se construyó una agenda de reserva en línea completa: tabla de servicios con duraciones, horario de atención por día de la semana, días bloqueados, cálculo de franjas disponibles, y una restricción de exclusión en PostgreSQL que hacía imposible que dos citas se solaparan. Funcionaba, estaba probada y estaba en producción.

**Al mostrárselo a la clienta, dijo que no lo quería.**

Sus razones, tal como las planteó:

- Ya trabaja por WhatsApp y no quiere revisar dos lugares distintos.
- Necesita poder decir que no, o proponer otro horario, según con quién esté hablando. Una clienta de años a la que le puede correr algo; una que suele faltar y a la que prefiere no darle el sábado.
- El sitio confirmaba la cita sola. Ella quiere confirmarla ella.

Ninguna de esas razones es técnica, y ninguna se resuelve con más funcionalidad. El sistema resolvía correctamente un problema que ella no tenía: **su cuello de botella no era el solapamiento, era el ida y vuelta** de preguntar por chat qué servicio, qué día y a qué hora.

## Decisión

**El sitio no reserva citas. Arma la solicitud y la envía por WhatsApp.**

En concreto:

- La página de citas deja que la clienta elija uno o varios servicios, un día preferido y una franja horaria, y escriba su nombre.
- Con eso se compone un mensaje que se muestra **tal cual va a llegar al chat**, y un botón lo abre en WhatsApp mediante un enlace `wa.me`.
- La pantalla aclara que el día y la hora son **una preferencia, no una reserva**.
- Se elimina todo lo que sostenía la agenda: el asistente, las rutas de API de servicios, disponibilidad y reservas, el cálculo de franjas, y las cinco tablas de la base.
- Los servicios pasan a ser una lista en el código, porque ya nadie los consulta ni los escribe.

## Consecuencias

### Positivas

- **La dueña conserva el control.** Puede negociar el horario con cada clienta, que es exactamente lo que pidió.
- **Se elimina el trabajo que sí le pesaba.** Recibe de una vez qué servicio, qué día y en qué franja, en lugar de preguntarlo de a uno.
- **El sistema deja de prometer lo que no puede cumplir.** Una agenda en línea sin que ella la mire sirve de poco: si no confirma, la clienta igual se queda esperando.
- **Menos superficie que mantener.** Se retiran unas 1.600 líneas, tres rutas de API y cinco tablas.
- **Sin costo de infraestructura.** WhatsApp ya lo tiene y ya lo usa.

### Negativas — lo que se sacrificó

- **Se tiró trabajo funcionando.** Dos días de desarrollo, 28 pruebas y una solución de concurrencia correcta salen del producto.
- **Ya no hay garantía de no solapamiento.** Si la dueña anota mal, dos clientas pueden coincidir. El sistema dejó de protegerla de ese error.
- **La disponibilidad no es visible.** La clienta pide un horario a ciegas y puede recibir un no.
- **No queda registro estructurado de las citas.** Antes se podía saber cuántas se pidieron y de qué servicio; ahora eso vive en el historial de un chat.
- **Se depende de un tercero.** Si WhatsApp cambia el formato de `wa.me`, el botón deja de funcionar.
- **El proyecto pierde su ejemplo técnico más fuerte.** La restricción de exclusión sobre rangos de tiempo era la pieza más interesante del sistema.

### Neutras

- La tienda, el inventario y el panel no se tocan. La [ADR-001](ADR-001-reglas-de-negocio-en-la-base-de-datos.md) sigue vigente para los pedidos.

## Alternativas consideradas

**Dejar la agenda y agregar un botón de WhatsApp al lado.** Se descartó: dos caminos para lo mismo confunden a la clienta y obligan a la dueña a revisar los dos lugares que justamente no quiere revisar.

**Que la reserva quedara "pendiente de confirmación" en vez de confirmada.** Técnicamente resolvía el control, pero seguía obligándola a entrar al panel. Su objeción de fondo no era el estado de la cita, era tener que mirar otro lugar.

**Convertir la agenda en herramienta interna del panel**, con la dueña cargando las citas que le llegan por chat. Es la alternativa más razonable de las tres y se ofreció explícitamente. Se descartó porque duplicaba el trabajo de ella —anotar en el panel lo que ya tiene en el chat— sin darle nada a cambio mientras siga siendo una sola persona atendiendo.

## Lo que dejó como aprendizaje

La agenda se diseñó a partir de lo que parecía un problema evidente —dos personas reservando el mismo horario— sin verificar antes que fuera un problema **de ella**. La conversación que la descartó habría costado diez minutos al principio, y llegó después de dos días de trabajo.

La decisión de fondo, la de la [ADR-001](ADR-001-reglas-de-negocio-en-la-base-de-datos.md), sigue siendo correcta: sostener las reglas en la base sirvió para el inventario y sigue sirviendo. Lo que estuvo mal fue elegir a qué problema aplicarla.

---

## Referencias

- Implementación: [`components/SolicitarCita.jsx`](../../components/SolicitarCita.jsx), [`lib/negocio.js`](../../lib/negocio.js)
- Eliminación en la base: [`supabase/historico/eliminar-citas.sql`](../../supabase/historico/eliminar-citas.sql)
- El sistema retirado queda en el historial de git, hasta el commit anterior a su eliminación.
