import { useState } from 'react';
import { useCart } from '@/context/CartContext';

const categories = [
  { key: 'todos', label: 'Todos' },
  { key: 'unas', label: 'Uñas' },
  { key: 'pestanas', label: 'Pestañas' },
  { key: 'cejas', label: 'Cejas' },
  { key: 'maquillaje', label: 'Maquillaje' },
  { key: 'accesorios', label: 'Accesorios' }
];

const categoryLabels = {
  unas: 'Uñas',
  pestanas: 'Pestañas',
  cejas: 'Cejas',
  maquillaje: 'Maquillaje',
  accesorios: 'Accesorios'
};

function formatPrice(amount) {
  return 'L ' + Number(amount).toFixed(2);
}

export default function Products({ products, loading, error }) {
  const [filter, setFilter] = useState('todos');
  const { addToCart } = useCart();

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
              onClick={() => setFilter(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {loading && <p className="loading-text">Cargando productos... ✨</p>}

        {error && <p className="error-text">⚠️ {error}</p>}

        {!loading && !error && (
          <div className="products-grid">
            {filtered.map(product => {
              const outOfStock = product.stock <= 0;
              return (
                <div className="product-card" key={product.id}>
                  <img src={product.image} alt={product.name} className="product-img" loading="lazy" />
                  <div className="product-body">
                    <span className="product-category">{categoryLabels[product.category]}</span>
                    <h3 className="product-name">{product.name}</h3>
                    <p className="product-desc">{product.description}</p>
                    <div className="product-footer">
                      <span className="product-price">{formatPrice(product.price)}</span>
                      {outOfStock ? (
                        <span className="out-of-stock">Agotado</span>
                      ) : (
                        <button className="add-btn" onClick={() => addToCart(product)}>
                          Agregar
                        </button>
                      )}
                    </div>
                    {!outOfStock && (
                      <span className="stock-info">Quedan {product.stock} en stock</span>
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
