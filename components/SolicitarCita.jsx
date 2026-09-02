import { useState, useMemo } from 'react';
import { NEGOCIO, enlaceWhatsApp } from '@/lib/negocio';
import { SERVICIOS, FRANJAS_PREFERIDAS } from '@/lib/servicios';
import { ETIQUETAS_SERVICIO } from '@/lib/categorias';
import { diaLocalDe, formatFechaLarga } from '@/lib/fechas';

function formatPrecio(monto) {
  return 'L ' + Number(monto).toFixed(2);
}

export default function SolicitarCita() {
  const hoy = diaLocalDe(new Date());

  const [categoria, setCategoria] = useState('todos');
  const [elegidos, setElegidos] = useState([]);
  const [fecha, setFecha] = useState('');
  const [franja, setFranja] = useState('cualquiera');
  const [nombre, setNombre] = useState('');
  const [comentario, setComentario] = useState('');

  const categorias = useMemo(
    () => ['todos', ...new Set(SERVICIOS.map((s) => s.categoria))],
    []
  );

  const visibles =
    categoria === 'todos' ? SERVICIOS : SERVICIOS.filter((s) => s.categoria === categoria);

  const seleccionados = elegidos
    .map((id) => SERVICIOS.find((s) => s.id === id))
    .filter(Boolean);

  const total = seleccionados.reduce((suma, s) => suma + s.precio, 0);

  function alternar(servicio) {
    setElegidos((prev) =>
      prev.includes(servicio.id)
        ? prev.filter((id) => id !== servicio.id)
        : [...prev, servicio.id]
    );
  }

  /**
   * Arma el mensaje que la clienta va a enviar. La idea es que la dueña
   * reciba de una vez todo lo que si no tendría que preguntar por chat:
   * qué servicio, qué día y en qué horario.
   */
  const mensaje = useMemo(() => {
    const lineas = [`¡Hola ${NEGOCIO.nombre}! Quiero solicitar una cita.`, ''];

    if (seleccionados.length > 0) {
      lineas.push(seleccionados.length === 1 ? 'Servicio:' : 'Servicios:');
      for (const s of seleccionados) {
        lineas.push(`• ${s.nombre} (${s.duracion} · ${formatPrecio(s.precio)})`);
      }
      if (seleccionados.length > 1) {
        lineas.push(`Total aproximado: ${formatPrecio(total)}`);
      }
      lineas.push('');
    }

    if (fecha) lineas.push(`Día preferido: ${formatFechaLarga(fecha)}`);

    const franjaElegida = FRANJAS_PREFERIDAS.find((f) => f.id === franja);
    if (franjaElegida && franja !== 'cualquiera') {
      lineas.push(`Horario preferido: ${franjaElegida.etiqueta} (${franjaElegida.detalle})`);
    }

    if (nombre.trim()) lineas.push(`Mi nombre: ${nombre.trim()}`);
    if (comentario.trim()) {
      lineas.push('');
      lineas.push(comentario.trim());
    }

    return lineas.join('\n');
  }, [seleccionados, total, fecha, franja, nombre, comentario]);

  const listo = seleccionados.length > 0 && nombre.trim().length > 0;

  return (
    <section id="citas" className="section">
      <div className="container">
        <p className="section-tag">Agendá tu visita</p>
        <h2 className="section-title">Solicitar una Cita</h2>
        <p className="section-sub">
          Armá tu solicitud acá y la enviás por WhatsApp con un toque. Te confirmamos el horario
          por ese mismo chat.
        </p>

        <div className="solicitud">
          <div className="solicitud-principal">
            <h3 className="solicitud-paso">
              <span className="cita-numero">1</span> ¿Qué te querés hacer?
            </h3>

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
                      <h4>{s.nombre}</h4>
                      <p className="reserva-servicio-duracion">{s.duracion}</p>
                      <p className="reserva-servicio-desc">{s.descripcion}</p>
                      <p className="reserva-servicio-precio">{formatPrecio(s.precio)}</p>
                    </div>
                    <button
                      type="button"
                      className={`reserva-mas ${elegido ? 'quitar' : ''}`}
                      onClick={() => alternar(s)}
                      aria-pressed={elegido}
                      aria-label={`${elegido ? 'Quitar' : 'Agregar'} ${s.nombre}`}
                    >
                      {elegido ? '−' : '+'}
                    </button>
                  </li>
                );
              })}
            </ul>

            <h3 className="solicitud-paso">
              <span className="cita-numero">2</span> ¿Cuándo te queda cómodo?
            </h3>

            <div className="solicitud-cuando">
              <label>
                Día preferido
                <input
                  type="date"
                  value={fecha}
                  min={hoy}
                  onChange={(e) => setFecha(e.target.value)}
                />
              </label>

              <label>
                Horario preferido
                <select value={franja} onChange={(e) => setFranja(e.target.value)}>
                  {FRANJAS_PREFERIDAS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.etiqueta} — {f.detalle}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="solicitud-aclaracion">
              El día y el horario son una preferencia, no una reserva. Te confirmamos por WhatsApp
              si hay disponibilidad.
            </p>

            <h3 className="solicitud-paso">
              <span className="cita-numero">3</span> ¿Cómo te llamás?
            </h3>

            <div className="form-group">
              <label htmlFor="cita-nombre">Tu nombre *</label>
              <input
                id="cita-nombre"
                type="text"
                required
                placeholder="Ej: María López"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="cita-comentario">¿Algo que debamos saber? (opcional)</label>
              <textarea
                id="cita-comentario"
                rows="2"
                maxLength={300}
                placeholder="Alguna preferencia, alergia o consulta"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
              />
            </div>
          </div>

          <aside className="solicitud-resumen">
            <div className="reserva-resumen-caja">
              <div className="reserva-resumen-marca">
                <span className="logo-icon">✦</span>
                <div>
                  <strong>{NEGOCIO.nombre}</strong>
                  <span>{NEGOCIO.direccion}</span>
                </div>
              </div>

              <h4 className="solicitud-previa-titulo">Tu mensaje</h4>
              <pre className="solicitud-previa">{mensaje}</pre>

              {seleccionados.length > 1 && (
                <div className="reserva-resumen-total">
                  <span>Total aproximado</span>
                  <span>{formatPrecio(total)}</span>
                </div>
              )}

              <a
                className={`btn btn-gold btn-block boton-whatsapp ${listo ? '' : 'inactivo'}`}
                href={listo ? enlaceWhatsApp(mensaje) : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!listo}
                onClick={(e) => {
                  if (!listo) e.preventDefault();
                }}
              >
                Enviar por WhatsApp
              </a>

              {!listo && (
                <p className="solicitud-falta">
                  {seleccionados.length === 0
                    ? 'Elegí al menos un servicio para continuar.'
                    : 'Escribí tu nombre para continuar.'}
                </p>
              )}

              <p className="solicitud-nota">
                Se abre WhatsApp con el mensaje ya escrito. Vos lo revisás antes de enviarlo.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
