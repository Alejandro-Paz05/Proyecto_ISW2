import Link from 'next/link';
import { NEGOCIO } from '@/lib/negocio';

const ENLACES = [
  { href: '/akaristudio', label: 'Inicio' },
  { href: '/akaristudio#servicios', label: 'Servicios' },
  { href: '/akaristudio/citas', label: 'Citas' },
  { href: '/akaristudio/productos', label: 'Productos' },
  { href: '/akaristudio#contacto', label: 'Contacto' }
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-container">
        <div className="footer-brand">
          <span className="logo-icon">✦</span>
          <span className="logo-text">Akari <em>Studio</em></span>
          <p>{NEGOCIO.descripcion}</p>
        </div>
        <div className="footer-links">
          <h4>Enlaces</h4>
          {ENLACES.map((enlace) => (
            <Link key={enlace.href} href={enlace.href}>
              {enlace.label}
            </Link>
          ))}
        </div>
        <div className="footer-contact">
          <h4>Contacto</h4>
          <p>{NEGOCIO.direccion}</p>
          <p>
            <a href={NEGOCIO.telefonoEnlace}>{NEGOCIO.telefono}</a>
          </p>
          <p>
            <a href={`mailto:${NEGOCIO.correo}`}>{NEGOCIO.correo}</a>
          </p>
        </div>
      </div>
      <div className="footer-bottom">
        <p>© 2026 Akari Studio. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
}
