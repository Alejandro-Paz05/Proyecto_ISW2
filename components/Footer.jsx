export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-container">
        <div className="footer-brand">
          <span className="logo-icon">✦</span>
          <span className="logo-text">Akari <em>Studio</em></span>
          <p>Belleza y elegancia en el corazón de Honduras.</p>
        </div>
        <div className="footer-links">
          <h4>Enlaces</h4>
          <a href="#inicio">Inicio</a>
          <a href="#productos">Productos</a>
          <a href="#servicios">Servicios</a>
          <a href="#contacto">Contacto</a>
        </div>
        <div className="footer-contact">
          <h4>Contacto</h4>
          <p>Tegucigalpa, Honduras</p>
          <p>+504 9999-0000</p>
          <p>contacto@akaristudio.hn</p>
        </div>
      </div>
      <div className="footer-bottom">
        <p>© 2026 Akari Studio. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
}