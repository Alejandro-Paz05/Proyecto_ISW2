import { useState, useEffect, useCallback } from 'react';
import { diaLocalDe, DIAS_DE_ANTELACION } from '@/lib/agenda';

function formatPrice(amount) {
  return 'L ' + Number(amount).toFixed(2);
}

function formatDuracion(minutos) {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

function formatFechaLarga(dia) {
  // Se fija el mediodía para que el desfase horario no corra la fecha.
  return new Date(`${dia}T12:00:00`).toLocaleDateString('es-HN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

const MOTIVO_CERRADO = {
  cerrado: 'El salón no atiende ese día.',
  bloqueado: 'El salón no atiende ese día.',
  pasado: 'Esa fecha ya pasó.',
  'muy-lejos': `Solo se puede reservar con ${DIAS_DE_ANTELACION} días de anticipación.`
};

export default function Booking() {
  const hoy = diaLocalDe(new Date());
  const maximo = diaLocalDe(new Date(Date.now() + DIAS_DE_ANTELACION * 86400000));

  const [servicios, setServicios] = useState([]);
  const [servicio, setServicio] = useState(null);
  const [fecha, setFecha] = useState(hoy);
  const [disponibilidad, setDisponibilidad] = useState(null);
  const [cargandoFranjas, setCargandoFranjas] = useState(false);
  const [franja, setFranja] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [reserva, setReserva] = useState(null);

  useEffect(() => {
    fetch('/api/services')
      .then((res) => res.json())
      .then(setServicios)
      .catch(() => setError('No se pudieron cargar los servicios.'));
  }, []);

  const consultarDisponibilidad = useCallback(async () => {
    if (!servicio || !fecha) return;
    setCargandoFranjas(true);
    setFranja(null);
    try {
      const res = await fetch(`/api/availability?date=${fecha}&service=${servicio.id}`);
      if (!res.ok) throw new Error('No se pudo consultar la disponibilidad.');
      setDisponibilidad(await res.json());
      setError(null);
    } catch (err) {
      setError(err.message);
      setDisponibilidad(null);
    } finally {
      setCargandoFranjas(false);
    }
  }, [servicio, fecha]);

  useEffect(() => {
    consultarDisponibilidad();
  }, [consultarDisponibilidad]);

  async function reservar(evento) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: servicio.id,
          startsAt: franja.inicio,
          notes: form.notes,
          customer: { name: form.name, email: form.email, phone: form.phone }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo reservar la cita.');

      setReserva(data.appointment);
    } catch (err) {
      setError(err.message);
      // El horario pudo haberse ocupado mientras completaba el formulario:
      // se refresca la grilla para que vea el estado real.
      consultarDisponibilidad();
    } finally {
      setEnviando(false);
    }
  }

  function empezarDeNuevo() {
    setReserva(null);
    setServicio(null);
    setFranja(null);
    setForm({ name: '', email: '', phone: '', notes: '' });
  }

  if (reserva) {
    return (
      <section id="citas" className="section">
        <div className="container">
          <div className="cita-confirmada">
            <div className="confirm-icon">✅</div>
            <h2 className="section-title">¡Cita reservada!</h2>
            <p className="cita-confirmada-servicio">{reserva.service_name}</p>
            <p className="cita-confirmada-fecha">
              {formatFechaLarga(diaLocalDe(new Date(reserva.starts_at)))}
              {' a las '}
              {new Date(reserva.starts_at).toLocaleTimeString('es-HN', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
            <div className="confirm-details">
              <p>
                <strong>N° de cita:</strong> {reserva.reference}
              </p>
            </div>
            <p className="cita-confirmada-nota">
              Te contactaremos a <strong>{reserva.customer_email}</strong> para confirmar.
            </p>
            <button className="btn btn-outline" onClick={empezarDeNuevo}>
              Reservar otra cita
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="citas" className="section">
      <div className="container">
        <p className="section-tag">Agenda tu visita</p>
        <h2 className="section-title">Reservar una Cita</h2>
        <p className="section-sub">
          Elegí el servicio y el horario que te quede cómodo. Ves en el momento qué está libre.
        </p>

        {error && <p className="error-text">⚠️ {error}</p>}

        {/* Paso 1 */}
        <div className="cita-paso">
          <h3 className="cita-paso-titulo">
            <span className="cita-numero">1</span> Elegí el servicio
          </h3>
          <div className="servicios-grid">
            {servicios.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`servicio-card ${servicio?.id === s.id ? 'activo' : ''}`}
                aria-pressed={servicio?.id === s.id}
                onClick={() => setServicio(s)}
              >
                <span className="servicio-nombre">{s.name}</span>
                <span className="servicio-desc">{s.description}</span>
                <span className="servicio-meta">
                  <span>{formatDuracion(s.duration_minutes)}</span>
                  <span className="servicio-precio">{formatPrice(s.price)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Paso 2 */}
        {servicio && (
          <div className="cita-paso">
            <h3 className="cita-paso-titulo">
              <span className="cita-numero">2</span> Elegí el día y la hora
            </h3>

            <label className="cita-fecha">
              Fecha
              <input
                type="date"
                value={fecha}
                min={hoy}
                max={maximo}
                onChange={(e) => setFecha(e.target.value)}
              />
            </label>

            {cargandoFranjas && <p className="loading-text">Consultando disponibilidad...</p>}

            {!cargandoFranjas && disponibilidad && !disponibilidad.abierto && (
              <p className="empty-text">
                {disponibilidad.nota || MOTIVO_CERRADO[disponibilidad.motivo] || 'Sin atención ese día.'}
              </p>
            )}

            {!cargandoFranjas && disponibilidad?.abierto && (
              <>
                {disponibilidad.franjas.every((f) => !f.disponible) ? (
                  <p className="empty-text">
                    No queda ningún horario libre ese día para este servicio. Probá con otra fecha.
                  </p>
                ) : (
                  <>
                    <div className="franjas">
                      {disponibilidad.franjas.map((f) => (
                        <button
                          key={f.inicio}
                          type="button"
                          className={`franja ${franja?.inicio === f.inicio ? 'activa' : ''}`}
                          disabled={!f.disponible}
                          aria-pressed={franja?.inicio === f.inicio}
                          title={f.motivo === 'ocupado' ? 'Horario ya reservado' : undefined}
                          onClick={() => setFranja(f)}
                        >
                          {f.hora}
                        </button>
                      ))}
                    </div>
                    <p className="franjas-leyenda">
                      Los horarios en gris ya están reservados. El servicio dura{' '}
                      {formatDuracion(servicio.duration_minutes)}.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Paso 3 */}
        {servicio && franja && (
          <div className="cita-paso">
            <h3 className="cita-paso-titulo">
              <span className="cita-numero">3</span> Tus datos
            </h3>

            <div className="cita-resumen">
              <span>{servicio.name}</span>
              <span>
                {formatFechaLarga(fecha)} a las {franja.hora}
              </span>
              <span className="cita-resumen-precio">{formatPrice(servicio.price)}</span>
            </div>

            <form onSubmit={reservar}>
              <div className="form-group">
                <label htmlFor="cita-nombre">Nombre completo *</label>
                <input
                  id="cita-nombre"
                  type="text"
                  required
                  placeholder="Ej: María López"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="cita-email">Correo electrónico *</label>
                  <input
                    id="cita-email"
                    type="email"
                    required
                    placeholder="tucorreo@ejemplo.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="cita-tel">Número de celular *</label>
                  <input
                    id="cita-tel"
                    type="tel"
                    required
                    placeholder="+504 9999-0000"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="cita-notas">Comentario (opcional)</label>
                <textarea
                  id="cita-notas"
                  rows="2"
                  maxLength={500}
                  placeholder="Alguna preferencia o algo que debamos saber"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>

              <button type="submit" className="btn btn-gold btn-block" disabled={enviando}>
                {enviando ? 'Reservando...' : 'Confirmar Cita'}
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
