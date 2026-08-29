import { Fragment, useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { estaAutenticado } from '@/lib/admin-auth';

const ESTADOS = ['pendiente', 'confirmado', 'enviado', 'entregado', 'cancelado'];

function formatPrice(amount) {
  return 'L ' + Number(amount).toFixed(2);
}

function formatFecha(iso) {
  return new Date(iso).toLocaleString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function PedidosAdmin() {
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState('todos');
  const [guardando, setGuardando] = useState(null);
  const [expandido, setExpandido] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/orders');
      if (!res.ok) throw new Error('No se pudieron cargar los pedidos.');
      setPedidos(await res.json());
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

  async function cambiarEstado(pedido, status) {
    setGuardando(pedido.id);
    // Actualización optimista: la lista responde al instante y se revierte
    // si el servidor rechaza el cambio.
    const anterior = pedido.status;
    setPedidos((prev) => prev.map((p) => (p.id === pedido.id ? { ...p, status } : p)));

    try {
      const res = await fetch(`/api/admin/orders/${pedido.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('No se pudo cambiar el estado.');
    } catch (err) {
      setPedidos((prev) => prev.map((p) => (p.id === pedido.id ? { ...p, status: anterior } : p)));
      setError(err.message);
    } finally {
      setGuardando(null);
    }
  }

  const visibles = filtro === 'todos' ? pedidos : pedidos.filter((p) => p.status === filtro);

  const pendientes = pedidos.filter((p) => p.status === 'pendiente').length;
  const facturado = pedidos
    .filter((p) => p.status !== 'cancelado')
    .reduce((suma, p) => suma + Number(p.total), 0);

  return (
    <AdminLayout titulo="Pedidos">
      <div className="admin-tarjetas">
        <div className="admin-tarjeta">
          <span className="admin-tarjeta-valor">{pedidos.length}</span>
          <span className="admin-tarjeta-label">Pedidos totales</span>
        </div>
        <div className="admin-tarjeta">
          <span className="admin-tarjeta-valor">{pendientes}</span>
          <span className="admin-tarjeta-label">Pendientes</span>
        </div>
        <div className="admin-tarjeta">
          <span className="admin-tarjeta-valor">{formatPrice(facturado)}</span>
          <span className="admin-tarjeta-label">Facturado, sin cancelados</span>
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
      {cargando && <p className="admin-vacio">Cargando pedidos...</p>}

      {!cargando && visibles.length === 0 && (
        <p className="admin-vacio">
          {pedidos.length === 0
            ? 'Todavía no hay pedidos. Cuando alguien compre en la tienda, aparecerá aquí.'
            : 'No hay pedidos con ese estado.'}
        </p>
      )}

      {visibles.length > 0 && (
        <div className="admin-tabla-scroll">
          <table className="admin-tabla">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Pago</th>
                <th className="derecha">Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((pedido) => (
                <Fragment key={pedido.id}>
                  <tr
                    className="admin-fila"
                    onClick={() => setExpandido(expandido === pedido.id ? null : pedido.id)}
                  >
                    <td>
                      <strong>{pedido.order_number}</strong>
                      <span className="admin-detalle-pista">
                        {expandido === pedido.id ? '▾' : '▸'} {pedido.order_items.length} artículo
                        {pedido.order_items.length === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td>{formatFecha(pedido.created_at)}</td>
                    <td>
                      {pedido.customer_name}
                      <span className="admin-sub">{pedido.customer_phone}</span>
                    </td>
                    <td>{pedido.payment_method}</td>
                    <td className="derecha">{formatPrice(pedido.total)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className={`admin-estado estado-${pedido.status}`}
                        value={pedido.status}
                        disabled={guardando === pedido.id}
                        onChange={(e) => cambiarEstado(pedido, e.target.value)}
                        aria-label={`Estado del pedido ${pedido.order_number}`}
                      >
                        {ESTADOS.map((estado) => (
                          <option key={estado} value={estado}>
                            {estado}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>

                  {expandido === pedido.id && (
                    <tr className="admin-fila-detalle">
                      <td colSpan={6}>
                        <div className="admin-detalle">
                          <div>
                            <h4>Artículos</h4>
                            <ul>
                              {pedido.order_items.map((item, i) => (
                                <li key={i}>
                                  {item.quantity} × {item.product_name}
                                  <span>{formatPrice(item.price * item.quantity)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4>Entrega</h4>
                            <p>{pedido.customer_address}</p>
                            <p>
                              <a href={`mailto:${pedido.customer_email}`}>{pedido.customer_email}</a>
                            </p>
                            <p>
                              <a href={`tel:${pedido.customer_phone.replace(/\s/g, '')}`}>
                                {pedido.customer_phone}
                              </a>
                            </p>
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

export function getServerSideProps({ req }) {
  if (!estaAutenticado(req)) {
    return { redirect: { destination: '/akaristudio/admin/login', permanent: false } };
  }
  return { props: {} };
}
