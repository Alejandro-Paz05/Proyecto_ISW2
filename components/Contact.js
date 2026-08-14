export default function Contact() {
  return (
    <section id="contacto" className="section">
      <div className="container contact-container">
        <div className="contact-info">
          <p className="section-tag">Visítanos</p>
          <h2 className="section-title">Contacto</h2>
          <p><strong>📍 Dirección:</strong> Tegucigalpa, Honduras</p>
          <p><strong>📞 Teléfono:</strong> +504 9999-0000</p>
          <p><strong>✉️ Email:</strong> contacto@akaristudio.hn</p>
          <p><strong>🕐 Horario:</strong> Lun - Sáb: 9:00 AM - 7:00 PM</p>
        </div>
        <div className="contact-map">
          <div className="map-placeholder">
            <span>📍</span>
            <p>Mapa de ubicación</p>
            <small>Akari Studio · Honduras</small>
          </div>
        </div>
      </div>
    </section>
  );
}