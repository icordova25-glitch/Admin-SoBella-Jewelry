const state = {
  products: [],
  cart: [],
  activeCategory: 'all',
};

const productsEl = document.getElementById('products');
const cartSection = document.querySelector('.checkout-card');
const statusMessage = document.getElementById('statusMessage');
const productRefreshChannel = window.BroadcastChannel ? new BroadcastChannel('sobella-products') : null;
const categoryButtons = document.querySelectorAll('.category-btn');
const mobileCategoryToggle = document.getElementById('mobileCategoryToggle');
const categoryDrawer = document.getElementById('categoryDrawer');
const drawerBackdrop = document.getElementById('drawerBackdrop');
const drawerClose = document.getElementById('drawerClose');
const businessBioEl = document.getElementById('businessBio');

function notifyProductRefresh() {
  if (productRefreshChannel) {
    productRefreshChannel.postMessage({ type: 'refresh' });
  }
  localStorage.setItem('sobella-product-refresh', String(Date.now()));
}

async function loadProducts() {
  const response = await fetch('/api/products');
  state.products = await response.json();
  renderProducts();
}

async function loadBusinessBio() {
  const response = await fetch('/api/business-bio');
  const data = await response.json();
  if (businessBioEl) {
    businessBioEl.textContent = data.bio || 'A modern jewelry studio crafting elegant pieces with timeless beauty.';
  }
}

function renderProducts() {
  productsEl.innerHTML = '';

  const filteredProducts = state.activeCategory === 'all'
    ? state.products
    : state.products.filter((product) => product.category === state.activeCategory);

  filteredProducts.forEach((product) => {
    const card = document.createElement('article');
    card.className = 'product-card';
    const imageMarkup = product.image ? `<img class="product-image" src="${product.image}" alt="${product.name}" />` : '';
    card.innerHTML = `
      ${imageMarkup}
      <h3>${product.name}</h3>
      <p>${product.description}</p>
      <p class="price">$${product.price}</p>
      <p>In stock: ${product.stock}</p>
      <div class="product-actions">
        ${product.image ? `<button class="secondary-btn" data-action="view" data-image="${product.image}">View</button>` : ''}
        <button data-sku="${product.sku}">Add to cart</button>
      </div>
    `;
    const addButton = card.querySelector('button[data-sku]');
    addButton.addEventListener('click', () => addToCart(product.sku));
    const viewButton = card.querySelector('button[data-action="view"]');
    if (viewButton) {
      viewButton.addEventListener('click', () => showImagePreview(viewButton.dataset.image));
    }
    productsEl.appendChild(card);
  });
}

function saveCart() {
  localStorage.setItem('sobella-cart', JSON.stringify(state.cart));
}

function loadCart() {
  const raw = localStorage.getItem('sobella-cart');
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      state.cart = parsed;
    }
  } catch (error) {
    console.warn('Unable to parse stored cart', error);
  }
}

function addToCart(sku) {
  const existing = state.cart.find((item) => item.sku === sku);
  if (existing) {
    existing.quantity += 1;
  } else {
    const product = state.products.find((item) => item.sku === sku);
    state.cart.push({ sku, quantity: 1, name: product.name, price: product.price });
  }
  saveCart();
  renderCart();
}

function renderCart() {
  if (cartSection) {
    cartSection.querySelector('h2').textContent = state.cart.length ? 'Bag ready' : 'Bag';
    const message = state.cart.length
      ? `${state.cart.reduce((sum, item) => sum + item.quantity, 0)} item${state.cart.reduce((sum, item) => sum + item.quantity, 0) === 1 ? '' : 's'} ready for review`
      : 'Review your selections before checkout.';
    cartSection.querySelector('p').textContent = message;
  }
}

function showImagePreview(imageUrl) {
  const overlay = document.createElement('div');
  overlay.className = 'image-preview-overlay';
  overlay.innerHTML = `
    <div class="image-preview-card">
      <button class="image-preview-close" type="button" aria-label="Close image preview">×</button>
      <img src="${imageUrl}" alt="Product preview" />
    </div>
  `;
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.classList.contains('image-preview-close')) {
      overlay.remove();
    }
  });
  document.body.appendChild(overlay);
}

function showReviewAndPay() {
  if (cartSection) {
    const existing = cartSection.querySelector('.review-pay-btn');
    if (existing) {
      return;
    }
    const reviewButton = document.createElement('button');
    reviewButton.className = 'review-pay-btn';
    reviewButton.type = 'button';
    reviewButton.textContent = 'Review and Pay';
    reviewButton.addEventListener('click', () => {
      if (state.cart.length === 0) {
        statusMessage.textContent = 'Add at least one item to your bag first.';
        return;
      }
      window.location.href = '/review';
    });
    cartSection.appendChild(reviewButton);
  }
}

function closeDrawer() {
  document.body.classList.remove('drawer-open');
  if (mobileCategoryToggle) {
    mobileCategoryToggle.setAttribute('aria-expanded', 'false');
  }
}

function openDrawer() {
  document.body.classList.add('drawer-open');
  if (mobileCategoryToggle) {
    mobileCategoryToggle.setAttribute('aria-expanded', 'true');
  }
}

categoryButtons.forEach((button) => {
  button.addEventListener('click', () => {
    state.activeCategory = button.dataset.category;
    categoryButtons.forEach((btn) => btn.classList.toggle('active', btn === button));
    renderProducts();
    closeDrawer();
  });
});

if (mobileCategoryToggle) {
  mobileCategoryToggle.addEventListener('click', openDrawer);
}

if (productRefreshChannel) {
  productRefreshChannel.addEventListener('message', () => loadProducts());
}
window.addEventListener('storage', (event) => {
  if (event.key === 'sobella-product-refresh') {
    loadProducts();
  }
});

if (drawerClose) {
  drawerClose.addEventListener('click', closeDrawer);
}

if (drawerBackdrop) {
  drawerBackdrop.addEventListener('click', closeDrawer);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeDrawer();
  }
});

loadCart();
showReviewAndPay();
loadProducts();
loadBusinessBio();
renderCart();
