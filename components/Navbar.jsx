import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCart } from '@/context/CartContext';
import { useSesionAbierta } from '@/lib/use-sesion';
import { useCerrarConEscape } from '@/lib/use-escape';

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
  const [menuAbierto, setMenuAbierto] = useState(false);
  const sesionAbierta = useSesionAbierta();

  const cerrarMenu = useCallback(() => setMenuAbierto(false), []);
  useCerrarConEscape(menuAbierto, cerrarMenu);

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
    <header className={`navbar ${compacta ? 'compacta' : ''} ${menuAbierto ? 'con-menu' : ''}`}>
      <div className="container nav-container">
        <Link href="/akaristudio" className="logo">
          <span className="logo-icon">✦</span>
          <span className="logo-text">Akari <em>Studio</em></span>
        </Link>
        <nav id="menu-principal" className={`nav-links ${menuAbierto ? 'abierto' : ''}`}>
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
                // Un enlace con ancla a la misma página no cambia de ruta, así
                // que esperar al router dejaría el menú abierto tapando justo
                // la sección a la que se acaba de ir.
                onClick={cerrarMenu}
              >
                {enlace.label}
              </Link>
            );
          })}
        </nav>
        <div className="nav-acciones">
          {/* Fuera de .nav-links a propósito: esa lista se esconde en el
              teléfono, y entrar a la cuenta tiene que poder hacerse ahí. */}
          <Link
            href={sesionAbierta ? '/akaristudio/cuenta' : '/akaristudio/admin/login'}
            className="nav-cuenta"
          >
            {sesionAbierta ? 'Mi cuenta' : 'Ingresar'}
          </Link>

          <button className="cart-btn" onClick={() => setCartOpen(true)} aria-label="Abrir carrito">
            <span className="cart-icon">🛒</span>
            <span className={`cart-count ${rebota ? 'rebota' : ''}`}>{cantidad}</span>
          </button>

          {/* Solo se ve en el teléfono, que es donde .nav-links se esconde.
              Hasta acá la barra en móvil tenía el logo y el carrito, y a
              Servicios, Productos y Contacto no se llegaba por ningún lado. */}
          <button
            type="button"
            className={`nav-menu-btn ${menuAbierto ? 'abierto' : ''}`}
            onClick={() => setMenuAbierto((abierto) => !abierto)}
            aria-expanded={menuAbierto}
            aria-controls="menu-principal"
            aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
          >
            <span className="nav-menu-barra" />
            <span className="nav-menu-barra" />
            <span className="nav-menu-barra" />
          </button>
        </div>
      </div>
    </header>
  );
}
