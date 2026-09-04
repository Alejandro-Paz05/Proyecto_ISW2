# Base de datos

Todo el esquema de Akari Studio vive en `migraciones/`, numerado y en orden.

## Cómo se corre

En **Supabase → SQL Editor → New query**, pegá y ejecutá los archivos **en orden numérico**:

| | Archivo | Qué deja |
|---|---|---|
| 000 | `registro_de_migraciones.sql` | La tabla que anota qué se aplicó |
| 001 | `catalogo.sql` | `categories`, `products`, la clave foránea entre ambas y sus políticas de lectura pública |
| 002 | `pedidos.sql` | `orders`, `order_items`, la secuencia del número de pedido y `create_order` |
| 003 | `bitacora_de_estados.sql` | `order_status_history` y el trigger que la escribe |
| 004 | `catalogo_de_ejemplo.sql` | 16 productos de prueba — **opcional** |

Sobre una base que ya está al día, correrlos de nuevo no cambia nada y no da error. Esa es la idea.

Para ver en qué estado quedó, `estado.sql` responde en una sola consulta qué migraciones están aplicadas, qué tablas hay con cuántas filas, qué políticas protegen cada una y qué triggers corren solos. Solo lee.

Desde el proyecto, `npm run db:estado` hace la misma comprobación contra la base real sin abrir Supabase.

## Por qué son idempotentes

Que un archivo se pueda correr dos veces sin romper nada no sale gratis: cada tipo de sentencia necesita su propia forma.

| Se crea | Cómo |
|---|---|
| Tablas, índices, secuencias | `CREATE ... IF NOT EXISTS` |
| Funciones | `CREATE OR REPLACE` |
| Políticas y triggers | `DROP ... IF EXISTS` y después `CREATE` |
| Claves foráneas | Se consulta `pg_constraint` antes de agregarlas |
| Filas | `INSERT ... ON CONFLICT`, o una guarda que corta si ya hay datos |

Las claves foráneas son el caso interesante. Lo cómodo sería `DROP CONSTRAINT IF EXISTS` seguido de `ADD CONSTRAINT`, pero eso revalida la tabla entera **cada vez** que se corre el archivo. Consultando `pg_constraint` primero, sobre una base que ya la tiene la migración no toca nada.

Cada archivo va dentro de una transacción y se anota al final en `schema_migraciones` con `ON CONFLICT DO NOTHING`. Si algo falla a mitad de camino, no queda aplicado a medias.

## `historico/`

Scripts de funcionalidades que ya no existen. **No los corras.** Se conservan porque documentan decisiones que se tomaron y se revirtieron:

- `citas.sql` y `citas-v2.sql` — la agenda de reserva en línea, con disponibilidad en tiempo real y una restricción de exclusión sobre rangos de tiempo que hacía imposible el solapamiento.
- `eliminar-citas.sql` — lo que la retiró.

La clienta pidió sacarla y pedir las citas por WhatsApp. Está explicado en [ADR-003](../docs/adr/ADR-003-solicitud-de-citas-por-whatsapp.md).

## Qué pasó con `schema.sql` y `seed.sql`

Ya no existen. `schema.sql` borraba las tablas y las volvía a crear vacías, así que solo servía en una base nueva y era peligroso en cualquier otra; para actualizar una base con datos hacía falta un archivo aparte, que era justo la deriva que llevó a que los archivos dejaran de coincidir con la realidad. Su contenido está repartido entre las migraciones 001, 002 y 003, y el de `seed.sql` en la 004. Siguen en el historial de git.
