import { useCart } from '@/context/CartContext';
import { useCerrarConEscape } from '@/lib/use-escape';

function formatPrice(amount) {
  return 'L ' + Number(amount).toFixed(2);
}

export default function CartDrawer() {
  const {
    cart, cartReady, cartOpen, setCartOpen,
    removeFromCart, changeQty, getCartTotal, setCheckoutOpen
  } = useCart();

  const total = getCartTotal();

  useCerrarConEscape(cartOpen, () => setCartOpen(false));

  return (
    <>
      {/* Botón real y no un div con onClick: cerrar tocando fuera del panel
          también tiene que funcionar con el teclado. */}
      <button
        type="button"
        className={`cart-overlay overlay-cerrar ${cartOpen ? 'active' : ''}`}
        aria-label="Cerrar el carrito"
        tabIndex={cartOpen ? 0 : -1}
        onClick={() => setCartOpen(false)}
      />
      <aside
        className={`cart-drawer ${cartOpen ? 'active' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Carrito de compras"
        aria-hidden={!cartOpen}
      >
        <div className="cart-header">
          <h3>Tu Carrito</h3>
          <button className="close-btn" onClick={() => setCartOpen(false)} aria-label="Cerrar carrito">&times;</button>
        </div>
        <div className="cart-items">
          {!cartReady ? (
            <p className="cart-empty">Cargando tu carrito... ✨</p>
          ) : cart.length === 0 ? (
            <p className="cart-empty">Tu carrito está vacío. ✨</p>
          ) : (
            cart.map(item => {
              const enElLimite = item.qty >= item.stock;
              return (
                <div className="cart-item" key={item.id}>
                  <img src={item.image} alt={item.name} className="cart-item-img" />
                  <div className="cart-item-info">
                    <p className="cart-item-name">{item.name}</p>
                    <p className="cart-item-price">{formatPrice(item.price)}</p>
                    <div className="cart-item-qty">
                      <button
                        className="qty-btn"
                        onClick={() => changeQty(item.id, -1)}
                        aria-label={`Quitar una unidad de ${item.name}`}
                      >
                        −
                      </button>
                      <span>{item.qty}</span>
                      <button
                        className="qty-btn"
                        onClick={() => changeQty(item.id, 1)}
                        disabled={enElLimite}
                        title={enElLimite ? `Solo quedan ${item.stock} en stock` : undefined}
                        aria-label={`Agregar una unidad de ${item.name}`}
                      >
                        +
                      </button>
                    </div>
                    {enElLimite && (
                      <span className="cart-item-limit">Máximo disponible: {item.stock}</span>
                    )}
                  </div>
                  <button className="cart-item-remove" onClick={() => removeFromCart(item.id)}>Eliminar</button>
                </div>
              );
            })
          )}
        </div>
        <div className="cart-footer">
          <div className="cart-total">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
          <button
            className="btn btn-gold btn-block"
            disabled={!cartReady || cart.length === 0}
            onClick={() => {
              setCartOpen(false);
              setCheckoutOpen(true);
            }}
          >
            Realizar Pedido
          </button>
        </div>
      </aside>
    </>
  );
}
