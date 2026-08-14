// ============================================
// AKARI STUDIO - Lógica de catálogo y carrito
// ============================================

// Estado del carrito (se guarda en localStorage)
let cart = JSON.parse(localStorage.getItem('akari_cart')) || [];

// ===== Referencias al DOM =====
const productsGrid = document.getElementById('productsGrid');
const filters = document.getElementById('filters');
const cartBtn = document.getElementById('cartBtn');
const cartCount = document.getElementById('cartCount');
const cartOverlay = document.getElementById('cartOverlay');
const cartDrawer = document.getElementById('cartDrawer');
const closeCart = document.getElementById('closeCart');
const cartItems = document.getElementById('cartItems');
const cartTotal = document.getElementById('cartTotal');
const checkoutBtn = document.getElementById('checkoutBtn');
const toast = document.getElementById('toast');

// ===== Renderizar productos =====
function renderProducts(filter = 'todos') {
  const filtered = filter === 'todos'
    ? PRODUCTS
    : PRODUCTS.filter(p => p.category === filter);

  productsGrid.innerHTML = filtered.map(product => `
    <div class="product-card">
      <img src="${product.image}" alt="${product.name}" class="product-img" loading="lazy" />
      <div class="product-body">
        <span class="product-category">${categoryLabel(product.category)}</span>
        <h3 class="product-name">${product.name}</h3>
        <p class="product-desc">${product.description}</p>
        <div class="product-footer">
          <span class="product-price">${formatPrice(product.price)}</span>
          <button class="add-btn" onclick="addToCart(${product.id})">Agregar</button>
        </div>
      </div>
    </div>
  `).join('');
}

function categoryLabel(cat) {
  const labels = {
    unas: 'Uñas',
    pestanas: 'Pestañas',
    cejas: 'Cejas',
    maquillaje: 'Maquillaje',
    accesorios: 'Accesorios'
  };
  return labels[cat] || cat;
}

// ===== Filtros =====
filters.addEventListener('click', (e) => {
  if (e.target.classList.contains('filter-btn')) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderProducts(e.target.dataset.filter);
  }
});

// ===== Carrito =====
function addToCart(id) {
  const product = PRODUCTS.find(p => p.id === id);
  const existing = cart.find(item => item.id === id);

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...product, qty: 1 });
  }

  saveCart();
  renderCart();
  showToast(`${product.name} agregado al carrito ✨`);
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  saveCart();
  renderCart();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(i => i.id !== id);
  }
  saveCart();
  renderCart();
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
}

function saveCart() {
  localStorage.setItem('akari_cart', JSON.stringify(cart));
}

function renderCart() {
  // Contador del navbar
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  cartCount.textContent = totalItems;

  if (cart.length === 0) {
    cartItems.innerHTML = '<p class="cart-empty">Tu carrito está vacío. ✨</p>';
    cartTotal.textContent = formatPrice(0);
    checkoutBtn.disabled = true;
    checkoutBtn.style.opacity = '0.5';
    return;
  }

  checkoutBtn.disabled = false;
  checkoutBtn.style.opacity = '1';

  cartItems.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img src="${item.image}" alt="${item.name}" class="cart-item-img" />
      <div class="cart-item-info">
        <p class="cart-item-name">${item.name}</p>
        <p class="cart-item-price">${formatPrice(item.price)}</p>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button>
          <span>${item.qty}</span>
          <button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button>
        </div>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart(${item.id})">Eliminar</button>
    </div>
  `).join('');

  cartTotal.textContent = formatPrice(getCartTotal());
}

// ===== Abrir / cerrar carrito =====
function openCart() {
  cartDrawer.classList.add('active');
  cartOverlay.classList.add('active');
}

function closeCartDrawer() {
  cartDrawer.classList.remove('active');
  cartOverlay.classList.remove('active');
}

cartBtn.addEventListener('click', openCart);
closeCart.addEventListener('click', closeCartDrawer);
cartOverlay.addEventListener('click', closeCartDrawer);

// ===== Toast =====
let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===== Inicializar =====
renderProducts();
renderCart();
