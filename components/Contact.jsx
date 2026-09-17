import { NEGOCIO } from '@/lib/negocio';
import {
  IconoUbicacion,
  IconoTelefono,
  IconoCorreo,
  IconoReloj,
  IconoInstagram
} from '@/components/Iconos';

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
          <p className="contacto-dato">
            <IconoUbicacion tamano={18} />
            <span>
              <strong>Dirección:</strong> {NEGOCIO.direccion}
            </span>
          </p>
          <p className="contacto-dato">
            <IconoTelefono tamano={18} />
            <span>
              <strong>Teléfono:</strong> <a href={NEGOCIO.telefonoEnlace}>{NEGOCIO.telefono}</a>
            </span>
          </p>
          <p className="contacto-dato">
            <IconoCorreo tamano={18} />
            <span>
              <strong>Email:</strong>{' '}
              <a href={`mailto:${NEGOCIO.correo}`}>{NEGOCIO.correo}</a>
            </span>
          </p>
          <p className="contacto-dato">
            <IconoReloj tamano={18} />
            <span>
              <strong>Horario:</strong> {NEGOCIO.horario}
            </span>
          </p>
          <p className="contacto-dato">
            <IconoInstagram tamano={18} />
            <span>
              <strong>Instagram:</strong>{' '}
              <a href={NEGOCIO.instagramUrl} target="_blank" rel="noreferrer">
                @{NEGOCIO.instagram}
              </a>
            </span>
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
            <IconoUbicacion tamano={44} />
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
