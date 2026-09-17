/**
 * Valida la lista de colores de un producto.
 *
 * La base ya tiene las mismas reglas —CHECK de largo, de formato del hex y de
 * stock no negativo—, pero un error de la base llega como un violation code
 * que no le dice nada a quien lo lee. Acá se traduce a una frase en español
 * antes de intentar escribir.
 */

const LARGO_MAXIMO = 40;
const MAXIMO_DE_COLORES = 40;
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * @returns {{ colores: Array } | { error: string }}
 */
export function validarColores(crudos) {
  if (!Array.isArray(crudos)) {
    return { error: 'Los colores tienen que venir en una lista.' };
  }

  if (crudos.length > MAXIMO_DE_COLORES) {
    return { error: `Un producto no puede tener más de ${MAXIMO_DE_COLORES} colores.` };
  }

  const colores = [];
  const vistos = new Set();

  for (const [i, crudo] of crudos.entries()) {
    const nombre = String(crudo?.nombre ?? '').trim();

    if (nombre.length === 0) {
      return { error: 'Cada color necesita un nombre.' };
    }
    if (nombre.length > LARGO_MAXIMO) {
      return { error: `El nombre "${nombre}" pasa de ${LARGO_MAXIMO} caracteres.` };
    }

    // La comparación ignora mayúsculas: "Rojo" y "rojo" serían dos muestras
    // idénticas en la tienda, y la clienta no sabría cuál elegir.
    const clave = nombre.toLowerCase();
    if (vistos.has(clave)) {
      return { error: `"${nombre}" está repetido.` };
    }
    vistos.add(clave);

    const stock = Number(crudo?.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      return { error: `El stock de "${nombre}" tiene que ser un número entero de 0 en adelante.` };
    }

    const hex = crudo?.hex ? String(crudo.hex).trim() : null;
    if (hex && !HEX.test(hex)) {
      return { error: `El color de la muestra de "${nombre}" tiene que ser como #RRGGBB.` };
    }

    const id = Number(crudo?.id);

    colores.push({
      // Los que ya existen conservan su id: así una venta vieja sigue
      // apuntando a su color en vez de quedar huérfana.
      ...(Number.isInteger(id) && id > 0 ? { id } : {}),
      nombre,
      hex,
      stock,
      position: i
    });
  }

  return { colores };
}
