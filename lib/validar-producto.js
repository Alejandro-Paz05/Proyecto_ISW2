import { esCategoriaValida } from '@/lib/categorias';

const LARGO_MAXIMO_NOMBRE = 120;
const LARGO_MAXIMO_DESCRIPCION = 500;
const PRECIO_MAXIMO = 999999.99;
const STOCK_MAXIMO = 100000;

/**
 * Valida y normaliza un producto que llega del formulario del panel.
 *
 * Devuelve `{ datos }` si está bien, o `{ error }` con un mensaje pensado
 * para mostrarle a quien está cargando el producto. Se usa tanto al crear
 * como al editar, para que ambas rutas apliquen exactamente las mismas
 * reglas.
 */
export function validarProducto(cuerpo, { parcial = false } = {}) {
  const datos = {};
  const entrada = cuerpo ?? {};

  const tiene = (campo) => entrada[campo] !== undefined;
  const requerido = (campo) => !parcial || tiene(campo);

  if (requerido('name')) {
    const name = String(entrada.name ?? '').trim();
    if (name.length === 0) return { error: 'El nombre es obligatorio.' };
    if (name.length > LARGO_MAXIMO_NOMBRE) {
      return { error: `El nombre no puede pasar de ${LARGO_MAXIMO_NOMBRE} caracteres.` };
    }
    datos.name = name;
  }

  if (requerido('category')) {
    const category = String(entrada.category ?? '').trim();
    if (!esCategoriaValida(category)) return { error: 'La categoría no es válida.' };
    datos.category = category;
  }

  if (requerido('price')) {
    const price = Number(entrada.price);
    if (!Number.isFinite(price) || price < 0) {
      return { error: 'El precio debe ser un número mayor o igual a cero.' };
    }
    if (price > PRECIO_MAXIMO) return { error: 'El precio es demasiado alto.' };
    // La columna es NUMERIC(10,2): más decimales se perderían en silencio.
    datos.price = Math.round(price * 100) / 100;
  }

  if (requerido('stock')) {
    const stock = Number(entrada.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      return { error: 'El stock debe ser un número entero mayor o igual a cero.' };
    }
    if (stock > STOCK_MAXIMO) return { error: 'El stock es demasiado alto.' };
    datos.stock = stock;
  }

  if (tiene('description')) {
    const description = String(entrada.description ?? '').trim();
    if (description.length > LARGO_MAXIMO_DESCRIPCION) {
      return { error: `La descripción no puede pasar de ${LARGO_MAXIMO_DESCRIPCION} caracteres.` };
    }
    datos.description = description;
  }

  if (tiene('image')) {
    const image = String(entrada.image ?? '').trim();
    if (image.length > 0) {
      let url;
      try {
        url = new URL(image);
      } catch {
        return { error: 'La dirección de la imagen no es una URL válida.' };
      }
      // Solo http/https: un javascript: o un data: en el src de una imagen
      // que se renderiza en la tienda es una vía de inyección.
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return { error: 'La imagen debe usar una dirección http o https.' };
      }
    }
    datos.image = image;
  }

  if (parcial && Object.keys(datos).length === 0) {
    return { error: 'No se envió ningún campo para modificar.' };
  }

  return { datos };
}
