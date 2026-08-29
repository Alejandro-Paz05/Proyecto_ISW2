import { useState } from 'react';
import { useCart } from '@/context/CartContext';
import { CATEGORIAS, ETIQUETAS_CATEGORIA } from '@/lib/categorias';

const categories = [{ key: 'todos', label: 'Todos' }, ...CATEGORIAS];

// Por debajo de este stock se avisa al cliente. Anunciar "quedan 25" no
// aporta nada; anunciar "quedan 2" sí.
const UMBRAL_STOCK_BAJO = 5;

function formatPrice(amount) {
  return 'L ' + Number(amount).toFixed(2);
}

export default function Products({ products, loading, error }) {
  const [filter, setFilter] = useState('todos');
  const { addToCart, cart } = useCart();

  const filtered = filter === 'todos'
    ? products
    : products.filter(p => p.category === filter);

  return (
    <section id="productos" className="section section-dark">
      <div className="container">
        <p className="section-tag">Tienda online</p>
        <h2 className="section-title">Nuestros Productos</h2>
        <p className="section-sub">
          Agrega a tu carrito y realiza tu pedido sin necesidad de crear una cuenta.
        </p>

        <div className="filters">
          {categories.map(cat => (
            <button
              key={cat.key}
              className={`filter-btn ${filter === cat.key ? 'active' : ''}`}
              aria-pressed={filter === cat.key}
              onClick={() => setFilter(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {loading && <p className="loading-text">Cargando productos... ✨</p>}

        {error && <p className="error-text">⚠️ {error}</p>}

        {!loading && !error && filtered.length === 0 && (
          <p className="empty-text">
            No hay productos en esta categoría por ahora. ✨
          </p>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="products-grid">
            {filtered.map(product => {
              const agotado = product.stock <= 0;
              const enCarrito = cart.find(item => item.id === product.id)?.qty ?? 0;
              const sinMasUnidades = enCarrito >= product.stock;
              const stockBajo = !agotado && product.stock <= UMBRAL_STOCK_BAJO;

              return (
                <div className="product-card" key={product.id}>
                  <img src={product.image} alt={product.name} className="product-img" loading="lazy" />
                  <div className="product-body">
                    <span className="product-category">{ETIQUETAS_CATEGORIA[product.category]}</span>
                    <h3 className="product-name">{product.name}</h3>
                    <p className="product-desc">{product.description}</p>
                    <div className="product-footer">
                      <span className="product-price">{formatPrice(product.price)}</span>
                      {agotado ? (
                        <span className="out-of-stock">Agotado</span>
                      ) : (
                        <button
                          className="add-btn"
                          onClick={() => addToCart(product)}
                          disabled={sinMasUnidades}
                          title={sinMasUnidades ? 'Ya tienes todas las unidades disponibles' : undefined}
                        >
                          {sinMasUnidades ? 'En el carrito' : 'Agregar'}
                        </button>
                      )}
                    </div>
                    {stockBajo && (
                      <span className="stock-info">
                        {product.stock === 1 ? '¡Última unidad!' : `¡Solo quedan ${product.stock}!`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
