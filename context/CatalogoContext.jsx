import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { CATEGORIAS, etiquetasDe } from '@/lib/categorias';

const CatalogoContext = createContext(null);

/**
 * El catálogo de productos y sus categorías, cargados una sola vez para toda
 * la tienda.
 *
 * Lo necesitan dos cosas a la vez: la página de productos, para mostrarlo, y
 * el carrito, que solo guarda ids y toma de aquí el precio y el stock reales.
 * Vive por encima de ambas para no pedirlo dos veces ni arriesgar que cada
 * una vea una versión distinta.
 */
export function CatalogoProvider({ children }) {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState(CATEGORIAS);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;

    async function pedirProductos() {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Error al cargar productos');
      return res.json();
    }

    // Las categorías no son críticas: si fallan, los filtros se dibujan con
    // el espejo de lib/categorias.js y la tienda funciona igual. Por eso
    // devuelve null en vez de propagar el error, y por eso no comparte el
    // try con los productos, donde un fallo sí tiene que verse en pantalla.
    async function pedirCategorias() {
      try {
        const res = await fetch('/api/categories');
        if (!res.ok) return null;
        const datos = await res.json();
        return Array.isArray(datos) && datos.length > 0 ? datos : null;
      } catch {
        return null;
      }
    }

    async function cargar() {
      // Se lanzan las dos juntas: la de categorías no debe retrasar la
      // primera pintada del catálogo, que es lo que el usuario espera ver.
      const categoriasPendientes = pedirCategorias();

      try {
        const datos = await pedirProductos();
        if (vigente) setProductos(datos);
      } catch (err) {
        if (vigente) setError(err.message);
      } finally {
        if (vigente) setCargando(false);
      }

      const datos = await categoriasPendientes;
      if (vigente && datos) setCategorias(datos);
    }

    cargar();
    // Si se cambia de página antes de que respondan, no se toca el estado de
    // un componente que ya no está montado.
    return () => {
      vigente = false;
    };
  }, []);

  const valor = useMemo(
    () => ({
      productos,
      categorias,
      etiquetas: etiquetasDe(categorias),
      cargando,
      error,
      listo: !cargando && !error
    }),
    [productos, categorias, cargando, error]
  );

  return <CatalogoContext.Provider value={valor}>{children}</CatalogoContext.Provider>;
}

export function useCatalogo() {
  const contexto = useContext(CatalogoContext);
  if (!contexto) {
    throw new Error('useCatalogo debe usarse dentro de un CatalogoProvider.');
  }
  return contexto;
}
