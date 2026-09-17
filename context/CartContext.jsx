import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef
} from 'react';

const CartContext = createContext(null);
const STORAGE_KEY = 'akari_cart';

/**
 * El carrito persiste únicamente `{ id, qty }`.
 *
 * El nombre, el precio, la imagen y el stock se toman siempre del catálogo
 * recién traído de la base. Guardar el precio en localStorage significaba que
 * un cambio en Supabase dejaba al cliente viendo un importe y pagándole otro
 * al servidor, que calcula el total con los precios reales.
 */
/**
 * La identidad de una línea del carrito.
 *
 * Dejó de ser el producto y pasó a ser producto + color: "Balines plateado" y
 * "Balines dorado" son dos cosas distintas, con existencias distintas, y suman
 * por separado. Un producto sin colores usa la misma clave de siempre con el
 * color vacío.
 */
export function claveDeLinea(id, color = null) {
  return `${id}:${color ?? ''}`;
}

function readStoredItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Tolera los dos formatos anteriores: el que guardaba el producto entero y
    // el que guardaba { id, qty } sin color.
    return parsed
      .map((item) => ({
        id: Number(item?.id),
        qty: Number(item?.qty),
        color: Number.isInteger(Number(item?.color)) && Number(item?.color) > 0
          ? Number(item.color)
          : null
      }))
      .filter(
        (item) =>
          Number.isInteger(item.id) && Number.isInteger(item.qty) && item.qty > 0
      );
  } catch {
    return [];
  }
}

export function CartProvider({ children, products = [], productsLoaded = false }) {
  const [items, setItems] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // localStorage solo existe en el navegador, de ahí que la lectura viva en
  // un efecto y no en el useState inicial.
  useEffect(() => {
    setItems(readStoredItems());
    setHydrated(true);
  }, []);

  // Escribir antes de hidratar pisaría el carrito guardado con un array vacío.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Modo incógnito o almacenamiento lleno: el carrito sigue funcionando
      // en memoria durante la sesión.
    }
  }, [items, hydrated]);

  const productById = useMemo(() => {
    const map = new Map();
    for (const product of products) map.set(product.id, product);
    return map;
  }, [products]);

  /** El color elegido, tal como está hoy en el catálogo. */
  const colorDe = useCallback(
    (id, colorId) =>
      colorId ? productById.get(id)?.colores?.find((c) => c.id === colorId) ?? null : null,
    [productById]
  );

  /**
   * Las unidades disponibles de esa línea.
   *
   * Con color, las del color: el producto puede tener cincuenta en total y
   * ninguna del plateado, y lo que la clienta está comprando es el plateado.
   */
  const stockOf = useCallback(
    (id, colorId = null) => {
      const producto = productById.get(id);
      if (!producto) return 0;
      if (!colorId) return producto.stock ?? 0;
      return colorDe(id, colorId)?.stock ?? 0;
    },
    [productById, colorDe]
  );

  /** Un producto con colores obliga a elegir uno antes de comprar. */
  const exigeColor = useCallback(
    (id) => (productById.get(id)?.colores?.length ?? 0) > 0,
    [productById]
  );

  /**
   * Reconciliación contra el catálogo. Un carrito puede quedar guardado
   * durante días: en ese tiempo un producto puede agotarse, cambiar de precio
   * o desaparecer. Al cargar la página se descarta lo que ya no se puede
   * comprar y se recortan las cantidades que superan el stock disponible.
   */
  useEffect(() => {
    if (!hydrated || !productsLoaded) return;

    const next = [];
    let eliminados = 0;
    let recortados = 0;

    for (const item of items) {
      const stock = stockOf(item.id, item.color);

      // Se va si el producto desapareció, si se agotó, si el color que había
      // elegido ya no está en el catálogo, o si el producto pasó a venderse
      // por colores y esta línea es de antes, sin ninguno.
      const colorPerdido = item.color !== null && !colorDe(item.id, item.color);
      const faltaElegirColor = item.color === null && exigeColor(item.id);

      if (!productById.has(item.id) || stock <= 0 || colorPerdido || faltaElegirColor) {
        eliminados += 1;
        continue;
      }
      if (item.qty > stock) {
        next.push({ ...item, qty: stock });
        recortados += 1;
        continue;
      }
      next.push(item);
    }

    if (eliminados === 0 && recortados === 0) return;


    setItems(next);
    const avisos = [];
    if (eliminados > 0) {
      avisos.push(
        eliminados === 1
          ? 'Se quitó un producto agotado de tu carrito'
          : `Se quitaron ${eliminados} productos agotados de tu carrito`
      );
    }
    if (recortados > 0) {
      avisos.push('Ajustamos algunas cantidades al stock disponible');
    }
    showToast(`${avisos.join('. ')}.`);
  }, [
    hydrated,
    productsLoaded,
    items,
    productById,
    stockOf,
    colorDe,
    exigeColor,
    showToast
  ]);

  /** El carrito que ve la UI: cantidades propias, datos del catálogo. */
  const cart = useMemo(() => {
    if (!productsLoaded) return [];
    return items.flatMap((item) => {
      const product = productById.get(item.id);
      if (!product) return [];

      const color = colorDe(item.id, item.color);

      return [
        {
          // La clave, y no el id, es lo que identifica la línea en la lista:
          // el mismo producto en dos colores son dos filas.
          clave: claveDeLinea(item.id, item.color),
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          stock: stockOf(item.id, item.color),
          color,
          colorId: item.color,
          qty: item.qty
        }
      ];
    });
  }, [items, productById, productsLoaded, colorDe, stockOf]);

  /**
   * Agrega una unidad. `color` es el color elegido, o null para un producto
   * que no se vende por colores.
   */
  const addToCart = useCallback(
    (product, color = null) => {
      const colorId = color?.id ?? null;

      if (exigeColor(product.id) && !colorId) {
        showToast(`Elegí un color de ${product.name}.`);
        return;
      }

      const stock = stockOf(product.id, colorId);
      const clave = claveDeLinea(product.id, colorId);
      const enCarrito = items.find((item) => claveDeLinea(item.id, item.color) === clave)?.qty ?? 0;
      // El nombre con que se le habla a la clienta: "Balines" no le dice cuál
      // de los dos se agotó si tiene los dos en el carrito.
      const nombre = color ? `${product.name} en ${color.nombre}` : product.name;

      if (stock <= 0) {
        showToast(`${nombre} está agotado.`);
        return;
      }
      if (enCarrito >= stock) {
        showToast(`Ya tienes las ${stock} unidades disponibles de ${nombre}.`);
        return;
      }

      setItems((prev) =>
        prev.some((item) => claveDeLinea(item.id, item.color) === clave)
          ? prev.map((item) =>
              claveDeLinea(item.id, item.color) === clave ? { ...item, qty: item.qty + 1 } : item
            )
          : [...prev, { id: product.id, qty: 1, color: colorId }]
      );
      showToast(`${nombre} agregado al carrito ✨`);
    },
    [items, stockOf, exigeColor, showToast]
  );

  const removeFromCart = useCallback((clave) => {
    setItems((prev) => prev.filter((item) => claveDeLinea(item.id, item.color) !== clave));
  }, []);

  const changeQty = useCallback(
    (clave, delta) => {
      const item = items.find((linea) => claveDeLinea(linea.id, linea.color) === clave);
      if (!item) return;

      const stock = stockOf(item.id, item.color);
      const deseada = item.qty + delta;

      if (deseada > stock) {
        showToast(`Solo quedan ${stock} unidades disponibles.`);
        return;
      }
      if (deseada <= 0) {
        removeFromCart(clave);
        return;
      }

      setItems((prev) =>
        prev.map((linea) =>
          claveDeLinea(linea.id, linea.color) === clave ? { ...linea, qty: deseada } : linea
        )
      );
    },
    [items, stockOf, showToast, removeFromCart]
  );

  const clearCart = useCallback(() => setItems([]), []);

  const getCartTotal = useCallback(
    () => cart.reduce((sum, item) => sum + item.price * item.qty, 0),
    [cart]
  );

  // Se calcula sobre `items` y no sobre `cart` para que el contador del navbar
  // sea correcto aunque el catálogo todavía no haya cargado.
  const getCartCount = useCallback(
    () => items.reduce((sum, item) => sum + item.qty, 0),
    [items]
  );

  const value = useMemo(
    () => ({
      cart,
      cartReady: productsLoaded,
      addToCart,
      removeFromCart,
      changeQty,
      clearCart,
      getCartTotal,
      getCartCount,
      cartOpen,
      setCartOpen,
      checkoutOpen,
      setCheckoutOpen,
      confirmOpen,
      setConfirmOpen,
      lastOrder,
      setLastOrder,
      toast,
      showToast
    }),
    [
      cart,
      productsLoaded,
      addToCart,
      removeFromCart,
      changeQty,
      clearCart,
      getCartTotal,
      getCartCount,
      cartOpen,
      checkoutOpen,
      confirmOpen,
      lastOrder,
      toast,
      showToast
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart debe usarse dentro de un CartProvider.');
  }
  return context;
}
