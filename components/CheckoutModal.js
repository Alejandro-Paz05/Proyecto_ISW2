import { useState } from 'react';
import { useCart } from '@/context/CartContext';

function formatPrice(amount) {
  return 'L ' + Number(amount).toFixed(2);
}

const paymentMethods = [
  { key: 'efectivo', icon: '💵', label: 'Efectivo' },
  { key: 'tarjeta', icon: '💳', label: 'Tarjeta' },
  { key: 'transferencia', icon: '🏦', label: 'Transferencia' }
];

export default function CheckoutModal() {
  const {
    cart, checkoutOpen, setCheckoutOpen,
    getCartTotal, clearCart, setConfirmOpen, setLastOrder, showToast
  } = useCart();

  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '' });
  const [payment, setPayment] = useState('efectivo');
  const [submitting, setSubmitting] = useState(false);

  const total = getCartTotal();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            name: form.name,
            email: form.email,
            phone: form.phone,
            address: form.address
          },
          payment,
          // Solo id y cantidad: el precio y el total los calcula el
          // servidor con los datos de la base. El resumen de arriba es
          // únicamente informativo.
          items: cart.map(item => ({ id: item.id, qty: item.qty }))
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al procesar el pedido');
      }

      // Éxito: guardar pedido, limpiar carrito, mostrar confirmación
      setLastOrder(data.order);
      clearCart();
      setCheckoutOpen(false);
      setConfirmOpen(true);
      setForm({ name: '', email: '', phone: '', address: '' });
      setPayment('efectivo');
    } catch (err) {
      showToast(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!checkoutOpen) return null;

  return (
    <div className="modal-overlay active" onClick={(e) => e.target === e.currentTarget && setCheckoutOpen(false)}>
      <div className="modal">
        <button className="close-btn modal-close" onClick={() => setCheckoutOpen(false)}>&times;</button>
        <h2 className="checkout-title">Finalizar Pedido</h2>
        <p className="checkout-sub">Compra como invitado. Solo necesitas tu correo y teléfono. ✨</p>

        <div className="order-summary">
          <h4>Resumen del pedido</h4>
          {cart.map(item => (
            <div className="summary-line" key={item.id}>
              <span>{item.name} × {item.qty}</span>
              <span>{formatPrice(item.price * item.qty)}</span>
            </div>
          ))}
          <div className="summary-line total">
            <span>Total a pagar</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Nombre completo *</label>
            <input type="text" id="name" name="name" required placeholder="Ej: María López" value={form.name} onChange={handleChange} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="email">Correo electrónico *</label>
              <input type="email" id="email" name="email" required placeholder="tucorreo@ejemplo.com" value={form.email} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label htmlFor="phone">Número de celular *</label>
              <input type="tel" id="phone" name="phone" required placeholder="+504 9999-0000" value={form.phone} onChange={handleChange} />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="address">Dirección de entrega *</label>
            <textarea id="address" name="address" rows="2" required placeholder="Ciudad, colonia, calle, número de casa" value={form.address} onChange={handleChange}></textarea>
          </div>

          <div className="form-group">
            <label>Método de pago</label>
            <div className="payment-methods">
              {paymentMethods.map(m => (
                <div
                  key={m.key}
                  className={`payment-option ${payment === m.key ? 'selected' : ''}`}
                  onClick={() => setPayment(m.key)}
                >
                  <span className="pay-icon">{m.icon}</span>
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          <button type="submit" className="btn btn-gold btn-block" disabled={submitting}>
            {submitting ? 'Procesando...' : 'Confirmar Pedido'}
          </button>
        </form>
      </div>
    </div>
  );
}
