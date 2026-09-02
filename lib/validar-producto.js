import { esCategoriaValida } from '@/lib/categorias';

const LARGO_MAXIMO_NOMBRE = 120;
const LARGO_MAXIMO_DESCRIPCION = 500;
const PRECIO_MAXIMO = 999999.99;
const STOCK_MAXIMO = 100000;

/**
 * Cada validador recibe el valor crudo y devuelve `{ valor }` con el dato ya
 * normalizado, o `{ error }` con un mensaje para quien está cargando el
 * producto.
 *
 * Están separados a propósito: juntos formaban una única función que había
 * que leer entera para entender qué le pasa a un campo. Así cada regla se
 * lee, se cambia y se prueba sola.
 */

function validarNombre(crudo) {
  const nombre = String(crudo ?? '').trim();

  if (nombre.length === 0) return { error: 'El nombre es obligatorio.' };
  if (nombre.length > LARGO_MAXIMO_NOMBRE) {
    return { error: `El nombre no puede pasar de ${LARGO_MAXIMO_NOMBRE} caracteres.` };
  }

  return { valor: nombre };
}

function validarCategoria(crudo) {
  const categoria = String(crudo ?? '').trim();

  if (!esCategoriaValida(categoria)) return { error: 'La categoría no es válida.' };

  return { valor: categoria };
}

function validarPrecio(crudo) {
  const precio = Number(crudo);

  if (!Number.isFinite(precio) || precio < 0) {
    return { error: 'El precio debe ser un número mayor o igual a cero.' };
  }
  if (precio > PRECIO_MAXIMO) return { error: 'El precio es demasiado alto.' };

  // La columna es NUMERIC(10,2): más decimales se perderían en silencio.
  return { valor: Math.round(precio * 100) / 100 };
}

function validarStock(crudo) {
  const stock = Number(crudo);

  if (!Number.isInteger(stock) || stock < 0) {
    return { error: 'El stock debe ser un número entero mayor o igual a cero.' };
  }
  if (stock > STOCK_MAXIMO) return { error: 'El stock es demasiado alto.' };

  return { valor: stock };
}

function validarDescripcion(crudo) {
  const descripcion = String(crudo ?? '').trim();

  if (descripcion.length > LARGO_MAXIMO_DESCRIPCION) {
    return { error: `La descripción no puede pasar de ${LARGO_MAXIMO_DESCRIPCION} caracteres.` };
  }

  return { valor: descripcion };
}

function validarImagen(crudo) {
  const imagen = String(crudo ?? '').trim();

  if (imagen.length === 0) return { valor: imagen };

  let url;
  try {
    url = new URL(imagen);
  } catch {
    return { error: 'La dirección de la imagen no es una URL válida.' };
  }

  // Solo http/https: un javascript: o un data: en el src de una imagen que
  // se renderiza en la tienda es una vía de inyección.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { error: 'La imagen debe usar una dirección http o https.' };
  }

  return { valor: imagen };
}

/**
 * Campos del producto y su validador. `obligatorio` distingue los que tienen
 * que venir al crear de los que pueden faltar siempre.
 */
const CAMPOS = [
  { nombre: 'name', validar: validarNombre, obligatorio: true },
  { nombre: 'category', validar: validarCategoria, obligatorio: true },
  { nombre: 'price', validar: validarPrecio, obligatorio: true },
  { nombre: 'stock', validar: validarStock, obligatorio: true },
  { nombre: 'description', validar: validarDescripcion, obligatorio: false },
  { nombre: 'image', validar: validarImagen, obligatorio: false }
];

/**
 * Valida y normaliza un producto que llega del formulario del panel.
 *
 * Devuelve `{ datos }` si está bien, o `{ error }` con un mensaje pensado
 * para mostrarle a quien está cargando el producto. Se usa tanto al crear
 * como al editar, para que ambas rutas apliquen exactamente las mismas
 * reglas.
 *
 * Con `parcial`, solo se validan los campos que vengan: es lo que permite
 * editar únicamente el stock sin tener que reenviar el producto entero.
 */
export function validarProducto(cuerpo, { parcial = false } = {}) {
  const entrada = cuerpo ?? {};
  const datos = {};

  for (const campo of CAMPOS) {
    const vino = entrada[campo.nombre] !== undefined;

    // Al crear, los obligatorios se validan aunque no vengan: así el error
    // dice "el nombre es obligatorio" en lugar de fallar en la base.
    const hayQueValidar = vino || (!parcial && campo.obligatorio);
    if (!hayQueValidar) continue;

    const { valor, error } = campo.validar(entrada[campo.nombre]);
    if (error) return { error };

    datos[campo.nombre] = valor;
  }

  if (parcial && Object.keys(datos).length === 0) {
    return { error: 'No se envió ningún campo para modificar.' };
  }

  return { datos };
}
