import Link from 'next/link';

export default function Hero() {
  return (
    <section id="inicio" className="hero">
      <div className="hero-overlay"></div>
      <div className="container hero-content">
        <p className="hero-tag">Belleza &amp; Elegancia</p>
        <h1 className="hero-title">
          Realza tu belleza
          <br />
          con <span>Akari Studio</span>
        </h1>
        <p className="hero-sub">
          Uñas, pestañas, cejas y más. Productos profesionales para que luzcas espectacular, en el
          corazón de Honduras.
        </p>
        <div className="hero-actions">
          {/* La tienda es una página propia desde que se separaron las
              secciones: un ancla #productos ya no lleva a ningún lado. */}
          <Link href="/akaristudio/productos" className="btn btn-gold">
            Ver Productos
          </Link>
          <a href="#servicios" className="btn btn-outline">
            Nuestros Servicios
          </a>
        </div>
      </div>

      <a href="#servicios" className="hero-scroll" aria-label="Bajar a los servicios">
        <span className="hero-scroll-raton" aria-hidden="true"></span>
        <span>Descubrí</span>
      </a>
    </section>
  );
}
