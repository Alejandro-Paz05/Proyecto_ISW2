import Link from 'next/link';
import TiendaLayout from '@/components/TiendaLayout';
import Hero from '@/components/Hero';
import Services from '@/components/Services';
import Contact from '@/components/Contact';

export default function Inicio() {
  return (
    <TiendaLayout>
      <Hero />
      <Services />

      {/* Las citas y los productos son páginas propias, así que la portada
          necesita llevar hasta ellas de forma evidente. */}
      <section className="section section-dark">
        <div className="container">
          <p className="section-tag">¿Qué querés hacer?</p>
          <h2 className="section-title">Empezá por acá</h2>

          <div className="atajos">
            <Link href="/akaristudio/citas" className="atajo">
              <span className="atajo-icono">💬</span>
              <h3>Solicitar una cita</h3>
              <p>
                Elegí el servicio y el día que te quede cómodo. Se envía por WhatsApp y te
                confirmamos por ahí mismo.
              </p>
              <span className="atajo-accion">Pedir por WhatsApp →</span>
            </Link>

            <Link href="/akaristudio/productos" className="atajo">
              <span className="atajo-icono">🛍️</span>
              <h3>Comprar productos</h3>
              <p>
                Productos profesionales para uñas, pestañas, cejas y maquillaje. Comprá sin crear
                cuenta.
              </p>
              <span className="atajo-accion">Ver la tienda →</span>
            </Link>
          </div>
        </div>
      </section>

      <Contact />
    </TiendaLayout>
  );
}
