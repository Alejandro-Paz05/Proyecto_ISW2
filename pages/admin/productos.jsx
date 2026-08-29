import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { estaAutenticado } from '@/lib/admin-auth';
import { CATEGORIAS, ETIQUETAS_CATEGORIA } from '@/lib/categorias';

const VACIO = { name: '', category: 'unas', price: '', stock: '', description: '', image: '' };

function formatPrice(amount) {
  return 'L ' + Number(amount).toFixed(2);
}

export default function ProductosAdmin() {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [formulario, setFormulario] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/products');
      if (!res.ok) throw new Error('No se pudieron cargar los productos.');
      setProductos(await res.json());
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

  function abrirNuevo() {
    setError(null);
    setFormulario({ ...VACIO, id: null });
  }

  function abrirEdicion(producto) {
    setError(null);
    setFormulario({
      id: producto.id,
      name: producto.name,
      category: producto.category,
      price: String(producto.price),
      stock: String(producto.stock),
      description: producto.description ?? '',
      image: producto.image ?? ''
    });
  }

  async function guardar(evento) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);

    const esNuevo = formulario.id === null;
    const cuerpo = {
      name: formulario.name,
      category: formulario.category,
      price: Number(formulario.price),
      stock: Number(formulario.stock),
      description: formulario.description,
      image: formulario.image
    };

    try {
      const res = await fetch(
        esNuevo ? '/api/admin/products' : `/api/admin/products/${formulario.id}`,
        {
          method: esNuevo ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpo)
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el producto.');

      setFormulario(null);
      setAviso(esNuevo ? `"${data.name}" agregado al catálogo.` : `"${data.name}" actualizado.`);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(producto) {
    const confirmado = window.confirm(
      `¿Eliminar "${producto.name}" del catálogo?\n\n` +
        'Los pedidos ya registrados no se ven afectados: guardan su propia ' +
        'copia del nombre y del precio con que se vendió.'
    );
    if (!confirmado) return;

    try {
      const res = await fetch(`/api/admin/products/${producto.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo eliminar el producto.');
      setAviso(`"${producto.name}" eliminado del catálogo.`);
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  const sinStock = productos.filter((p) => p.stock === 0).length;
  const valorInventario = productos.reduce((suma, p) => suma + Number(p.price) * p.stock, 0);

  return (
    <AdminLayout titulo="Productos">
      <div className="admin-tarjetas">
        <div className="admin-tarjeta">
          <span className="admin-tarjeta-valor">{productos.length}</span>
          <span className="admin-tarjeta-label">Productos en catálogo</span>
        </div>
        <div className="admin-tarjeta">
          <span className="admin-tarjeta-valor">{sinStock}</span>
          <span className="admin-tarjeta-label">Agotados</span>
        </div>
        <div className="admin-tarjeta">
          <span className="admin-tarjeta-valor">{formatPrice(valorInventario)}</span>
          <span className="admin-tarjeta-label">Valor del inventario</span>
        </div>
      </div>

      {aviso && <p className="admin-aviso">{aviso}</p>}
      {error && <p className="admin-alerta">{error}</p>}

      {!formulario && (
        <button type="button" className="btn btn-gold admin-boton-nuevo" onClick={abrirNuevo}>
          + Agregar producto
        </button>
      )}

      {formulario && (
        <form className="admin-formulario" onSubmit={guardar}>
          <h3>{formulario.id === null ? 'Nuevo producto' : `Editando: ${formulario.name}`}</h3>

          <div className="admin-campos">
            <label className="ancho-completo">
              Nombre
              <input
                type="text"
                required
                maxLength={120}
                value={formulario.name}
                onChange={(e) => setFormulario({ ...formulario, name: e.target.value })}
              />
            </label>

            <label>
              Categoría
              <select
                value={formulario.category}
                onChange={(e) => setFormulario({ ...formulario, category: e.target.value })}
              >
                {CATEGORIAS.map((categoria) => (
                  <option key={categoria.key} value={categoria.key}>
                    {categoria.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Precio (lempiras)
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formulario.price}
                onChange={(e) => setFormulario({ ...formulario, price: e.target.value })}
              />
            </label>

            <label>
              Stock
              <input
                type="number"
                required
                min="0"
                step="1"
                value={formulario.stock}
                onChange={(e) => setFormulario({ ...formulario, stock: e.target.value })}
              />
            </label>

            <label className="ancho-completo">
              Descripción
              <textarea
                rows="2"
                maxLength={500}
                value={formulario.description}
                onChange={(e) => setFormulario({ ...formulario, description: e.target.value })}
              />
            </label>

            <label className="ancho-completo">
              Dirección de la imagen
              <input
                type="url"
                placeholder="https://..."
                value={formulario.image}
                onChange={(e) => setFormulario({ ...formulario, image: e.target.value })}
              />
            </label>
          </div>

          {formulario.image && (
            <div className="admin-vista-previa">
              <span>Vista previa</span>
              <img src={formulario.image} alt="" />
            </div>
          )}

          <div className="admin-formulario-acciones">
            <button type="submit" className="btn btn-gold" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
            <button type="button" className="admin-salir" onClick={() => setFormulario(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {cargando && <p className="admin-vacio">Cargando productos...</p>}

      {!cargando && productos.length === 0 && (
        <p className="admin-vacio">
          El catálogo está vacío. Usá &quot;Agregar producto&quot; para cargar el primero.
        </p>
      )}

      {productos.length > 0 && (
        <div className="admin-tabla-scroll">
          <table className="admin-tabla">
            <thead>
              <tr>
                <th></th>
                <th>Producto</th>
                <th>Categoría</th>
                <th className="derecha">Precio</th>
                <th className="derecha">Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {productos.map((producto) => (
                <tr key={producto.id}>
                  <td>
                    {producto.image ? (
                      <img className="admin-miniatura" src={producto.image} alt="" loading="lazy" />
                    ) : (
                      <span className="admin-miniatura admin-miniatura-vacia">✦</span>
                    )}
                  </td>
                  <td>
                    <strong>{producto.name}</strong>
                    {producto.description && (
                      <span className="admin-sub">{producto.description}</span>
                    )}
                  </td>
                  <td>{ETIQUETAS_CATEGORIA[producto.category] ?? producto.category}</td>
                  <td className="derecha">{formatPrice(producto.price)}</td>
                  <td className="derecha">
                    <span className={producto.stock === 0 ? 'admin-agotado' : undefined}>
                      {producto.stock === 0 ? 'Agotado' : producto.stock}
                    </span>
                  </td>
                  <td className="derecha admin-acciones-fila">
                    <button type="button" onClick={() => abrirEdicion(producto)}>
                      Editar
                    </button>
                    <button type="button" className="peligro" onClick={() => eliminar(producto)}>
                      Eliminar
                    </button>
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

export function getServerSideProps({ req }) {
  if (!estaAutenticado(req)) {
    return { redirect: { destination: '/admin/login', permanent: false } };
  }
  return { props: {} };
}
