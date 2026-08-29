import { createContext, useContext, useState, useEffect, useMemo } from 'react';

const CatalogoContext = createContext(null);

/**
 * El catálogo de productos, cargado una sola vez para toda la tienda.
 *
 * Lo necesitan dos cosas a la vez: la página de productos, para mostrarlo, y
 * el carrito, que solo guarda ids y toma de aquí el precio y el stock reales.
 * Vive por encima de ambas para no pedirlo dos veces ni arriesgar que cada
 * una vea una versión distinta.
 */
export function CatalogoProvider({ children }) {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      try {
        const res = await fetch('/api/products');
        if (!res.ok) throw new Error('Error al cargar productos');
        const datos = await res.json();
        if (vigente) setProductos(datos);
      } catch (err) {
        if (vigente) setError(err.message);
      } finally {
        if (vigente) setCargando(false);
      }
    }

    cargar();
    // Si se cambia de página antes de que responda, no se toca el estado de
    // un componente que ya no está montado.
    return () => {
      vigente = false;
    };
  }, []);

  const valor = useMemo(
    () => ({ productos, cargando, error, listo: !cargando && !error }),
    [productos, cargando, error]
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
