import { useState } from 'react';
import { useCart } from '@/context/CartContext';
import { useRevelar } from '@/lib/use-revelar';
import { CATEGORIAS, ETIQUETAS_CATEGORIA } from '@/lib/categorias';

// Por debajo de este stock se avisa al cliente. Anunciar "quedan 25" no
// aporta nada; anunciar "quedan 2" sí.
const UMBRAL_STOCK_BAJO = 5;

function formatPrice(amount) {
  return 'L ' + Number(amount).toFixed(2);
}

// Las categorías llegan de la tabla `categories`. Los valores por defecto
// cubren dos casos reales: el arranque, antes de que responda la API, y
// cualquier prueba o página que monte el catálogo sin pasarlas.
export default function Products({
  products,
  loading,
  error,
  categorias = CATEGORIAS,
  etiquetas = ETIQUETAS_CATEGORIA
}) {
  const [filter, setFilter] = useState('todos');
  const { addToCart, cart } = useCart();

  const categories = [{ key: 'todos', label: 'Todos' }, ...categorias];

  const filtered = filter === 'todos'
    ? products
    : products.filter(p => p.category === filter);

  // La clave incluye el filtro y no solo la cantidad: al cambiar de categoría
  // se pintan tarjetas nuevas, y si no se volvieran a observar se quedarían
  // transparentes para siempre.
  useRevelar(`${filter}:${filtered.length}`);

  return (
    <section id="productos" className="section section-dark">
      <div className="container">
        <p className="section-tag" data-revelar>Tienda online</p>
        <h2 className="section-title" data-revelar>Nuestros Productos</h2>
        <p className="section-sub" data-revelar>
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

        {/* Esqueletos y no un "Cargando...": ocupan el mismo lugar que las
            tarjetas reales, así la página no da un salto cuando llegan. */}
        {loading && (
          <div className="products-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div className="product-esqueleto" key={i} style={{ '--i': i }}>
                <div className="esq-img"></div>
                <div className="esq-cuerpo">
                  <span className="esq-linea corta"></span>
                  <span className="esq-linea larga"></span>
                  <span className="esq-linea media"></span>
                </div>
              </div>
            ))}
          </div>
        )}
        <span className="sr-only" role="status">
          {loading ? 'Cargando productos' : ''}
        </span>

        {error && <p className="error-text">⚠️ {error}</p>}

        {!loading && !error && filtered.length === 0 && (
          <p className="empty-text">
            No hay productos en esta categoría por ahora. ✨
          </p>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="products-grid">
            {filtered.map((product, i) => {
              const agotado = product.stock <= 0;
              const enCarrito = cart.find(item => item.id === product.id)?.qty ?? 0;
              const sinMasUnidades = enCarrito >= product.stock;
              const stockBajo = !agotado && product.stock <= UMBRAL_STOCK_BAJO;

              return (
                <div
                  className={`product-card ${agotado ? 'agotado' : ''}`}
                  key={product.id}
                  data-revelar
                  // Solo las primeras filas se escalonan. Con 16 productos, el
                  // último tendría más de un segundo de retraso y parecería
                  // que la página se colgó.
                  style={{ '--i': i % 8 }}
                >
                  <div className="product-img-marco">
                    <img src={product.image} alt={product.name} className="product-img" loading="lazy" />
                  </div>
                  <div className="product-body">
                    <span className="product-category">{etiquetas[product.category]}</span>
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
