/**
 * Servicios que ofrece el salón.
 *
 * Viven en el código y no en la base de datos: desde que las citas se piden
 * por WhatsApp, esta lista solo se muestra, nadie la consulta ni la escribe.
 * Guardarla en PostgreSQL agregaría una tabla, una ruta de API y una pantalla
 * de administración para algo que cambia dos veces al año.
 *
 * Para modificar precios o agregar un servicio, se edita este archivo.
 */
export const SERVICIOS = [
  {
    id: 'manicure',
    nombre: 'Manicure y esmaltado',
    categoria: 'unas',
    descripcion: 'Manicure completo con esmaltado tradicional.',
    duracion: '1 h',
    precio: 350
  },
  {
    id: 'gel',
    nombre: 'Esmaltado en gel',
    categoria: 'unas',
    descripcion: 'Semipermanente de larga duración.',
    duracion: '1 h 30 min',
    precio: 500
  },
  {
    id: 'acrilicas',
    nombre: 'Uñas acrílicas',
    categoria: 'unas',
    descripcion: 'Aplicación con diseño a elección.',
    duracion: '2 h',
    precio: 800
  },
  {
    id: 'lifting',
    nombre: 'Lifting de pestañas',
    categoria: 'pestanas',
    descripcion: 'Curvado y tinte de pestañas naturales.',
    duracion: '1 h',
    precio: 600
  },
  {
    id: 'extensiones',
    nombre: 'Extensiones de pestañas',
    categoria: 'pestanas',
    descripcion: 'Extensiones clásicas, pelo por pelo.',
    duracion: '2 h',
    precio: 900
  },
  {
    id: 'cejas',
    nombre: 'Diseño de cejas',
    categoria: 'cejas',
    descripcion: 'Depilación y diseño según la forma del rostro.',
    duracion: '30 min',
    precio: 250
  },
  {
    id: 'laminado',
    nombre: 'Laminado de cejas',
    categoria: 'cejas',
    descripcion: 'Laminado con tinte y nutrición.',
    duracion: '1 h',
    precio: 550
  },
  {
    id: 'social',
    nombre: 'Maquillaje social',
    categoria: 'maquillaje',
    descripcion: 'Para eventos y ocasiones especiales.',
    duracion: '1 h',
    precio: 700
  },
  {
    id: 'novia',
    nombre: 'Maquillaje de novia',
    categoria: 'maquillaje',
    descripcion: 'Incluye prueba previa y el día del evento.',
    duracion: '2 h',
    precio: 1800
  }
];

export const FRANJAS_PREFERIDAS = [
  { id: 'manana', etiqueta: 'Por la mañana', detalle: '9:00 AM a 12:00 PM' },
  { id: 'mediodia', etiqueta: 'Al mediodía', detalle: '12:00 PM a 3:00 PM' },
  { id: 'tarde', etiqueta: 'Por la tarde', detalle: '3:00 PM a 7:00 PM' },
  { id: 'cualquiera', etiqueta: 'Me acomodo', detalle: 'Cualquier horario' }
];
