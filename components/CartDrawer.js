import { useCart } from '@/context/CartContext';

function formatPrice(amount) {
  return 'L ' + Number(amount).toFixed(2);
}

export default function CartDrawer() {
  const {
    cart, cartOpen, setCartOpen,
    removeFromCart, changeQty, getCartTotal, setCheckoutOpen
  } = useCart();

  const total = getCartTotal();

  return (
    <>
      <div
        className={`cart-overlay ${cartOpen ? 'active' : ''}`}
        onClick={() => setCartOpen(false)}
      ></div>
      <aside className={`cart-drawer ${cartOpen ? 'active' : ''}`}>
        <div className="cart-header">
          <h3>Tu Carrito</h3>
          <button className="close-btn" onClick={() => setCartOpen(false)} aria-label="Cerrar carrito">&times;</button>
        </div>
        <div className="cart-items">
          {cart.length === 0 ? (
            <p className="cart-empty">Tu carrito está vacío. ✨</p>
          ) : (
            cart.map(item => (
              <div className="cart-item" key={item.id}>
                <img src={item.image} alt={item.name} className="cart-item-img" />
                <div className="cart-item-info">
                  <p className="cart-item-name">{item.name}</p>
                  <p className="cart-item-price">{formatPrice(item.price)}</p>
                  <div className="cart-item-qty">
                    <button className="qty-btn" onClick={() => changeQty(item.id, -1)}>−</button>
                    <span>{item.qty}</span>
                    <button className="qty-btn" onClick={() => changeQty(item.id, 1)}>+</button>
                  </div>
                </div>
                <button className="cart-item-remove" onClick={() => removeFromCart(item.id)}>Eliminar</button>
              </div>
            ))
          )}
        </div>
        <div className="cart-footer">
          <div className="cart-total">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
          <button
            className="btn btn-gold btn-block"
            disabled={cart.length === 0}
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
