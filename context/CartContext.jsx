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
function readStoredItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Tolera el formato anterior, que guardaba el producto entero.
    return parsed
      .map((item) => ({ id: Number(item?.id), qty: Number(item?.qty) }))
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

  const stockOf = useCallback(
    (id) => productById.get(id)?.stock ?? 0,
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
      const stock = stockOf(item.id);
      if (!productById.has(item.id) || stock <= 0) {
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
  }, [hydrated, productsLoaded, items, productById, stockOf, showToast]);

  /** El carrito que ve la UI: cantidades propias, datos del catálogo. */
  const cart = useMemo(() => {
    if (!productsLoaded) return [];
    return items.flatMap((item) => {
      const product = productById.get(item.id);
      if (!product) return [];
      return [
        {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          stock: product.stock,
          qty: item.qty
        }
      ];
    });
  }, [items, productById, productsLoaded]);

  const addToCart = useCallback(
    (product) => {
      const stock = stockOf(product.id);
      const enCarrito = items.find((item) => item.id === product.id)?.qty ?? 0;

      if (stock <= 0) {
        showToast(`${product.name} está agotado.`);
        return;
      }
      if (enCarrito >= stock) {
        showToast(
          `Ya tienes las ${stock} unidades disponibles de ${product.name}.`
        );
        return;
      }

      setItems((prev) =>
        prev.some((item) => item.id === product.id)
          ? prev.map((item) =>
              item.id === product.id ? { ...item, qty: item.qty + 1 } : item
            )
          : [...prev, { id: product.id, qty: 1 }]
      );
      showToast(`${product.name} agregado al carrito ✨`);
    },
    [items, stockOf, showToast]
  );

  const removeFromCart = useCallback((id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const changeQty = useCallback(
    (id, delta) => {
      const stock = stockOf(id);
      const actual = items.find((item) => item.id === id)?.qty ?? 0;
      const deseada = actual + delta;

      if (deseada > stock) {
        showToast(`Solo quedan ${stock} unidades disponibles.`);
        return;
      }
      if (deseada <= 0) {
        removeFromCart(id);
        return;
      }

      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, qty: deseada } : item))
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
