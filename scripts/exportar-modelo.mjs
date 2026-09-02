/**
 * Exporta el modelo de datos a docs/modelo-de-datos.json.
 *
 *   node scripts/exportar-modelo.mjs
 *
 * El modelo se describe abajo a partir de supabase/schema.sql, que es la
 * fuente de verdad de la estructura, y el script lo VERIFICA contra la base
 * en producción antes de escribir el archivo: comprueba que cada tabla
 * exista y que las columnas declaradas coincidan con las reales.
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
          descripcion: 'unas, pestanas, cejas, maquillaje o accesorios.'
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
        { nombre: 'customer_email', tipo: 'text', nulo: false, descripcion: 'Validado y normalizado a minúsculas por create_order.' },
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
      indices: [{ nombre: 'orders_created_at_idx', columnas: ['created_at DESC'] }],
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
        { nombre: 'product_id', tipo: 'integer', nulo: true, clave: 'FK', referencia: 'products.id' },
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
      indices: [{ nombre: 'order_items_order_id_idx', columnas: ['order_id'] }],
      rls: { activo: true, politicas: [], motivo: 'Igual que orders: cero acceso público.' }
    }
  ],

  relaciones: [
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
    }
  ],

  notas: [
    'Las citas no se persisten: se solicitan por WhatsApp. Ver docs/adr/ADR-003.',
    'Las tablas services, appointments, appointment_services, business_hours y ' +
      'blocked_dates existieron hasta el 2026-09-01 y fueron eliminadas.',
    'Los servicios y precios del salón viven en lib/servicios.js, no en la base.'
  ]
};

// ===== Verificación contra producción =====

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

    const filas = await res.json();
    if (filas.length === 0) {
      console.log(`  ${entidad.nombre.padEnd(14)} existe, pero está vacía: no se comparan columnas`);
      continue;
    }

    const reales = Object.keys(filas[0]).sort();
    const declaradas = entidad.columnas.map((c) => c.nombre).sort();

    const faltan = reales.filter((c) => !declaradas.includes(c));
    const sobran = declaradas.filter((c) => !reales.includes(c));

    if (faltan.length) problemas.push(`${entidad.nombre}: sin documentar → ${faltan.join(', ')}`);
    if (sobran.length) problemas.push(`${entidad.nombre}: documentadas pero inexistentes → ${sobran.join(', ')}`);

    if (!faltan.length && !sobran.length) {
      console.log(`  ${entidad.nombre.padEnd(14)} ${reales.length} columnas, coinciden`);
    }
  }

  return problemas;
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
  console.error('\nNo se escribió el archivo. Corregí el modelo en este script.');
  process.exit(1);
}

const salida = {
  ...MODELO,
  generado: new Date().toISOString(),
  verificado_contra_produccion: true
};

mkdirSync(join(RAIZ, 'docs'), { recursive: true });
const destino = join(RAIZ, 'docs', 'modelo-de-datos.json');
writeFileSync(destino, JSON.stringify(salida, null, 2) + '\n', 'utf8');

console.log(`\nModelo exportado a docs/modelo-de-datos.json`);
console.log(`  ${MODELO.entidades.length} entidades · ${MODELO.relaciones.length} relaciones · ${MODELO.funciones.length} función`);
