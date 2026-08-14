// ============================================
// AKARI STUDIO - Checkout como invitado (guest)
// ============================================

const checkoutModal = document.getElementById('checkoutModal');
const checkoutContent = document.getElementById('checkoutContent');
const closeCheckout = document.getElementById('closeCheckout');
const confirmModal = document.getElementById('confirmModal');
const confirmContent = document.getElementById('confirmContent');

// ===== Abrir checkout =====
checkoutBtn.addEventListener('click', () => {
  if (cart.length === 0) return;
  renderCheckout();
  checkoutModal.classList.add('active');
});

closeCheckout.addEventListener('click', () => {
  checkoutModal.classList.remove('active');
});

// Cerrar modal al hacer clic fuera
checkoutModal.addEventListener('click', (e) => {
  if (e.target === checkoutModal) checkoutModal.classList.remove('active');
});

// ===== Renderizar formulario de checkout =====
function renderCheckout() {
  const total = getCartTotal();

  const summaryLines = cart.map(item => `
    <div class="summary-line">
      <span>${item.name} × ${item.qty}</span>
      <span>${formatPrice(item.price * item.qty)}</span>
    </div>
  `).join('');

  checkoutContent.innerHTML = `
    <h2 class="checkout-title">Finalizar Pedido</h2>
    <p class="checkout-sub">Compra como invitado. Solo necesitas tu correo y teléfono. ✨</p>

    <div class="order-summary">
      <h4>Resumen del pedido</h4>
      ${summaryLines}
      <div class="summary-line total">
        <span>Total a pagar</span>
        <span>${formatPrice(total)}</span>
      </div>
    </div>

    <form id="checkoutForm">
      <div class="form-group">
        <label for="name">Nombre completo *</label>
        <input type="text" id="name" required placeholder="Ej: María López" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="email">Correo electrónico *</label>
          <input type="email" id="email" required placeholder="tucorreo@ejemplo.com" />
        </div>
        <div class="form-group">
          <label for="phone">Número de celular *</label>
          <input type="tel" id="phone" required placeholder="+504 9999-0000" />
        </div>
      </div>

      <div class="form-group">
        <label for="address">Dirección de entrega *</label>
        <textarea id="address" rows="2" required placeholder="Ciudad, colonia, calle, número de casa"></textarea>
      </div>

      <div class="form-group">
        <label>Método de pago</label>
        <div class="payment-methods">
          <div class="payment-option selected" data-payment="efectivo" onclick="selectPayment(this)">
            <span class="pay-icon">💵</span>
            Efectivo
          </div>
          <div class="payment-option" data-payment="tarjeta" onclick="selectPayment(this)">
            <span class="pay-icon">💳</span>
            Tarjeta
          </div>
          <div class="payment-option" data-payment="transferencia" onclick="selectPayment(this)">
            <span class="pay-icon">🏦</span>
            Transferencia
          </div>
        </div>
      </div>

      <button type="submit" class="btn btn-gold btn-block">Confirmar Pedido</button>
    </form>
  `;

  document.getElementById('checkoutForm').addEventListener('submit', handleCheckoutSubmit);
}

// ===== Selección de método de pago =====
function selectPayment(el) {
  document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
}

// ===== Enviar pedido =====
function handleCheckoutSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const address = document.getElementById('address').value.trim();
  const payment = document.querySelector('.payment-option.selected').dataset.payment;

  // Validación básica de email
  if (!isValidEmail(email)) {
    showToast('Por favor ingresa un correo válido');
    return;
  }

  // Crear el pedido
  const order = {
    id: 'AK-' + Date.now().toString().slice(-6),
    date: new Date().toLocaleString('es-HN'),
    customer: { name, email, phone, address },
    payment,
    items: cart.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
    total: getCartTotal()
  };

  // Guardar pedido en localStorage (historial)
  const orders = JSON.parse(localStorage.getItem('akari_orders')) || [];
  orders.push(order);
  localStorage.setItem('akari_orders', JSON.stringify(orders));

  // Enviar correo de confirmación (simulado)
  sendConfirmationEmail(order);

  // Mostrar confirmación
  showConfirmation(order);

  // Limpiar carrito
  cart = [];
  saveCart();
  renderCart();

  // Cerrar checkout
  checkoutModal.classList.remove('active');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ===== Enviar correo de confirmación (simulado) =====
function sendConfirmationEmail(order) {
  // NOTA: Esto es una simulación. Para enviar correos reales,
  // se necesita un backend con un servicio como EmailJS, SendGrid,
  // o un servidor Node.js con Nodemailer.
  console.log('📧 Correo de confirmación enviado a:', order.customer.email);
  console.log('Pedido:', order);
}

// ===== Mostrar confirmación =====
function showConfirmation(order) {
  const paymentLabels = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    transferencia: 'Transferencia'
  };

  const itemsList = order.items.map(i => `
    <p>• ${i.name} × ${i.qty} — ${formatPrice(i.price * i.qty)}</p>
  `).join('');

  confirmContent.innerHTML = `
    <div class="confirm-icon">✅</div>
    <h2 class="confirm-title">¡Pedido Confirmado!</h2>
    <p class="confirm-text">
      Gracias por tu compra, <strong>${order.customer.name}</strong>.<br />
      Hemos enviado un correo de confirmación a <strong>${order.customer.email}</strong>.
    </p>
    <div class="confirm-details">
      <p><strong>N° de pedido:</strong> ${order.id}</p>
      <p><strong>Fecha:</strong> ${order.date}</p>
      <p><strong>Método de pago:</strong> ${paymentLabels[order.payment]}</p>
      <p><strong>Total:</strong> ${formatPrice(order.total)}</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:10px 0;" />
      ${itemsList}
    </div>
    <button class="btn btn-gold btn-block" onclick="closeConfirmation()">Continuar</button>
  `;

  confirmModal.classList.add('active');
}

function closeConfirmation() {
  confirmModal.classList.remove('active');
}
