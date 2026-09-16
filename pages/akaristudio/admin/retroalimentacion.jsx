import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { protegerPagina, PANEL_TIENDA } from '@/lib/sesion';

/**
 * Lo que dejaron las clientas desde la tienda.
 *
 * Vive en el panel de la tienda y no en el portal del sistema: es lo que
 * dicen las clientas del negocio, y lo primero que le interesa a la dueña.
 * El ticket que abre un problema es otra cosa, y esa la ve quien corrige.
 */

const ESTADOS = ['nueva', 'leida', 'archivada'];

const ETIQUETAS = {
  sugerencia: '💡 Sugerencia',
  problema: '⚠️ Problema',
  elogio: '💛 Elogio'
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

export default function RetroalimentacionAdmin({ sesion }) {
  const [mensajes, setMensajes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState('todos');
  const [guardando, setGuardando] = useState(null);

  const soloLectura = sesion?.soloLectura;

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/feedback');
      if (!res.ok) throw new Error('No se pudo cargar la retroalimentación.');
      setMensajes(await res.json());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function marcar(mensaje, status) {
    setGuardando(mensaje.id);

    // Optimista: la lista responde al instante y se revierte si el servidor
    // rechaza el cambio.
    const anterior = mensaje.status;
    setMensajes((prev) => prev.map((m) => (m.id === mensaje.id ? { ...m, status } : m)));

    try {
      const res = await fetch(`/api/admin/feedback/${mensaje.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('No se pudo actualizar el mensaje.');
    } catch (err) {
      setMensajes((prev) =>
        prev.map((m) => (m.id === mensaje.id ? { ...m, status: anterior } : m))
      );
      setError(err.message);
    } finally {
      setGuardando(null);
    }
  }

  const visibles = filtro === 'todos' ? mensajes : mensajes.filter((m) => m.status === filtro);
  const nuevas = mensajes.filter((m) => m.status === 'nueva').length;
  const problemas = mensajes.filter((m) => m.kind === 'problema').length;

  return (
    <AdminLayout titulo="Retroalimentación" portal="tienda" sesion={sesion}>
      <div className="admin-tarjetas">
        <div className="admin-tarjeta">
          <span className="admin-tarjeta-valor">{mensajes.length}</span>
          <span className="admin-tarjeta-label">Mensajes recibidos</span>
        </div>
        <div className="admin-tarjeta">
          <span className="admin-tarjeta-valor">{nuevas}</span>
          <span className="admin-tarjeta-label">Sin leer</span>
        </div>
        <div className="admin-tarjeta">
          <span className="admin-tarjeta-valor">{problemas}</span>
          <span className="admin-tarjeta-label">Problemas reportados</span>
        </div>
      </div>

      <div className="admin-filtros">
        {['todos', ...ESTADOS].map((estado) => (
          <button
            key={estado}
            className={`admin-filtro ${filtro === estado ? 'activo' : ''}`}
            aria-pressed={filtro === estado}
            onClick={() => setFiltro(estado)}
          >
            {estado === 'todos' ? 'Todos' : estado}
          </button>
        ))}
      </div>

      {error && <p className="admin-alerta">{error}</p>}
      {cargando && <p className="admin-vacio">Cargando mensajes...</p>}

      {!cargando && visibles.length === 0 && (
        <p className="admin-vacio">
          {mensajes.length === 0
            ? 'Todavía nadie dejó un mensaje. Cuando alguien use el botón del pie de la tienda, aparecerá acá.'
            : 'No hay mensajes con ese estado.'}
        </p>
      )}

      {visibles.length > 0 && (
        <div className="admin-tabla-scroll">
          <table className="admin-tabla">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Fecha</th>
                <th>Mensaje</th>
                <th>Dónde</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((mensaje) => (
                <tr key={mensaje.id}>
                  <td>
                    {ETIQUETAS[mensaje.kind] ?? mensaje.kind}
                    {mensaje.ticket_id && (
                      <span className="admin-sub">Ticket #{mensaje.ticket_id}</span>
                    )}
                  </td>
                  <td>{formatFecha(mensaje.created_at)}</td>
                  <td>
                    {mensaje.message}
                    {mensaje.contact_email && (
                      <span className="admin-sub">
                        <a href={`mailto:${mensaje.contact_email}`}>{mensaje.contact_email}</a>
                      </span>
                    )}
                  </td>
                  <td>{mensaje.page ?? '—'}</td>
                  <td className="admin-acciones-fila">
                    <span className={`admin-estado estado-${mensaje.status}`}>{mensaje.status}</span>
                    {!soloLectura && mensaje.status !== 'leida' && (
                      <button
                        type="button"
                        disabled={guardando === mensaje.id}
                        onClick={() => marcar(mensaje, 'leida')}
                      >
                        Leída
                      </button>
                    )}
                    {!soloLectura && mensaje.status !== 'archivada' && (
                      <button
                        type="button"
                        disabled={guardando === mensaje.id}
                        onClick={() => marcar(mensaje, 'archivada')}
                      >
                        Archivar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}

export const getServerSideProps = protegerPagina(PANEL_TIENDA);
