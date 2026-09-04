# ADR-001 — Poner las reglas de integridad del negocio en la base de datos, no en la aplicación

- **Estado:** aceptada, con alcance reducido
- **Fecha:** 2026-08-29
- **Decide:** Alejandro Paz

> **Actualización del 2026-09-01.** Esta decisión se tomó para dos casos: el inventario y la agenda de citas. La agenda se retiró del producto a pedido de la clienta, según la [ADR-003](ADR-003-solicitud-de-citas-por-whatsapp.md), y con ella desapareció la restricción de exclusión que se describe más abajo.
>
> La decisión **sigue vigente para los pedidos**, que es donde nació el problema y donde se sigue aplicando. El texto original se conserva sin editar, incluida la parte sobre las citas: un ADR registra lo que se decidió y por qué en su momento, y reescribirlo para que coincida con el presente borraría justamente lo que hace útil leerlo después.

---

## Contexto

El sistema tiene dos recursos que no se pueden vender dos veces:

1. **El inventario.** Si quedan 3 lámparas LED y dos clientas compran la última al mismo tiempo, alguien se queda sin producto y el salón se entera cuando ya cobró.
2. **La agenda.** Si dos clientas reservan el martes a las 14:00, la dueña tiene que llamar a una para correrle el turno.

La primera versión resolvía el stock en la aplicación: leía el stock disponible, comprobaba que alcanzara y después lo actualizaba. Entre la lectura y la escritura hay una ventana de milisegundos donde otra petición puede leer el mismo valor. Con poco tráfico casi nunca pasa, y por eso el error es difícil de detectar probando a mano; con dos personas comprando a la vez el sábado a la noche, pasa.

Además, la aplicación corre en Vercel como funciones serverless: no hay un único proceso donde poner un candado en memoria. Dos peticiones simultáneas pueden ejecutarse en instancias distintas que no se conocen entre sí.

El sistema tampoco tiene un solo camino de escritura. Hoy los pedidos entran por la tienda, pero mañana pueden entrar por el panel, por una carga masiva o por un script de migración. Una regla escrita en la capa de aplicación solo protege el camino donde está escrita.

## Decisión

**Las reglas que definen qué estados son válidos viven en PostgreSQL, no en el código de la aplicación.**

En concreto:

- **Los pedidos se crean con la función `create_order`**, que bloquea las filas de producto con `SELECT ... FOR UPDATE` antes de verificar el stock, y hace todo —validar, insertar el pedido, insertar los ítems y descontar el inventario— dentro de una única transacción.

- **Las citas no pueden solaparse por una restricción de exclusión:**

  ```sql
  ALTER TABLE appointments
    ADD CONSTRAINT citas_sin_solapamiento
    EXCLUDE USING gist (tstzrange(starts_at, ends_at) WITH &&)
    WHERE (status <> 'cancelada');
  ```

- **Los precios y los totales los calcula la base**, leyendo las tablas. El navegador solo envía qué producto y cuánto, o qué servicios y cuándo.

- **Las validaciones de datos del cliente** —correo, teléfono, dirección, método de pago— están en las funciones SQL, no solo en el formulario.

La aplicación conserva dos responsabilidades: validar la *forma* de lo que llega (que un id sea un entero, que el carrito no tenga 5.000 líneas) y **traducir** los errores de la base a códigos HTTP con mensajes que la clienta entienda.

## Consecuencias

### Positivas

- **La regla no se puede eludir.** No importa si la escritura viene de la tienda, del panel, de un script o de alguien con acceso directo a la base: la restricción se aplica igual.
- **El problema de concurrencia desaparece de verdad**, no se hace menos probable. PostgreSQL serializa el acceso a las filas bloqueadas y rechaza el rango solapado, sin importar cuántas peticiones lleguen ni en qué instancia corran.
- **El precio manipulado deja de ser un problema.** Verificado: enviando `total: 1` para un pedido de L 1.360, se cobran los L 1.360 reales.
- **Menos código de aplicación** para mantener y para probar.
- **Los errores dicen la verdad.** El mensaje "Solo quedan 1 unidades" sale del dato real en el momento del intento, no de una copia leída antes.

### Negativas — lo que se sacrificó

- **La lógica quedó partida en dos lenguajes.** Hay reglas en JavaScript y reglas en PL/pgSQL. Alguien que lea solo el código de la aplicación no ve el sistema completo.
- **Cambiar una regla exige una migración SQL**, no solo un despliegue. Es más lento y más ceremonioso que editar una función.
- **Las reglas en SQL no están cubiertas por las pruebas automáticas.** Las 141 pruebas simulan el cliente de base de datos, así que verifican que la aplicación llame bien y traduzca bien los errores, pero no que `create_order` haga lo correcto. Eso se verificó a mano contra la base real.
- **Depende de PostgreSQL.** La restricción de exclusión con `tstzrange` no existe en MySQL ni en SQLite. Migrar de motor implicaría reescribir estas reglas.
- **Curva de aprendizaje.** PL/pgSQL y los niveles de aislamiento son menos conocidos que el JavaScript del resto del proyecto.

### Neutras

- El panel de administración escribe por las mismas funciones, así que hereda las mismas garantías sin código extra.

## Alternativas consideradas

**Bloqueo optimista con una columna de versión.** Habría funcionado para el stock, pero no resuelve el solapamiento de citas, que no es un conflicto sobre una fila sino sobre un rango. Habrían hecho falta dos mecanismos distintos.

**Una cola de escrituras serializada.** Elimina la concurrencia por diseño, pero agrega una pieza de infraestructura, latencia y un punto de falla nuevo, para un salón que recibe unos pocos pedidos por día. Desproporcionado.

**Dejarlo como estaba y aceptar el riesgo.** Es lo que hacen muchos proyectos de este tamaño. Se descartó porque el costo de sobrevender es que la dueña tenga que llamar a una clienta a decirle que no hay producto, y eso le cuesta la clienta.

---

## Referencias

- Implementación: [`supabase/migraciones/002_pedidos.sql`](../../supabase/migraciones/002_pedidos.sql), [`supabase/historico/citas-v2.sql`](../../supabase/historico/citas-v2.sql)
- Traducción de errores: [`pages/api/orders.js`](../../pages/api/orders.js), [`pages/api/appointments.js`](../../pages/api/appointments.js)
- Relacionada: [ADR-002](ADR-002-acceso-a-supabase-solo-desde-el-servidor.md)
