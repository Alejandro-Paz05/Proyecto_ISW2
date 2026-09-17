/**
 * Datos fijos que devuelven las rutas de API durante los E2E.
 *
 * El catálogo real tiene 16 productos y su stock cambia con cada pedido: una
 * prueba que dependa de él falla el día que alguien compra algo. Estos cuatro
 * productos, en cambio, cubren a propósito los cuatro estados que puede tener
 * una tarjeta, y no cambian nunca.
 */

// Un icono que ya sirve la propia aplicación. Evita salir a internet a buscar
// una foto en cada prueba.
const IMAGEN = '/icon-192.png';

export const CATEGORIAS = [
  { key: 'unas', label: 'Uñas' },
  { key: 'pestanas', label: 'Pestañas' },
  { key: 'maquillaje', label: 'Maquillaje' }
];

export const PRODUCTOS = [
  {
    id: 1,
    name: 'Kit de uñas acrílicas',
    category: 'unas',
    price: 850,
    description: 'Todo lo necesario para un set completo.',
    image: IMAGEN,
    stock: 12 // Stock holgado: la tarjeta no avisa nada.
  },
  {
    id: 2,
    name: 'Pestañas de seda volumen ruso',
    category: 'pestanas',
    price: 420,
    description: 'Bandeja de 16 líneas.',
    image: IMAGEN,
    stock: 2 // Por debajo del umbral: avisa "¡Solo quedan 2!".
  },
  {
    id: 3,
    name: 'Labial mate rojo',
    category: 'maquillaje',
    price: 260,
    description: 'Larga duración, acabado mate.',
    image: IMAGEN,
    stock: 1 // Avisa "¡Última unidad!".
  },
  {
    id: 4,
    name: 'Base de maquillaje HD',
    category: 'maquillaje',
    price: 640,
    description: 'Cobertura media, tono universal.',
    image: IMAGEN,
    stock: 0 // Agotado: no se puede agregar.
  },
  {
    id: 5,
    name: 'Balines decorativos',
    category: 'unas',
    price: 120,
    description: 'Decoración, dorados o plateados.',
    image: IMAGEN,
    // El stock del producto es la suma de sus colores, como lo mantiene la
    // base: 4 + 1 + 0.
    stock: 5,
    colores: [
      { id: 51, nombre: 'Dorado', hex: '#d4af37', stock: 4 },
      { id: 52, nombre: 'Plateado', hex: '#c0c0c0', stock: 1 },
      { id: 53, nombre: 'Tornasol', hex: null, stock: 0 } // Ese color, agotado.
    ]
  }
];

/** Lo que devuelve create_order cuando el pedido se registra bien. */
export const PEDIDO_CREADO = {
  id: 42,
  order_number: 'AK-001042',
  customer_email: 'maria@ejemplo.com',
  total: 850,
  status: 'pendiente'
};

export const PEDIDOS_DEL_PANEL = [
  {
    id: 42,
    order_number: 'AK-001042',
    customer_name: 'María López',
    customer_email: 'maria@ejemplo.com',
    customer_phone: '+504 9999-0000',
    customer_address: 'San Pedro Sula, Bosques de Jucutuma 1',
    payment_method: 'transferencia',
    total: 1110,
    status: 'pendiente',
    created_at: '2026-09-10T15:30:00.000Z',
    order_items: [
      { product_name: 'Kit de uñas acrílicas', quantity: 1, price: 850 },
      { product_name: 'Labial mate rojo', quantity: 1, price: 260 }
    ],
    order_status_history: [
      {
        status: 'pendiente',
        note: 'Pedido creado desde la tienda',
        changed_at: '2026-09-10T15:30:00.000Z'
      }
    ]
  },
  {
    id: 43,
    order_number: 'AK-001043',
    customer_name: 'Carla Medina',
    customer_email: 'carla@ejemplo.com',
    customer_phone: '+504 8888-1111',
    customer_address: 'Tegucigalpa, Colonia Palmira',
    payment_method: 'efectivo',
    total: 420,
    status: 'entregado',
    created_at: '2026-09-09T18:05:00.000Z',
    order_items: [{ product_name: 'Pestañas de seda volumen ruso', quantity: 1, price: 420 }],
    order_status_history: [
      { status: 'pendiente', note: null, changed_at: '2026-09-09T18:05:00.000Z' },
      { status: 'entregado', note: null, changed_at: '2026-09-09T20:15:00.000Z' }
    ]
  }
];
