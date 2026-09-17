import { useCallback, useEffect, useRef, useState } from 'react';
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
  // Qué color eligió la clienta en cada producto. No se preselecciona ninguno:
  // en un salón, comprar el color equivocado es un viaje de vuelta, así que
  // vale más un botón que espera a que elija.
  const [colorElegido, setColorElegido] = useState({});
  const { addToCart, cart } = useCart();

  // Qué tarjeta acaba de confirmar. La confirmación de hoy aparece lejos del
  // dedo: un aviso abajo y el contador del carrito arriba. Que el botón mismo
  // responda es lo más directo a lo que se acaba de tocar.
  const [confirmado, setConfirmado] = useState(null);
  const temporizador = useRef(null);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const agregar = useCallback(
    (producto, color) => {
      addToCart(producto, color);
      setConfirmado(`${producto.id}:${color?.id ?? ''}`);
      clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => setConfirmado(null), 1400);
    },
    [addToCart]
  );

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
              const colores = product.colores ?? [];
              const elegido = colores.find(c => c.id === colorElegido[product.id]) ?? null;

              // Agotado es que no quede ninguno de ningún color: products.stock
              // es la suma de sus colores, mantenida por la base.
              const agotado = product.stock <= 0;
              // Lo que se puede comprar en este momento es lo del color
              // elegido, no lo del producto entero.
              const disponible = colores.length > 0 ? elegido?.stock ?? 0 : product.stock;
              const faltaElegirColor = colores.length > 0 && !elegido;

              const enCarrito =
                cart.find(
                  item =>
                    item.id === product.id && (item.colorId ?? null) === (elegido?.id ?? null)
                )?.qty ?? 0;
              const sinMasUnidades = !faltaElegirColor && enCarrito >= disponible;
              const stockBajo = !agotado && disponible > 0 && disponible <= UMBRAL_STOCK_BAJO;

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
                    {/* La foto entra con un fundido en vez de aparecer de
                        golpe. Con veinte productos bajando a distinto ritmo,
                        ese parpadeo constante es lo que hace sentir la página
                        a medio cargar. El ref cubre la foto que ya estaba en
                        caché: ahí `load` puede haber pasado antes de que React
                        alcance a escuchar. */}
                    <img
                      src={product.image}
                      alt={product.name}
                      className="product-img"
                      loading="lazy"
                      onLoad={(e) => e.currentTarget.classList.add('cargada')}
                      // Si la foto no carga, igual se muestra: si no, el texto
                      // alternativo quedaría invisible detrás del fundido y la
                      // tarjeta parecería vacía en vez de rota.
                      onError={(e) => e.currentTarget.classList.add('cargada')}
                      ref={(el) => {
                        if (el?.complete) el.classList.add('cargada');
                      }}
                    />
                  </div>
                  <div className="product-body">
                    <span className="product-category">{etiquetas[product.category]}</span>
                    <h3 className="product-name">{product.name}</h3>
                    <p className="product-desc">{product.description}</p>

                    {colores.length > 0 && (
                      <div
                        className="product-colores"
                        role="group"
                        aria-label={`Color de ${product.name}`}
                      >
                        {colores.map(color => {
                          const sinUnidades = color.stock <= 0;
                          const seleccionado = elegido?.id === color.id;

                          return (
                            <button
                              key={color.id}
                              type="button"
                              className={`color-muestra ${seleccionado ? 'elegido' : ''}`}
                              style={color.hex ? { '--muestra': color.hex } : undefined}
                              onClick={() =>
                                setColorElegido(prev => ({ ...prev, [product.id]: color.id }))
                              }
                              disabled={sinUnidades}
                              aria-pressed={seleccionado}
                              title={sinUnidades ? `${color.nombre}: agotado` : color.nombre}
                            >
                              <span className="color-punto" aria-hidden="true" />
                              {color.nombre}
                              {sinUnidades && <span className="sr-only"> (agotado)</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {/* El aviso de stock va ARRIBA del precio, no debajo: si
                        no, la fila del precio queda a distinta altura en cada
                        tarjeta según tenga aviso o no, y la rejilla se ve
                        desalineada. */}
                    <div className="product-cierre">
                      {stockBajo && (
                        <span className="stock-info">
                          {disponible === 1 ? '¡Última unidad!' : `¡Solo quedan ${disponible}!`}
                          {elegido ? ` en ${elegido.nombre}` : ''}
                        </span>
                      )}
                      <div className="product-footer">
                        <span className="product-price">{formatPrice(product.price)}</span>
                        {agotado ? (
                          <span className="out-of-stock">Agotado</span>
                        ) : (
                          <button
                            className={`add-btn ${
                              confirmado === `${product.id}:${elegido?.id ?? ''}` ? 'confirmado' : ''
                            }`}
                            onClick={() => agregar(product, elegido)}
                            disabled={faltaElegirColor || sinMasUnidades}
                            title={
                              faltaElegirColor
                                ? 'Tocá un color para poder agregarlo'
                                : sinMasUnidades
                                  ? 'Ya tienes todas las unidades disponibles'
                                  : undefined
                            }
                          >
                            {confirmado === `${product.id}:${elegido?.id ?? ''}`
                              ? '✓ Agregado'
                              : faltaElegirColor
                                ? 'Elegí un color'
                                : sinMasUnidades
                                  ? 'En el carrito'
                                  : 'Agregar'}
                          </button>
                        )}
                      </div>
                    </div>
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
