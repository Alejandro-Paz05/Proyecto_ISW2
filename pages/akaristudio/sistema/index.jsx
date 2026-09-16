import { Fragment, useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { protegerPagina, PORTAL_SISTEMA } from '@/lib/sesion';

/**
 * Los tickets: lo que hay que corregir.
 *
 * Llegan de dos lados y se ven igual: los que abrió el sistema al capturar un
 * error, y los que abrió el reporte de una clienta. La lista arranca en lo
 * pendiente, porque lo resuelto ya no es trabajo.
 */

const ESTADOS = ['abierto', 'en_progreso', 'resuelto', 'descartado'];
const SEVERIDADES = ['baja', 'media', 'alta', 'critica'];

const ORIGENES = {
  automatico: '🤖 Capturado',
  cliente: '🗣️ Reportado',
  interno: '🔧 Interno'
};

function formatFecha(iso) {
  return new Date(iso).toLocaleString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function TicketsDelSistema({ sesion }) {
  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState('pendientes');
  const [expandido, setExpandido] = useState(null);
  const [guardando, setGuardando] = useState(null);
  const [nota, setNota] = useState('');

  const soloLectura = sesion?.soloLectura;

  const cargar = useCallback(async (estado) => {
    setCargando(true);
    try {
      const res = await fetch(`/api/sistema/tickets?estado=${estado}`);
      if (!res.ok) throw new Error('No se pudieron cargar los tickets.');
      setTickets(await res.json());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(filtro);
  }, [cargar, filtro]);

  async function actualizar(ticket, cambios) {
    setGuardando(ticket.id);
    setError(null);

    try {
      const res = await fetch(`/api/sistema/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cambios)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el ticket.');

      // Se recarga en vez de parchear la lista: cambiar el estado puede sacar
      // el ticket del filtro actual, y dejarlo ahí mentiría.
      await cargar(filtro);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(null);
    }
  }

  function abrirDetalle(ticket) {
    const abriendo = expandido !== ticket.id;
    setExpandido(abriendo ? ticket.id : null);
    setNota(abriendo ? ticket.resolution ?? '' : '');
  }

  const sinResolver = tickets.filter((t) => t.status === 'abierto').length;
  const ocurrencias = tickets.reduce((suma, t) => suma + t.occurrences, 0);

  return (
    <AdminLayout titulo="Tickets" portal="sistema" sesion={sesion}>
      <div className="admin-tarjetas">
        <div className="admin-tarjeta">
          <span className="admin-tarjeta-valor">{tickets.length}</span>
          <span className="admin-tarjeta-label">Tickets en la lista</span>
        </div>
        <div className="admin-tarjeta">
          <span className="admin-tarjeta-valor">{sinResolver}</span>
          <span className="admin-tarjeta-label">Abiertos</span>
        </div>
        <div className="admin-tarjeta">
          <span className="admin-tarjeta-valor">{ocurrencias}</span>
          <span className="admin-tarjeta-label">Veces que ocurrieron</span>
        </div>
      </div>

      <div className="admin-filtros">
        {['pendientes', ...ESTADOS, 'todos'].map((estado) => (
          <button
            key={estado}
            className={`admin-filtro ${filtro === estado ? 'activo' : ''}`}
            aria-pressed={filtro === estado}
            onClick={() => setFiltro(estado)}
          >
            {estado === 'pendientes' ? 'Por atender' : estado === 'todos' ? 'Todos' : estado}
          </button>
        ))}
      </div>

      {error && <p className="admin-alerta">{error}</p>}
      {cargando && <p className="admin-vacio">Cargando tickets...</p>}

      {!cargando && tickets.length === 0 && (
        <p className="admin-vacio">
          {filtro === 'pendientes'
            ? 'No hay nada por atender. Cuando el sistema capture un error o una clienta reporte un problema, aparecerá acá.'
            : 'No hay tickets con ese estado.'}
        </p>
      )}

      {tickets.length > 0 && (
        <div className="admin-tabla-scroll">
          <table className="admin-tabla">
            <thead>
              <tr>
                <th>Problema</th>
                <th>Origen</th>
                <th className="derecha">Veces</th>
                <th>Última vez</th>
                <th>Severidad</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <Fragment key={ticket.id}>
                  <tr className="admin-fila" onClick={() => abrirDetalle(ticket)}>
                    <td>
                      <strong>{ticket.title}</strong>
                      <span className="admin-detalle-pista">
                        {expandido === ticket.id ? '▾' : '▸'} #{ticket.id}
                      </span>
                    </td>
                    <td>{ORIGENES[ticket.source] ?? ticket.source}</td>
                    <td className="derecha">{ticket.occurrences}</td>
                    <td>{formatFecha(ticket.last_seen_at)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className="admin-estado"
                        value={ticket.severity}
                        disabled={soloLectura || guardando === ticket.id}
                        onChange={(e) => actualizar(ticket, { severity: e.target.value })}
                        aria-label={`Severidad del ticket ${ticket.id}`}
                      >
                        {SEVERIDADES.map((severidad) => (
                          <option key={severidad} value={severidad}>
                            {severidad}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className={`admin-estado estado-${ticket.status}`}
                        value={ticket.status}
                        disabled={soloLectura || guardando === ticket.id}
                        onChange={(e) => actualizar(ticket, { status: e.target.value })}
                        aria-label={`Estado del ticket ${ticket.id}`}
                      >
                        {ESTADOS.map((estado) => (
                          <option key={estado} value={estado}>
                            {estado}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>

                  {expandido === ticket.id && (
                    <tr className="admin-fila-detalle">
                      <td colSpan={6}>
                        <div className="admin-detalle">
                          <div>
                            <h4>Qué pasó</h4>
                            <pre className="admin-pila">{ticket.detail ?? 'Sin detalle.'}</pre>
                          </div>
                          <div>
                            <h4>Dónde</h4>
                            <ul>
                              {Object.entries(ticket.context ?? {}).map(([clave, valor]) => (
                                <li key={clave}>
                                  {clave}: <span>{String(valor)}</span>
                                </li>
                              ))}
                            </ul>
                            <p className="admin-sub">Primera vez: {formatFecha(ticket.first_seen_at)}</p>
                          </div>
                          <div>
                            <h4>Resolución</h4>
                            {soloLectura ? (
                              <p>{ticket.resolution ?? 'Sin nota.'}</p>
                            ) : (
                              <>
                                <textarea
                                  rows="4"
                                  maxLength={2000}
                                  placeholder="Qué se corrigió y dónde"
                                  value={nota}
                                  onChange={(e) => setNota(e.target.value)}
                                />
                                <button
                                  type="button"
                                  className="btn btn-gold"
                                  disabled={guardando === ticket.id}
                                  onClick={() => actualizar(ticket, { resolution: nota })}
                                >
                                  Guardar la nota
                                </button>
                              </>
                            )}
                            {ticket.resolved_at && (
                              <p className="admin-sub">Resuelto: {formatFecha(ticket.resolved_at)}</p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}

export const getServerSideProps = protegerPagina(PORTAL_SISTEMA);
