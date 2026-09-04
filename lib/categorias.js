/**
 * Espejo de la tabla `categories`.
 *
 * La fuente de verdad es la base: `categories` guarda la clave, la etiqueta y
 * el orden, y `products.category` tiene una clave foránea contra ella, así
 * que la base es la que impide guardar un producto en una categoría que la
 * tienda no sabe mostrar. Antes eso solo se validaba aquí, y un INSERT hecho
 * desde el panel de Supabase se saltaba la validación entera.
 *
 * Esta copia sigue existiendo por dos razones concretas:
 *
 *   1. La tienda es una PWA. Si `/api/categories` no responde porque el
 *      dispositivo está sin conexión, los filtros tienen que dibujarse
 *      igual en vez de quedar vacíos.
 *   2. `validar-producto` corre antes de tocar la base y necesita rechazar
 *      una categoría inventada sin pagar una consulta por cada validación.
 *
 * Si se agrega una categoría en la base hay que agregarla también acá. Es el
 * costo de tener un espejo, y es deliberado: la alternativa —una consulta
 * más en cada validación y filtros vacíos sin conexión— cuesta más.
 */
export const CATEGORIAS = [
  { key: 'unas', label: 'Uñas' },
  { key: 'pestanas', label: 'Pestañas' },
  { key: 'cejas', label: 'Cejas' },
  { key: 'maquillaje', label: 'Maquillaje' },
  { key: 'accesorios', label: 'Accesorios' }
];

export const CLAVES_CATEGORIA = CATEGORIAS.map((categoria) => categoria.key);

export const ETIQUETAS_CATEGORIA = Object.fromEntries(
  CATEGORIAS.map((categoria) => [categoria.key, categoria.label])
);

export function esCategoriaValida(clave) {
  return CLAVES_CATEGORIA.includes(clave);
}

/**
 * Convierte una lista de categorías —venga de la API o del espejo de arriba—
 * en el mapa clave→etiqueta que usan las tarjetas de producto.
 */
export function etiquetasDe(categorias) {
  return Object.fromEntries(categorias.map((categoria) => [categoria.key, categoria.label]));
}
