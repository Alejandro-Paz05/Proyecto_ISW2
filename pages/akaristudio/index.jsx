import Link from 'next/link';
import TiendaLayout from '@/components/TiendaLayout';
import Hero from '@/components/Hero';
import Services from '@/components/Services';
import Contact from '@/components/Contact';
import { useRevelar } from '@/lib/use-revelar';
import { NEGOCIO, enlaceWhatsApp } from '@/lib/negocio';

export default function Inicio() {
  // Todo el contenido de la portada existe desde el primer render, así que
  // alcanza con escanear una vez.
  useRevelar('portada');

  return (
    <TiendaLayout>
      <Hero />
      <Services />

      {/* La tienda es una página propia y las citas se piden por chat, así
          que la portada tiene que llevar a las dos de forma evidente. */}
      <section className="section section-dark">
        <div className="container">
          <p className="section-tag" data-revelar>¿Qué querés hacer?</p>
          <h2 className="section-title" data-revelar>Empezá por acá</h2>

          <div className="atajos">
            <a
              className="atajo"
              href={enlaceWhatsApp(`¡Hola ${NEGOCIO.nombre}! Quiero agendar una cita.`)}
              target="_blank"
              rel="noreferrer"
              data-revelar
              style={{ '--i': 0 }}
            >
              <span className="atajo-icono">💬</span>
              <h3>Agendar una cita</h3>
              <p>
                Escribinos por WhatsApp y coordinamos el servicio, el día y la hora que mejor te
                queden.
              </p>
              <span className="atajo-accion">Escribir por WhatsApp →</span>
            </a>

            <Link
              href="/akaristudio/productos"
              className="atajo"
              data-revelar
              style={{ '--i': 1 }}
            >
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
