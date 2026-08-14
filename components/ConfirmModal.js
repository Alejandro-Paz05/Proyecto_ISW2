import { useCart } from '@/context/CartContext';

function formatPrice(amount) {
  return 'L ' + Number(amount).toFixed(2);
}

export default function ConfirmModal() {
  const { confirmOpen, setConfirmOpen, lastOrder } = useCart();

  if (!confirmOpen || !lastOrder) return null;

  return (
    <div className="modal-overlay active">
      <div className="modal modal-confirm">
        <div className="confirm-icon">✅</div>
        <h2 className="confirm-title">¡Pedido Confirmado!</h2>
        <p className="confirm-text">
          Gracias por tu compra.<br />
          Hemos enviado un correo de confirmación a <strong>{lastOrder.customer_email}</strong>.
        </p>
        <div className="confirm-details">
          <p><strong>N° de pedido:</strong> {lastOrder.order_number}</p>
          <p><strong>Total:</strong> {formatPrice(lastOrder.total)}</p>
        </div>
        <button className="btn btn-gold btn-block" onClick={() => setConfirmOpen(false)}>Continuar</button>
      </div>
    </div>
  );
}