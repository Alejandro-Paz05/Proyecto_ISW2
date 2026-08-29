import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCart } from '@/context/CartContext';

const ENLACES = [
  { href: '/akaristudio', label: 'Inicio' },
  { href: '/akaristudio#servicios', label: 'Servicios' },
  { href: '/akaristudio/citas', label: 'Citas' },
  { href: '/akaristudio/productos', label: 'Productos' },
  { href: '/akaristudio#contacto', label: 'Contacto' }
];

export default function Navbar() {
  const { getCartCount, setCartOpen } = useCart();
  const router = useRouter();

  return (
    <header className="navbar">
      <div className="container nav-container">
        <Link href="/akaristudio" className="logo">
          <span className="logo-icon">✦</span>
          <span className="logo-text">Akari <em>Studio</em></span>
        </Link>
        <nav className="nav-links">
          {ENLACES.map((enlace) => {
            // Solo se marca activa una sección que sea página propia: los
            // enlaces con ancla apuntan todos a la portada.
            const esPagina = !enlace.href.includes('#');
            const activo = esPagina && router.pathname === enlace.href;
            return (
              <Link
                key={enlace.href}
                href={enlace.href}
                className={activo ? 'activo' : undefined}
                aria-current={activo ? 'page' : undefined}
              >
                {enlace.label}
              </Link>
            );
          })}
        </nav>
        <button className="cart-btn" onClick={() => setCartOpen(true)} aria-label="Abrir carrito">
          <span className="cart-icon">🛒</span>
          <span className="cart-count">{getCartCount()}</span>
        </button>
      </div>
    </header>
  );
}
