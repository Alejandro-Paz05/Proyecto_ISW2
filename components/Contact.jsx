import { NEGOCIO } from '@/lib/negocio';

const MAPA = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${NEGOCIO.nombre}, ${NEGOCIO.direccion}, Honduras`
)}`;

export default function Contact() {
  return (
    <section id="contacto" className="section">
      <div className="container contact-container">
        <div className="contact-info" data-revelar="izquierda">
          <p className="section-tag">Visítanos</p>
          <h2 className="section-title">Contacto</h2>
          <p>
            <strong>📍 Dirección:</strong> {NEGOCIO.direccion}
          </p>
          <p>
            <strong>📞 Teléfono:</strong>{' '}
            <a href={NEGOCIO.telefonoEnlace}>{NEGOCIO.telefono}</a>
          </p>
          <p>
            <strong>✉️ Email:</strong>{' '}
            <a href={`mailto:${NEGOCIO.correo}`}>{NEGOCIO.correo}</a>
          </p>
          <p>
            <strong>🕐 Horario:</strong> {NEGOCIO.horario}
          </p>
          <p>
            <strong>📷 Instagram:</strong>{' '}
            <a href={NEGOCIO.instagramUrl} target="_blank" rel="noreferrer">
              @{NEGOCIO.instagram}
            </a>
          </p>
        </div>
        <div className="contact-map" data-revelar="derecha">
          {/* Un enlace y no un mapa incrustado: el iframe de Google carga
              cientos de kilobytes y rastrea a quien visita, para mostrar algo
              que se mira una vez y se abre igual en la app del teléfono. */}
          <a
            className="map-placeholder"
            href={MAPA}
            target="_blank"
            rel="noreferrer"
            aria-label={`Ver la ubicación de ${NEGOCIO.nombre} en Google Maps`}
          >
            <span>📍</span>
            <p>Ver cómo llegar</p>
            <small>
              {NEGOCIO.nombre} · {NEGOCIO.direccion}
            </small>
          </a>
        </div>
      </div>
    </section>
  );
}
