import { useState, useEffect, useMemo, useCallback } from 'react';
import { diaLocalDe, DIAS_DE_ANTELACION } from '@/lib/agenda';
import { ETIQUETAS_SERVICIO } from '@/lib/categorias';

const PASOS = [
  { key: 'servicios', label: 'Servicios' },
  { key: 'hora', label: 'Hora' },
  { key: 'confirmar', label: 'Confirmar' }
];

const MAXIMO_PERSONAS = 6;
const DIAS_VISIBLES = 7;

function formatPrice(amount) {
  return 'L ' + Number(amount).toFixed(2);
}

function formatDuracion(minutos) {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

function sumarDias(dia, cantidad) {
  const base = new Date(`${dia}T12:00:00-06:00`);
  return diaLocalDe(new Date(base.getTime() + cantidad * 86400000));
}

function partesFecha(dia) {
  const fecha = new Date(`${dia}T12:00:00-06:00`);
  return {
    diaSemana: fecha.toLocaleDateString('es-HN', { weekday: 'short' }).replace('.', ''),
    numero: fecha.toLocaleDateString('es-HN', { day: 'numeric' }),
    mes: fecha.toLocaleDateString('es-HN', { month: 'short' }).replace('.', '')
  };
}

function formatFechaLarga(dia) {
  return new Date(`${dia}T12:00:00-06:00`).toLocaleDateString('es-HN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

const MOTIVO_CERRADO = {
  cerrado: 'El salón no atiende este día.',
  bloqueado: 'El salón no atiende este día.',
  pasado: 'Esta fecha ya pasó.',
  'muy-lejos': `Solo se puede reservar con ${DIAS_DE_ANTELACION} días de anticipación.`
};

export default function Booking() {
  const hoy = diaLocalDe(new Date());

  const [paso, setPaso] = useState('servicios');
  const [servicios, setServicios] = useState([]);
  const [categoria, setCategoria] = useState('todos');
  const [elegidos, setElegidos] = useState([]);
  const [personas, setPersonas] = useState(1);
  const [primerDia, setPrimerDia] = useState(hoy);
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

  const categorias = useMemo(() => {
    const presentes = [...new Set(servicios.map((s) => s.category))];
    return ['todos', ...presentes];
  }, [servicios]);

  const visibles = useMemo(
    () => (categoria === 'todos' ? servicios : servicios.filter((s) => s.category === categoria)),
    [servicios, categoria]
  );

  const seleccionados = useMemo(
    () => elegidos.map((id) => servicios.find((s) => s.id === id)).filter(Boolean),
    [elegidos, servicios]
  );

  const duracionTotal =
    seleccionados.reduce((suma, s) => suma + s.duration_minutes, 0) * personas;
  const precioTotal = seleccionados.reduce((suma, s) => suma + Number(s.price), 0) * personas;

  function alternar(servicio) {
    setElegidos((prev) =>
      prev.includes(servicio.id)
        ? prev.filter((id) => id !== servicio.id)
        : [...prev, servicio.id]
    );
    // Cambiar los servicios cambia la duración, así que la franja elegida
    // deja de ser válida.
    setFranja(null);
  }

  const consultar = useCallback(async () => {
    if (elegidos.length === 0 || paso !== 'hora') return;
    setCargandoFranjas(true);
    setFranja(null);
    try {
      const params = new URLSearchParams({
        date: fecha,
        services: elegidos.join(','),
        people: String(personas)
      });
      const res = await fetch(`/api/availability?${params}`);
      if (!res.ok) throw new Error('No se pudo consultar la disponibilidad.');
      setDisponibilidad(await res.json());
      setError(null);
    } catch (err) {
      setError(err.message);
      setDisponibilidad(null);
    } finally {
      setCargandoFranjas(false);
    }
  }, [elegidos, personas, fecha, paso]);

  useEffect(() => {
    consultar();
  }, [consultar]);

  async function reservar(evento) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceIds: elegidos,
          people: personas,
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
      // Puede que alguien haya tomado ese horario mientras completaba el
      // formulario: se vuelve al paso de la hora con la grilla actualizada.
      setPaso('hora');
    } finally {
      setEnviando(false);
    }
  }

  function empezarDeNuevo() {
    setReserva(null);
    setPaso('servicios');
    setElegidos([]);
    setPersonas(1);
    setFranja(null);
    setFecha(hoy);
    setPrimerDia(hoy);
    setForm({ name: '', email: '', phone: '', notes: '' });
  }

  // ===== Confirmación =====
  if (reserva) {
    return (
      <section id="citas" className="section">
        <div className="container">
          <div className="cita-confirmada">
            <div className="confirm-icon">✅</div>
            <h2 className="section-title">¡Cita reservada!</h2>
            <p className="cita-confirmada-servicio">{reserva.services}</p>
            <p className="cita-confirmada-fecha">
              {formatFechaLarga(diaLocalDe(new Date(reserva.starts_at)))} a las{' '}
              {new Date(reserva.starts_at).toLocaleTimeString('es-HN', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
            <div className="confirm-details">
              <p>
                <strong>N° de cita:</strong> {reserva.reference}
              </p>
              <p>
                <strong>Duración:</strong> {formatDuracion(reserva.duration_minutes)}
                {reserva.people > 1 && ` · ${reserva.people} personas`}
              </p>
              <p>
                <strong>Total:</strong> {formatPrice(reserva.total)}
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

  const diasTira = Array.from({ length: DIAS_VISIBLES }, (_, i) => sumarDias(primerDia, i));
  const puedeRetroceder = primerDia > hoy;

  return (
    <section id="citas" className="section">
      <div className="container">
        <p className="section-tag">Agenda tu visita</p>
        <h2 className="section-title">Reservar una Cita</h2>

        <nav className="reserva-pasos" aria-label="Progreso de la reserva">
          {PASOS.map((p, i) => {
            const indiceActual = PASOS.findIndex((x) => x.key === paso);
            const estado = i < indiceActual ? 'hecho' : i === indiceActual ? 'actual' : 'pendiente';
            return (
              <span key={p.key} className={`reserva-paso ${estado}`}>
                {i > 0 && <span className="reserva-flecha">›</span>}
                {estado === 'hecho' ? (
                  <button type="button" onClick={() => setPaso(p.key)}>
                    {p.label}
                  </button>
                ) : (
                  <span>{p.label}</span>
                )}
              </span>
            );
          })}
        </nav>

        {error && <p className="error-text">⚠️ {error}</p>}

        <div className="reserva">
          <div className="reserva-principal">
            {/* ===== Paso 1: servicios ===== */}
            {paso === 'servicios' && (
              <>
                <h3 className="reserva-titulo">Seleccionar servicios</h3>

                <div className="reserva-chips">
                  {categorias.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`reserva-chip ${categoria === c ? 'activo' : ''}`}
                      aria-pressed={categoria === c}
                      onClick={() => setCategoria(c)}
                    >
                      {c === 'todos' ? 'Todos' : ETIQUETAS_SERVICIO[c] ?? c}
                    </button>
                  ))}
                </div>

                <ul className="reserva-servicios">
                  {visibles.map((s) => {
                    const elegido = elegidos.includes(s.id);
                    return (
                      <li key={s.id} className={`reserva-servicio ${elegido ? 'elegido' : ''}`}>
                        <div className="reserva-servicio-datos">
                          <h4>{s.name}</h4>
                          <p className="reserva-servicio-duracion">
                            {formatDuracion(s.duration_minutes)}
                          </p>
                          {s.description && (
                            <p className="reserva-servicio-desc">{s.description}</p>
                          )}
                          <p className="reserva-servicio-precio">{formatPrice(s.price)}</p>
                        </div>
                        <button
                          type="button"
                          className={`reserva-mas ${elegido ? 'quitar' : ''}`}
                          onClick={() => alternar(s)}
                          aria-pressed={elegido}
                          aria-label={`${elegido ? 'Quitar' : 'Agregar'} ${s.name}`}
                        >
                          {elegido ? '−' : '+'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {/* ===== Paso 2: fecha y hora ===== */}
            {paso === 'hora' && (
              <>
                <h3 className="reserva-titulo">Seleccionar fecha y hora</h3>

                <div className="tira-fechas-cabecera">
                  <span>Elegí una fecha</span>
                  <div className="tira-fechas-flechas">
                    <button
                      type="button"
                      onClick={() => setPrimerDia(sumarDias(primerDia, -DIAS_VISIBLES))}
                      disabled={!puedeRetroceder}
                      aria-label="Semana anterior"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrimerDia(sumarDias(primerDia, DIAS_VISIBLES))}
                      aria-label="Semana siguiente"
                    >
                      ›
                    </button>
                  </div>
                </div>

                <div className="tira-fechas">
                  {diasTira.map((dia) => {
                    const { diaSemana, numero, mes } = partesFecha(dia);
                    return (
                      <button
                        key={dia}
                        type="button"
                        className={`tira-fecha ${fecha === dia ? 'activa' : ''}`}
                        aria-pressed={fecha === dia}
                        onClick={() => setFecha(dia)}
                      >
                        <span className="tira-fecha-dia">{diaSemana}</span>
                        <span className="tira-fecha-numero">{numero}</span>
                        <span className="tira-fecha-mes">{mes}</span>
                      </button>
                    );
                  })}
                </div>

                <h4 className="reserva-subtitulo">Escogé una hora</h4>

                {cargandoFranjas && <p className="loading-text">Consultando disponibilidad...</p>}

                {!cargandoFranjas && disponibilidad && !disponibilidad.abierto && (
                  <p className="empty-text">
                    {disponibilidad.nota ||
                      MOTIVO_CERRADO[disponibilidad.motivo] ||
                      'Sin atención este día.'}
                  </p>
                )}

                {!cargandoFranjas && disponibilidad?.abierto && (
                  <>
                    {disponibilidad.franjas.filter((f) => f.disponible).length === 0 ? (
                      <p className="empty-text">
                        No queda ningún horario libre este día para lo que elegiste. Probá con otra
                        fecha.
                      </p>
                    ) : (
                      <ul className="lista-horas">
                        {disponibilidad.franjas
                          .filter((f) => f.disponible)
                          .map((f) => (
                            <li key={f.inicio}>
                              <button
                                type="button"
                                className={`hora ${franja?.inicio === f.inicio ? 'activa' : ''}`}
                                aria-pressed={franja?.inicio === f.inicio}
                                onClick={() => setFranja(f)}
                              >
                                {f.hora}
                              </button>
                            </li>
                          ))}
                      </ul>
                    )}
                  </>
                )}
              </>
            )}

            {/* ===== Paso 3: datos ===== */}
            {paso === 'confirmar' && (
              <>
                <h3 className="reserva-titulo">Tus datos</h3>
                <form onSubmit={reservar} id="form-cita">
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
                </form>
              </>
            )}
          </div>

          {/* ===== Resumen ===== */}
          <aside className="reserva-resumen">
            <div className="reserva-resumen-caja">
              <div className="reserva-resumen-marca">
                <span className="logo-icon">✦</span>
                <div>
                  <strong>Akari Studio</strong>
                  <span>Tegucigalpa, Honduras</span>
                </div>
              </div>

              {seleccionados.length === 0 ? (
                <p className="reserva-resumen-vacio">No hay servicios seleccionados</p>
              ) : (
                <ul className="reserva-resumen-lista">
                  {seleccionados.map((s) => (
                    <li key={s.id}>
                      <div>
                        <span>{s.name}</span>
                        <small>{formatDuracion(s.duration_minutes)}</small>
                      </div>
                      <span className="reserva-resumen-precio">{formatPrice(s.price)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {seleccionados.length > 0 && (
                <div className="reserva-personas">
                  <label htmlFor="cita-personas">¿Para cuántas personas?</label>
                  <select
                    id="cita-personas"
                    value={personas}
                    onChange={(e) => {
                      setPersonas(Number(e.target.value));
                      setFranja(null);
                    }}
                  >
                    {Array.from({ length: MAXIMO_PERSONAS }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? '1 persona' : `${n} personas`}
                      </option>
                    ))}
                  </select>
                  {personas > 1 && (
                    <small>Se atienden una después de otra, por eso la cita dura más.</small>
                  )}
                </div>
              )}

              {franja && (
                <p className="reserva-resumen-cuando">
                  {formatFechaLarga(fecha)} a las {franja.hora}
                </p>
              )}

              <div className="reserva-resumen-total">
                <span>Total</span>
                <span>
                  {seleccionados.length === 0 ? 'gratis' : formatPrice(precioTotal)}
                </span>
              </div>

              {duracionTotal > 0 && (
                <p className="reserva-resumen-duracion">
                  Duración estimada: {formatDuracion(duracionTotal)}
                </p>
              )}

              {paso === 'servicios' && (
                <button
                  type="button"
                  className="btn btn-gold btn-block"
                  disabled={seleccionados.length === 0}
                  onClick={() => setPaso('hora')}
                >
                  Continuar →
                </button>
              )}

              {paso === 'hora' && (
                <button
                  type="button"
                  className="btn btn-gold btn-block"
                  disabled={!franja}
                  onClick={() => setPaso('confirmar')}
                >
                  Continuar →
                </button>
              )}

              {paso === 'confirmar' && (
                <button
                  type="submit"
                  form="form-cita"
                  className="btn btn-gold btn-block"
                  disabled={enviando}
                >
                  {enviando ? 'Reservando...' : 'Confirmar cita'}
                </button>
              )}

              {paso !== 'servicios' && (
                <button
                  type="button"
                  className="reserva-volver"
                  onClick={() => setPaso(paso === 'confirmar' ? 'hora' : 'servicios')}
                >
                  ← Volver
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
