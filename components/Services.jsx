const services = [
  { icon: '💅', title: 'Uñas', desc: 'Manicure, pedicure, acrílicas, gel y nail art personalizado.' },
  { icon: '👁️', title: 'Pestañas', desc: 'Extensiones clásicas y volumen ruso para una mirada impactante.' },
  { icon: '✏️', title: 'Cejas', desc: 'Diseño, laminado y micropigmentación de cejas perfectas.' },
  { icon: '💄', title: 'Maquillaje', desc: 'Maquillaje profesional para eventos, bodas y ocasiones especiales.' }
];

export default function Services() {
  return (
    <section id="servicios" className="section">
      <div className="container">
        <p className="section-tag" data-revelar>Lo que ofrecemos</p>
        <h2 className="section-title" data-revelar>Nuestros Servicios</h2>
        <div className="services-grid">
          {services.map((s, i) => (
            // --i escalona la entrada: la fila se lee de izquierda a derecha
            // en vez de aparecer de golpe como un bloque.
            <div className="service-card" key={s.title} data-revelar style={{ '--i': i }}>
              <div className="service-icon">{s.icon}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
