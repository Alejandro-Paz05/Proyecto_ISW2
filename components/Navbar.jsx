import { useCart } from '@/context/CartContext';

export default function Navbar() {
  const { getCartCount, setCartOpen } = useCart();

  return (
    <header className="navbar">
      <div className="container nav-container">
        <a href="#inicio" className="logo">
          <span className="logo-icon">✦</span>
          <span className="logo-text">Akari <em>Studio</em></span>
        </a>
        <nav className="nav-links">
          <a href="#inicio">Inicio</a>
          <a href="#productos">Productos</a>
          <a href="#servicios">Servicios</a>
          <a href="#contacto">Contacto</a>
        </nav>
        <button className="cart-btn" onClick={() => setCartOpen(true)} aria-label="Abrir carrito">
          <span className="cart-icon">🛒</span>
          <span className="cart-count">{getCartCount()}</span>
        </button>
      </div>
    </header>
  );
}
