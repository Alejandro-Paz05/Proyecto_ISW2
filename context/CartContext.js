import { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [toast, setToast] = useState(null);

  // Cargar carrito desde localStorage al iniciar
  useEffect(() => {
    const saved = localStorage.getItem('akari_cart');
    if (saved) {
      try {
        setCart(JSON.parse(saved));
      } catch {
        setCart([]);
      }
    }
  }, []);

  // Guardar carrito en localStorage
  useEffect(() => {
    localStorage.setItem('akari_cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
    showToast(`${product.name} agregado al carrito ✨`);
  };

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const changeQty = (id, delta) => {
    setCart(prev => {
      return prev
        .map(item => item.id === id ? { ...item, qty: item.qty + delta } : item)
        .filter(item => item.qty > 0);
    });
  };

  const clearCart = () => setCart([]);

  const getCartTotal = () => {
    return cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  };

  const getCartCount = () => {
    return cart.reduce((sum, item) => sum + item.qty, 0);
  };

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  };

  const value = {
    cart,
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
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
