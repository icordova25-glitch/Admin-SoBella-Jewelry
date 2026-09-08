const ordersList = document.getElementById('ordersList');
const ordersLoginStatus = document.getElementById('ordersLoginStatus');
const ordersLogoutButton = document.getElementById('ordersLogoutButton');
const apiBase = window.location.protocol === 'file:' ? 'http://localhost:3001' : window.location.origin;
const backofficeAuth = window.sobellaBackofficeAuth;

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

function requireCredentials() {
  return fetch(`${apiBase}/api/backoffice/session`, { credentials: 'same-origin' })
    .then((response) => response.json())
    .then((session) => {
      if (!session?.authenticated) {
        backofficeAuth?.redirectToLogin('Please sign in to view order history.');
        return null;
      }
      if (ordersLogoutButton) {
        ordersLogoutButton.disabled = false;
      }
      setOrdersStatus(`Signed in as ${session.username}`);
      return session;
    });
}

async function backofficeRequest(path, options = {}) {
  const response = await backofficeAuth.fetch(apiUrl(path), options);
  if (response.status === 401) {
    backofficeAuth.redirectToLogin('Your session expired. Please sign in again.');
    throw new Error('Authentication required');
  }
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
  } catch (error) {
    throw error;
  }
}

if (ordersLogoutButton) {
  ordersLogoutButton.addEventListener('click', () => {
    backofficeAuth.clearCredentials();
    fetch(`${apiBase}/api/backoffice/session`, { method: 'DELETE', credentials: 'same-origin' })
      .finally(() => {
        backofficeAuth.redirectToLogin('You have been signed out.');
      });
  });
}

requireCredentials().then((session) => {
  if (!session) {
    return;
  }
  loadOrdersWithAuthState().catch((error) => {
    setOrdersStatus(error.message, true);
    ordersList.innerHTML = '<p>Unable to load order history.</p>';
  });
});
