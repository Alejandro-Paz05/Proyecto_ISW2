/**
 * Exporta el modelo de datos a dos archivos:
 *
 *   docs/db-export.json         Formato de intercambio: tablas, columnas,
 *                               índices, relaciones y políticas RLS, con el
 *                               conteo real de filas de cada tabla.
 *   docs/modelo-de-datos.json   La versión anotada, con el porqué de cada
 *                               decisión. Es la que se lee en la revisión.
 *
 *   node scripts/exportar-modelo.mjs
 *
 * Los dos salen de la misma declaración de más abajo, así que no pueden
 * desincronizarse entre sí.
 *
 * La declaración se escribe a mano a partir de supabase/schema.sql, pero el
 * script la VERIFICA contra la base en producción antes de escribir nada:
 * comprueba que cada tabla exista, que las columnas coincidan una a una, y
 * consulta cuántas filas tiene realmente cada una. Si algo no cuadra, no
 * escribe los archivos y sale con código 1.
 *
 * Esa verificación es el punto del script. Un modelo escrito a mano se
 * desactualiza en silencio; este falla ruidosamente si alguien agrega una
 * columna en Supabase y se olvida de documentarla.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// ===== Credenciales =====

function leerEnv() {
  const texto = readFileSync(join(RAIZ, '.env.local'), 'utf8');
  const env = {};
  for (const linea of texto.split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const i = limpia.indexOf('=');
    if (i > 0) env[limpia.slice(0, i).trim()] = limpia.slice(i + 1).trim();
  }
  return env;
}

// ===== El modelo =====

const MODELO = {
  proyecto: 'Akari Studio',
  descripcion:
    'Tienda en línea con inventario del salón de belleza Akari Studio. ' +
    'Las citas se solicitan por WhatsApp y no se persisten: ver docs/adr/ADR-003.',
  codigo_verificacion: 'LEARN-CAP-76080609',
  motor: 'PostgreSQL (Supabase)',
  esquema: 'public',
  repositorio: 'https://github.com/Alejandro-Paz05/Proyecto_ISW2',

  entidades: [
    {
      nombre: 'categories',
      descripcion:
        'Categorías del catálogo. Fuente de verdad; lib/categorias.js es su espejo ' +
        'para el modo sin conexión y para validar sin consultar la base.',
      clave_primaria: ['id'],
      columnas: [
        { nombre: 'id', tipo: 'serial', nulo: false, clave: 'PK' },
        {
          nombre: 'key',
          tipo: 'text',
          nulo: false,
          clave: 'UNIQUE',
          restriccion: "key ~ '^[a-z]+$'",
          descripcion: 'Sin acentos ni espacios: viaja en la URL del filtro de la tienda.'
        },
        { nombre: 'label', tipo: 'text', nulo: false, descripcion: 'Lo que ve la clienta.' },
        {
          nombre: 'position',
          tipo: 'integer',
          nulo: false,
          por_defecto: '0',
          descripcion: 'Orden de los filtros. No alfabético: lo decide la dueña.'
        },
        { nombre: 'created_at', tipo: 'timestamptz', nulo: false, por_defecto: 'now()' }
      ],
      indices: [],
      relaciones: [],
      rls: {
        activo: true,
        politicas: [
          {
            nombre: 'categories_public_read',
            operacion: 'SELECT',
            roles: ['anon', 'authenticated'],
            condicion: 'true',
            motivo: 'Las categorías son parte del catálogo, que es información pública.'
          }
        ]
      }
    },
    {
      nombre: 'products',
      descripcion: 'Catálogo de productos a la venta, con su inventario.',
      clave_primaria: ['id'],
      columnas: [
        { nombre: 'id', tipo: 'serial', nulo: false, clave: 'PK' },
        { nombre: 'name', tipo: 'text', nulo: false, descripcion: 'Nombre visible en la tienda.' },
        {
          nombre: 'category',
          tipo: 'text',
          nulo: false,
          clave: 'FK',
          referencia: 'categories.key',
          descripcion: 'La clave foránea impide guardar un producto en una categoría inexistente.'
        },
        {
          nombre: 'price',
          tipo: 'numeric(10,2)',
          nulo: false,
          restriccion: 'price >= 0',
          descripcion: 'Precio en lempiras. Lo lee el servidor, nunca el navegador.'
        },
        { nombre: 'description', tipo: 'text', nulo: true },
        { nombre: 'image', tipo: 'text', nulo: true, descripcion: 'URL http o https.' },
        {
          nombre: 'stock',
          tipo: 'integer',
          nulo: false,
          por_defecto: '0',
          restriccion: 'stock >= 0',
          descripcion: 'Unidades disponibles. Lo descuenta create_order.'
        },
        { nombre: 'created_at', tipo: 'timestamptz', nulo: false, por_defecto: 'now()' }
      ],
      indices: [
        {
          nombre: 'products_category_idx',
          columnas: ['category'],
          motivo:
            'PostgreSQL no indexa solo el origen de una clave foránea. Sin esto, ' +
            'borrar o renombrar una categoría recorre products entero.'
        }
      ],
      relaciones: [{ columna: 'category', referencia: 'categories.key' }],
      rls: {
        activo: true,
        politicas: [
          {
            nombre: 'products_public_read',
            operacion: 'SELECT',
            roles: ['anon', 'authenticated'],
            condicion: 'true',
            motivo: 'El catálogo es información pública; escribirlo requiere el servidor.'
          }
        ]
      }
    },
    {
      nombre: 'orders',
      descripcion: 'Pedidos recibidos. Contiene datos personales del cliente.',
      clave_primaria: ['id'],
      columnas: [
        { nombre: 'id', tipo: 'serial', nulo: false, clave: 'PK' },
        {
          nombre: 'order_number',
          tipo: 'text',
          nulo: false,
          clave: 'UNIQUE',
          descripcion: 'Correlativo AK-001000, desde una secuencia. Nunca se repite.'
        },
        { nombre: 'customer_name', tipo: 'text', nulo: false },
        {
          nombre: 'customer_email',
          tipo: 'text',
          nulo: false,
          descripcion: 'Validado y normalizado a minúsculas por create_order.'
        },
        { nombre: 'customer_phone', tipo: 'text', nulo: false },
        { nombre: 'customer_address', tipo: 'text', nulo: false },
        {
          nombre: 'payment_method',
          tipo: 'text',
          nulo: false,
          restriccion: "payment_method IN ('efectivo','tarjeta','transferencia')"
        },
        {
          nombre: 'total',
          tipo: 'numeric(10,2)',
          nulo: false,
          restriccion: 'total >= 0',
          descripcion: 'Calculado por la base sumando precios reales. No llega del navegador.'
        },
        {
          nombre: 'status',
          tipo: 'text',
          nulo: false,
          por_defecto: "'pendiente'",
          restriccion: "status IN ('pendiente','confirmado','enviado','entregado','cancelado')"
        },
        { nombre: 'created_at', tipo: 'timestamptz', nulo: false, por_defecto: 'now()' }
      ],
      indices: [
        {
          nombre: 'orders_created_at_idx',
          columnas: ['created_at DESC'],
          motivo: 'El panel lista siempre del más reciente al más viejo.'
        }
      ],
      relaciones: [],
      rls: {
        activo: true,
        politicas: [],
        motivo:
          'Sin políticas y con RLS activo, el acceso público es cero. Guarda datos ' +
          'personales que solo el servidor debe poder leer.'
      }
    },
    {
      nombre: 'order_items',
      descripcion: 'Líneas de cada pedido, con su propia copia del nombre y el precio.',
      clave_primaria: ['id'],
      columnas: [
        { nombre: 'id', tipo: 'serial', nulo: false, clave: 'PK' },
        { nombre: 'order_id', tipo: 'integer', nulo: false, clave: 'FK', referencia: 'orders.id' },
        {
          nombre: 'product_id',
          tipo: 'integer',
          nulo: true,
          clave: 'FK',
          referencia: 'products.id'
        },
        {
          nombre: 'product_name',
          tipo: 'text',
          nulo: false,
          descripcion: 'Copia histórica: conserva el nombre con que se vendió.'
        },
        { nombre: 'quantity', tipo: 'integer', nulo: false, restriccion: 'quantity > 0' },
        {
          nombre: 'price',
          tipo: 'numeric(10,2)',
          nulo: false,
          restriccion: 'price >= 0',
          descripcion: 'Copia histórica: el precio cobrado ese día, no el actual.'
        }
      ],
      indices: [
        {
          nombre: 'order_items_order_id_idx',
          columnas: ['order_id'],
          motivo: 'Cada pedido del panel trae sus líneas anidadas.'
        }
      ],
      relaciones: [
        { columna: 'order_id', referencia: 'orders.id' },
        { columna: 'product_id', referencia: 'products.id' }
      ],
      rls: { activo: true, politicas: [], motivo: 'Igual que orders: cero acceso público.' }
    },
    {
      nombre: 'order_status_history',
      descripcion:
        'Bitácora de estados de cada pedido. La escribe el trigger orders_registrar_estado, ' +
        'nunca la aplicación.',
      clave_primaria: ['id'],
      columnas: [
        { nombre: 'id', tipo: 'serial', nulo: false, clave: 'PK' },
        { nombre: 'order_id', tipo: 'integer', nulo: false, clave: 'FK', referencia: 'orders.id' },
        {
          nombre: 'status',
          tipo: 'text',
          nulo: false,
          restriccion: "status IN ('pendiente','confirmado','enviado','entregado','cancelado')"
        },
        {
          nombre: 'note',
          tipo: 'text',
          nulo: true,
          descripcion: 'Solo la primera entrada la trae: cómo entró el pedido.'
        },
        { nombre: 'changed_at', tipo: 'timestamptz', nulo: false, por_defecto: 'now()' }
      ],
      indices: [
        {
          nombre: 'order_status_history_order_idx',
          columnas: ['order_id', 'changed_at DESC'],
          motivo:
            'El panel siempre pide la bitácora de un pedido ordenada por fecha. ' +
            'El índice compuesto cubre la consulta entera.'
        }
      ],
      relaciones: [{ columna: 'order_id', referencia: 'orders.id' }],
      rls: {
        activo: true,
        politicas: [],
        motivo: 'Está atada a pedidos, que tampoco son públicos.'
      }
    }
  ],

  relaciones: [
    {
      desde: 'products.category',
      hacia: 'categories.key',
      cardinalidad: 'N:1',
      al_borrar: 'RESTRICT',
      al_actualizar: 'CASCADE',
      motivo:
        'No se borra una categoría que todavía tiene productos, y renombrar la clave ' +
        'arrastra a los productos en lugar de dejarlos huérfanos.'
    },
    {
      desde: 'order_items.order_id',
      hacia: 'orders.id',
      cardinalidad: 'N:1',
      al_borrar: 'CASCADE',
      motivo: 'Un pedido sin sus líneas no tiene sentido: se borran juntos.'
    },
    {
      desde: 'order_items.product_id',
      hacia: 'products.id',
      cardinalidad: 'N:1',
      al_borrar: 'SET NULL',
      motivo:
        'Eliminar un producto del catálogo no debe borrar el historial de ventas. ' +
        'La línea conserva product_name y price, así que la venta sigue siendo legible.'
    },
    {
      desde: 'order_status_history.order_id',
      hacia: 'orders.id',
      cardinalidad: 'N:1',
      al_borrar: 'CASCADE',
      motivo: 'La bitácora de un pedido borrado no le sirve a nadie.'
    }
  ],

  funciones: [
    {
      nombre: 'create_order',
      tipo: 'SECURITY DEFINER',
      lenguaje: 'plpgsql',
      parametros: [
        'p_customer_name text',
        'p_customer_email text',
        'p_customer_phone text',
        'p_customer_address text',
        'p_payment_method text',
        'p_items jsonb'
      ],
      retorna: 'jsonb',
      descripcion:
        'Única vía para registrar un pedido. Bloquea las filas de producto con ' +
        'SELECT ... FOR UPDATE ordenadas por id, valida el stock, calcula el total ' +
        'con los precios de la base, inserta el pedido y sus líneas, y descuenta el ' +
        'inventario. Todo en una transacción.',
      permisos: 'Solo service_role. Revocada de PUBLIC, anon y authenticated.'
    },
    {
      nombre: 'registrar_estado_pedido',
      tipo: 'SECURITY DEFINER',
      lenguaje: 'plpgsql',
      parametros: [],
      retorna: 'trigger',
      descripcion:
        'Trigger AFTER INSERT OR UPDATE OF status sobre orders. Escribe una fila en ' +
        'order_status_history cuando el pedido nace y cada vez que su estado cambia ' +
        'de verdad (IS DISTINCT FROM, para no registrar un UPDATE que deja el mismo ' +
        'valor).',
      permisos: 'Lo invoca el trigger; no se llama desde la aplicación.'
    }
  ],

  reglas_de_negocio: [
    {
      regla: 'No se puede vender más stock del disponible',
      donde: 'create_order, con SELECT ... FOR UPDATE',
      por_que:
        'Leer y escribir en dos pasos deja una ventana donde dos pedidos simultáneos ' +
        'ven el mismo stock. Al correr en funciones serverless no hay un proceso único ' +
        'donde poner un candado en memoria.'
    },
    {
      regla: 'El precio y el total los calcula la base',
      donde: 'create_order',
      por_que: 'Si vinieran del navegador, se podría pedir un producto de L 680 por L 1.'
    },
    {
      regla: 'Las líneas de un pedido guardan copia del nombre y el precio',
      donde: 'order_items',
      por_que: 'Una venta cerrada debe conservar lo que se cobró, aunque cambie la tarifa.'
    },
    {
      regla: 'El número de pedido nunca se repite',
      donde: 'Secuencia order_number_seq + restricción UNIQUE',
      por_que:
        'La primera versión usaba los últimos dígitos de un timestamp, que se repiten ' +
        'cada ~16 minutos y chocaban contra la restricción.'
    },
    {
      regla: 'Un producto no puede quedar en una categoría que no existe',
      donde: 'Clave foránea products.category → categories.key',
      por_que:
        'La validación vivía solo en la aplicación, así que un INSERT hecho desde el ' +
        'panel de Supabase la saltaba entera y dejaba el producto invisible en la tienda.'
    },
    {
      regla: 'Todo cambio de estado de un pedido queda registrado',
      donde: 'Trigger orders_registrar_estado',
      por_que:
        'Si la bitácora dependiera de la ruta de API, cambiar el estado desde el panel ' +
        'de Supabase perdería el registro. En un trigger no hay forma de evitarlo.'
    }
  ],

  notas: [
    'Las citas no se persisten: se solicitan por WhatsApp. Ver docs/adr/ADR-003.',
    'Las tablas services, appointments, appointment_services, business_hours y ' +
      'blocked_dates existieron hasta el 2026-09-01 y fueron eliminadas.',
    'lib/categorias.js es un espejo de la tabla categories, no la fuente de verdad.'
  ]
};

// ===== Verificación contra producción =====

async function contarFilas(base, cabeceras, tabla) {
  // PostgREST devuelve el total en Content-Range cuando se le pide count=exact.
  // limit=1 evita traer la tabla entera solo para contarla.
  const res = await fetch(`${base}/${tabla}?select=id&limit=1`, {
    headers: { ...cabeceras, Prefer: 'count=exact' }
  });

  if (!res.ok) return null;

  const rango = res.headers.get('content-range');
  const total = rango?.split('/')[1];
  return total && total !== '*' ? Number(total) : null;
}

async function verificar(env) {
  const base = `${env.SUPABASE_URL}/rest/v1`;
  const cabeceras = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
  };

  const problemas = [];

  for (const entidad of MODELO.entidades) {
    const res = await fetch(`${base}/${entidad.nombre}?select=*&limit=1`, { headers: cabeceras });

    if (!res.ok) {
      problemas.push(`La tabla ${entidad.nombre} no existe o no responde (HTTP ${res.status}).`);
      continue;
    }

    entidad.filas = (await contarFilas(base, cabeceras, entidad.nombre)) ?? 0;

    const filas = await res.json();
    if (filas.length === 0) {
      console.log(`  ${entidad.nombre.padEnd(21)} existe y está vacía: no se comparan columnas`);
      continue;
    }

    // El orden no cambia el resultado de la comparación, pero sí el de los
    // mensajes de error: ordenar deja una salida estable entre corridas.
    // localeCompare y no el sort por defecto, que ordena por código UTF-16 y
    // ubica mal cualquier nombre con acento.
    const alfabeticamente = (a, b) => a.localeCompare(b);

    const reales = Object.keys(filas[0]).sort(alfabeticamente);
    const declaradas = entidad.columnas.map((c) => c.nombre).sort(alfabeticamente);

    const faltan = reales.filter((c) => !declaradas.includes(c));
    const sobran = declaradas.filter((c) => !reales.includes(c));

    if (faltan.length) problemas.push(`${entidad.nombre}: sin documentar → ${faltan.join(', ')}`);
    if (sobran.length) {
      problemas.push(`${entidad.nombre}: documentadas pero inexistentes → ${sobran.join(', ')}`);
    }

    if (!faltan.length && !sobran.length) {
      console.log(
        `  ${entidad.nombre.padEnd(21)} ${String(reales.length).padStart(2)} columnas, ` +
          `${String(entidad.filas).padStart(3)} filas`
      );
    }
  }

  return problemas;
}

// ===== Formato de intercambio =====

function aFormatoExport(generadoEn) {
  return {
    generado_at: generadoEn,
    motor: 'postgres',
    proyecto: MODELO.proyecto,
    codigo_verificacion: MODELO.codigo_verificacion,
    tablas: MODELO.entidades.map((entidad) => ({
      nombre: entidad.nombre,
      filas: entidad.filas ?? 0,
      columnas: entidad.columnas.map((columna) => ({
        nombre: columna.nombre,
        tipo: columna.tipo,
        ...(columna.clave === 'PK' ? { pk: true } : {}),
        nulo: columna.nulo
      })),
      indices: entidad.indices.map((indice) => indice.nombre),
      relaciones: entidad.relaciones,
      politicas_rls: entidad.rls.politicas.map((politica) => politica.nombre)
    }))
  };
}

// ===== Salida =====

const env = leerEnv();

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

console.log('Verificando el modelo contra la base en producción:\n');
const problemas = await verificar(env);

if (problemas.length > 0) {
  console.error('\nEl modelo no coincide con la base:');
  for (const p of problemas) console.error(`  - ${p}`);
  console.error('\nNo se escribió ningún archivo. Corregí el modelo en este script.');
  process.exit(1);
}

const generadoEn = new Date().toISOString();

mkdirSync(join(RAIZ, 'docs'), { recursive: true });

function escribir(nombre, contenido) {
  writeFileSync(join(RAIZ, 'docs', nombre), JSON.stringify(contenido, null, 2) + '\n', 'utf8');
}

escribir('db-export.json', aFormatoExport(generadoEn));
escribir('modelo-de-datos.json', {
  ...MODELO,
  generado: generadoEn,
  verificado_contra_produccion: true
});

const conDatos = MODELO.entidades.filter((e) => (e.filas ?? 0) > 0).length;
const politicas = MODELO.entidades.reduce((n, e) => n + e.rls.politicas.length, 0);
const indices = MODELO.entidades.reduce((n, e) => n + e.indices.length, 0);

console.log('\nExportado a docs/db-export.json y docs/modelo-de-datos.json');
console.log(
  `  ${MODELO.entidades.length} tablas (${conDatos} con datos) · ` +
    `${MODELO.relaciones.length} relaciones · ${indices} índices · ` +
    `${politicas} políticas RLS · ${MODELO.funciones.length} funciones`
);
