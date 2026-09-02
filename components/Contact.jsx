import { NEGOCIO } from '@/lib/negocio';

export default function Contact() {
  return (
    <section id="contacto" className="section">
      <div className="container contact-container">
        <div className="contact-info">
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
        </div>
        <div className="contact-map">
          <div className="map-placeholder">
            <span>📍</span>
            <p>Mapa de ubicación</p>
            <small>
              {NEGOCIO.nombre} · {NEGOCIO.direccion}
            </small>
          </div>
        </div>
      </div>
    </section>
  );
}
