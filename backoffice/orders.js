const ordersList = document.getElementById('ordersList');
const apiBase = window.location.protocol === 'file:' ? 'http://localhost:3001' : window.location.origin;

function apiUrl(path) {
  return `${apiBase}${path}`;
}

async function loadOrders() {
  const response = await fetch(apiUrl('/api/orders'));
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

loadOrders();
