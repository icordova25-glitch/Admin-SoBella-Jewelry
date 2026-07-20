const adminProducts = document.getElementById('adminProducts');
const productForm = document.getElementById('productForm');
const bioForm = document.getElementById('bioForm');
const bioText = document.getElementById('bioText');
const bioCount = document.getElementById('bioCount');
const bankForm = document.getElementById('bankForm');
const productRefreshChannel = window.BroadcastChannel ? new BroadcastChannel('sobella-products') : null;
const apiBase = window.location.protocol === 'file:' ? 'http://localhost:3001' : window.location.origin;

function apiUrl(path) {
  return `${apiBase}${path}`;
}

function notifyProductRefresh() {
  if (productRefreshChannel) {
    productRefreshChannel.postMessage({ type: 'refresh' });
  }
  localStorage.setItem('sobella-product-refresh', String(Date.now()));
}

async function loadBusinessBio() {
  const response = await fetch(apiUrl('/api/business-bio'));
  const data = await response.json();
  if (bioText) {
    bioText.value = data.bio || '';
    if (bioCount) {
      bioCount.textContent = `${(data.bio || '').length} / 500`;
    }
  }
}

async function loadBankInfo() {
  const response = await fetch(apiUrl('/api/business-bank-info'));
  const data = await response.json();
  if (bankForm) {
    bankForm.querySelector('#accountHolder').value = data.accountHolder || '';
    bankForm.querySelector('#bankName').value = data.bankName || '';
    bankForm.querySelector('#accountNumber').value = data.accountNumber || '';
    bankForm.querySelector('#routingNumber').value = data.routingNumber || '';
  }
}

async function loadAdminProducts() {
  const response = await fetch(apiUrl('/api/admin/products'));
  const products = await response.json();
  adminProducts.innerHTML = '';

  if (!products.length) {
    adminProducts.innerHTML = '<p>No products available.</p>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'inventory-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>SKU</th>
        <th>Name</th>
        <th>Category</th>
        <th>Price</th>
        <th>Stock</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');
  products.forEach((product) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${product.sku}</td>
      <td>
        <div class="product-name-cell">
          <span>${product.name}</span>
          ${product.image ? `<button class="inventory-btn secondary" data-action="preview" data-image="${product.image}">Preview</button>` : ''}
        </div>
      </td>
      <td>${product.category}</td>
      <td>$${product.price}</td>
      <td>${product.stock}</td>
      <td>
        <button class="inventory-btn" data-action="restock" data-sku="${product.sku}">+1</button>
        <button class="inventory-btn" data-action="decrease" data-sku="${product.sku}">-1</button>
        <button class="inventory-btn delete" data-action="delete" data-sku="${product.sku}">×</button>
      </td>
    `;
    row.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.action === 'preview') {
          showImagePreview(button.dataset.image);
          return;
        }
        updateStock(product.sku, button.dataset.action);
      });
    });
    tbody.appendChild(row);
  });

  adminProducts.appendChild(table);
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
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

async function updateStock(sku, action) {
  const response = await fetch(apiUrl(`/api/admin/products/${sku}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stock: action === 'restock' ? 1 : -1, operation: action }),
  });
  const result = await response.json();
  if (result.success || result.deleted) {
    loadAdminProducts();
    notifyProductRefresh();
  }
}

if (bioForm && bioText) {
  bioText.addEventListener('input', () => {
    if (bioCount) {
      bioCount.textContent = `${bioText.value.length} / 500`;
    }
  });

  bioForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await fetch(apiUrl('/api/business-bio'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: bioText.value.slice(0, 500) }),
    });
    loadBusinessBio();
  });
}

if (bankForm) {
  bankForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await fetch(apiUrl('/api/business-bank-info'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountHolder: bankForm.querySelector('#accountHolder').value,
        bankName: bankForm.querySelector('#bankName').value,
        accountNumber: bankForm.querySelector('#accountNumber').value,
        routingNumber: bankForm.querySelector('#routingNumber').value,
      }),
    });
    loadBankInfo();
  });
}

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const imageFile = document.getElementById('imageUpload').files[0];
  const payload = {
    sku: document.getElementById('sku').value,
    name: document.getElementById('name').value,
    category: document.getElementById('category').value,
    description: document.getElementById('description').value,
    price: Number(document.getElementById('price').value),
    stock: Number(document.getElementById('stock').value),
  };

  if (imageFile) {
    const dataUrl = await readFileAsDataUrl(imageFile);
    payload.imageFile = {
      filename: imageFile.name,
      content: dataUrl.split(',')[1] || '',
    };
  }

  await fetch(apiUrl('/api/admin/products'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  productForm.reset();
  loadAdminProducts();
  notifyProductRefresh();
});

loadAdminProducts();
loadBusinessBio();
loadBankInfo();
