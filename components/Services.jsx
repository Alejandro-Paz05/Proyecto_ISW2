import { IconoUnas, IconoPestanas, IconoCejas, IconoMaquillaje } from '@/components/Iconos';

const services = [
  {
    Icono: IconoUnas,
    title: 'Uñas',
    desc: 'Manicure, pedicure, acrílicas, gel y nail art personalizado.'
  },
  {
    Icono: IconoPestanas,
    title: 'Pestañas',
    desc: 'Extensiones clásicas y volumen ruso para una mirada impactante.'
  },
  {
    Icono: IconoCejas,
    title: 'Cejas',
    desc: 'Diseño, laminado y micropigmentación de cejas perfectas.'
  },
  {
    Icono: IconoMaquillaje,
    title: 'Maquillaje',
    desc: 'Maquillaje profesional para eventos, bodas y ocasiones especiales.'
  }
];

export default function Services() {
  return (
    <section id="servicios" className="section">
      <div className="container">
        <p className="section-tag" data-revelar>Lo que ofrecemos</p>
        <h2 className="section-title" data-revelar>Nuestros Servicios</h2>
        <div className="services-grid">
          {services.map(({ Icono, title, desc }, i) => (
            // --i escalona la entrada: la fila se lee de izquierda a derecha
            // en vez de aparecer de golpe como un bloque.
            <div className="service-card" key={title} data-revelar style={{ '--i': i }}>
              <div className="service-icon">
                <Icono tamano={30} />
              </div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
