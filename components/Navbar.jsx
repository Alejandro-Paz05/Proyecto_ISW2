import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCart } from '@/context/CartContext';

const ENLACES = [
  { href: '/akaristudio', label: 'Inicio' },
  { href: '/akaristudio#servicios', label: 'Servicios' },
  { href: '/akaristudio/productos', label: 'Productos' },
  { href: '/akaristudio#contacto', label: 'Contacto' }
];

// Distancia a partir de la cual la barra deja de ser transparente. Coincide
// con el alto de la propia barra: antes de eso todavía se solapa con el hero.
const UMBRAL_SCROLL = 72;

export default function Navbar() {
  const { getCartCount, setCartOpen } = useCart();
  const router = useRouter();
  const [compacta, setCompacta] = useState(false);

  const cantidad = getCartCount();
  const [rebota, setRebota] = useState(false);
  const cantidadPrevia = useRef(cantidad);

  useEffect(() => {
    const alScrollear = () => setCompacta(window.scrollY > UMBRAL_SCROLL);

    alScrollear(); // Al volver de otra página el scroll puede no estar arriba.
    // passive avisa al navegador que no se va a llamar preventDefault, así no
    // tiene que esperar a este manejador para seguir desplazando la página.
    window.addEventListener('scroll', alScrollear, { passive: true });
    return () => window.removeEventListener('scroll', alScrollear);
  }, []);

  // El carrito está fuera de la vista cuando se agrega algo desde la tarjeta.
  // El rebote del número es lo único que confirma que la acción surtió efecto.
  useEffect(() => {
    if (cantidad <= cantidadPrevia.current) {
      cantidadPrevia.current = cantidad;
      return undefined;
    }

    cantidadPrevia.current = cantidad;
    setRebota(true);
    const temporizador = setTimeout(() => setRebota(false), 450);
    return () => clearTimeout(temporizador);
  }, [cantidad]);

  return (
    <header className={`navbar ${compacta ? 'compacta' : ''}`}>
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
          <span className={`cart-count ${rebota ? 'rebota' : ''}`}>{cantidad}</span>
        </button>
      </div>
    </header>
  );
}
