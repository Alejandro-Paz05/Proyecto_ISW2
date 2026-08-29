/**
 * Categorías del catálogo, en un único lugar.
 *
 * Las usan el filtro de la tienda, el formulario del panel y la validación
 * de la API. Antes estaban escritas a mano en el componente del catálogo, de
 * modo que agregar una categoría desde el panel producía un producto que la
 * tienda no sabía mostrar.
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
 * Categorías de los servicios que se reservan. Comparten cuatro con el
 * catálogo de productos, pero no `accesorios` (no se reserva una lima) y
 * suman `otros` para lo que no encaja en ninguna.
 */
export const ETIQUETAS_SERVICIO = {
  unas: 'Uñas',
  pestanas: 'Pestañas',
  cejas: 'Cejas',
  maquillaje: 'Maquillaje',
  otros: 'Otros'
};
