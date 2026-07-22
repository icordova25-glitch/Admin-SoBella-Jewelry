const ordersList = document.getElementById('ordersList');
const ordersLoginForm = document.getElementById('ordersLoginForm');
const ordersUsername = document.getElementById('ordersUsername');
const ordersPassword = document.getElementById('ordersPassword');
const ordersLoginStatus = document.getElementById('ordersLoginStatus');
const ordersLogoutButton = document.getElementById('ordersLogoutButton');
const ordersLoginSubmitButton = document.getElementById('ordersLoginSubmitButton');
const ordersLoginHeading = document.getElementById('ordersLoginHeading');
const apiBase = window.location.protocol === 'file:' ? 'http://localhost:3001' : window.location.origin;
const backofficeAuth = window.sobellaBackofficeAuth;
let hasAuthenticatedSession = false;

function apiUrl(path) {
  return `${apiBase}${path}`;
}

function setOrdersStatus(message, isError = false) {
  if (!ordersLoginStatus) {
    return;
  }
  ordersLoginStatus.textContent = message;
  ordersLoginStatus.style.color = isError ? '#c0392b' : '';
}

function updateOrdersLoginForm() {
  const credentials = backofficeAuth?.getCredentials();
  if (ordersUsername) {
    ordersUsername.value = credentials?.username || '';
  }
  if (ordersPassword) {
    ordersPassword.value = credentials?.password || '';
  }
  if (ordersLogoutButton) {
    ordersLogoutButton.disabled = !credentials;
  }

  if (hasAuthenticatedSession) {
    setOrdersStatus(credentials ? `Signed in as ${credentials.username}` : 'Signed in.');
  } else {
    setOrdersStatus(credentials ? `Signed in as ${credentials.username}` : 'Sign in to load order history.');
  }

  const hideLoginFields = Boolean(credentials && hasAuthenticatedSession);
  if (ordersLoginHeading) {
    ordersLoginHeading.style.display = hideLoginFields ? 'none' : '';
  }
  if (ordersUsername) {
    ordersUsername.style.display = hideLoginFields ? 'none' : '';
  }
  if (ordersPassword) {
    ordersPassword.style.display = hideLoginFields ? 'none' : '';
  }
  if (ordersLoginSubmitButton) {
    ordersLoginSubmitButton.style.display = hideLoginFields ? 'none' : '';
  }
}

async function backofficeRequest(path, options = {}) {
  const response = await backofficeAuth.fetch(apiUrl(path), options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response;
}

async function loadOrders() {
  const response = await backofficeRequest('/api/orders');
  const orders = await response.json();
  ordersList.innerHTML = '';

  if (!orders.length) {
    ordersList.innerHTML = '<p>No orders yet.</p>';
    return;
  }

  const cards = orders.map((order) => `
    <article class="order-card">
      <div class="order-header">
        <strong>${order.id}</strong>
        <span>${order.status}</span>
      </div>
      <p>${order.customerName} • ${order.email}</p>
      <p>Total: $${order.total}</p>
      <ul>
        ${order.items.map((item) => `<li>${item.name} × ${item.quantity}</li>`).join('')}
      </ul>
    </article>
  `).join('');

  ordersList.innerHTML = cards;
}

async function loadOrdersWithAuthState() {
  try {
    await loadOrders();
    hasAuthenticatedSession = true;
    updateOrdersLoginForm();
  } catch (error) {
    hasAuthenticatedSession = false;
    updateOrdersLoginForm();
    throw error;
  }
}

if (ordersLoginForm) {
  ordersLoginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const username = ordersUsername?.value.trim();
    const password = ordersPassword?.value.trim();
    if (!username || !password) {
      setOrdersStatus('Enter a username and password.', true);
      return;
    }
    backofficeAuth.setCredentials(username, password);
    updateOrdersLoginForm();
    loadOrdersWithAuthState().catch((error) => setOrdersStatus(error.message, true));
  });
}

if (ordersLogoutButton) {
  ordersLogoutButton.addEventListener('click', () => {
    backofficeAuth.clearCredentials();
    hasAuthenticatedSession = false;
    if (ordersPassword) {
      ordersPassword.value = '';
    }
    updateOrdersLoginForm();
    ordersList.innerHTML = '<p>Sign in to load order history.</p>';
  });
}

updateOrdersLoginForm();
loadOrdersWithAuthState().catch((error) => {
  setOrdersStatus(error.message, true);
  ordersList.innerHTML = '<p>Unable to load order history.</p>';
});
