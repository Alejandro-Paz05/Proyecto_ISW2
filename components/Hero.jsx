export default function Hero() {
  return (
    <section id="inicio" className="hero">
      <div className="hero-overlay"></div>
      <div className="container hero-content">
        <p className="hero-tag">Belleza & Elegancia</p>
        <h1 className="hero-title">Realza tu belleza<br />con <span>Akari Studio</span></h1>
        <p className="hero-sub">
          Uñas, pestañas, cejas y más. Productos profesionales para que luzcas espectacular, en el corazón de Honduras.
        </p>
        <div className="hero-actions">
          <a href="#productos" className="btn btn-gold">Ver Productos</a>
          <a href="#servicios" className="btn btn-outline">Nuestros Servicios</a>
        </div>
      </div>
    </section>
  );
}
