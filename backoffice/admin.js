const adminProducts = document.getElementById('adminProducts');
const productForm = document.getElementById('productForm');
const bioForm = document.getElementById('bioForm');
const bioText = document.getElementById('bioText');
const bioCount = document.getElementById('bioCount');
const bankForm = document.getElementById('bankForm');
const loginForm = document.getElementById('loginForm');
const adminUsername = document.getElementById('adminUsername');
const adminPassword = document.getElementById('adminPassword');
const loginStatus = document.getElementById('loginStatus');
const logoutButton = document.getElementById('logoutButton');
const loginSubmitButton = document.getElementById('loginSubmitButton');
const adminLoginHeading = document.getElementById('adminLoginHeading');
const credentialsForm = document.getElementById('credentialsForm');
const newAdminUsername = document.getElementById('newAdminUsername');
const newAdminPassword = document.getElementById('newAdminPassword');
const credentialsStatus = document.getElementById('credentialsStatus');
const productRefreshChannel = window.BroadcastChannel ? new BroadcastChannel('sobella-products') : null;
const apiBase = window.location.protocol === 'file:' ? 'http://localhost:3001' : window.location.origin;
const backofficeAuth = window.sobellaBackofficeAuth;
let hasAuthenticatedSession = false;

function apiUrl(path) {
  return `${apiBase}${path}`;
}

function setLoginStatus(message, isError = false) {
  if (!loginStatus) {
    return;
  }
  loginStatus.textContent = message;
  loginStatus.style.color = isError ? '#c0392b' : '';
}

function setCredentialsStatus(message, isError = false) {
  if (!credentialsStatus) {
    return;
  }
  credentialsStatus.textContent = message || '';
  credentialsStatus.classList.remove('success', 'error', 'show');
  if (!message) {
    return;
  }
  credentialsStatus.classList.add('show');
  credentialsStatus.classList.add(isError ? 'error' : 'success');
}

function isStrongPassword(password) {
  if (typeof password !== 'string') {
    return false;
  }
  if (password.length < 8) {
    return false;
  }
  if (!/[a-z]/.test(password)) {
    return false;
  }
  if (!/[A-Z]/.test(password)) {
    return false;
  }
  if (!/[0-9]/.test(password)) {
    return false;
  }
  return /[^A-Za-z0-9]/.test(password);
}

function updateLoginForm() {
  const credentials = backofficeAuth?.getCredentials();
  if (adminUsername) {
    adminUsername.value = credentials?.username || '';
  }
  if (adminPassword) {
    adminPassword.value = credentials?.password || '';
  }
  if (logoutButton) {
    logoutButton.disabled = !credentials;
  }

  if (hasAuthenticatedSession) {
    setLoginStatus(credentials ? `Signed in as ${credentials.username}` : 'Signed in.');
  } else {
    setLoginStatus(credentials ? `Signed in as ${credentials.username}` : 'Sign in to load and update backoffice data.');
  }

  const hideLoginFields = Boolean(credentials && hasAuthenticatedSession);
  if (adminLoginHeading) {
    adminLoginHeading.style.display = hideLoginFields ? 'none' : '';
  }
  if (adminUsername) {
    adminUsername.style.display = hideLoginFields ? 'none' : '';
  }
  if (adminPassword) {
    adminPassword.style.display = hideLoginFields ? 'none' : '';
  }
  if (loginSubmitButton) {
    loginSubmitButton.style.display = hideLoginFields ? 'none' : '';
  }
  if (newAdminUsername && credentials?.username) {
    newAdminUsername.value = credentials.username;
  }
}

async function backofficeRequest(path, options = {}) {
  if (!backofficeAuth) {
    throw new Error('Backoffice auth helper is unavailable.');
  }
  const response = await backofficeAuth.fetch(apiUrl(path), options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response;
}

function notifyProductRefresh() {
  if (productRefreshChannel) {
    productRefreshChannel.postMessage({ type: 'refresh' });
  }
  localStorage.setItem('sobella-product-refresh', String(Date.now()));
}

async function loadBusinessBio() {
  const response = await backofficeRequest('/api/business-bio');
  const data = await response.json();
  if (bioText) {
    bioText.value = data.bio || '';
    if (bioCount) {
      bioCount.textContent = `${(data.bio || '').length} / 500`;
    }
  }
}

async function loadBankInfo() {
  const response = await backofficeRequest('/api/business-bank-info');
  const data = await response.json();
  if (bankForm) {
    bankForm.querySelector('#accountHolder').value = data.accountHolder || '';
    bankForm.querySelector('#bankName').value = data.bankName || '';
    bankForm.querySelector('#accountNumber').value = data.accountNumber || '';
    bankForm.querySelector('#routingNumber').value = data.routingNumber || '';
  }
}

async function loadAdminProducts() {
  const response = await backofficeRequest('/api/admin/products');
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
  const response = await backofficeRequest(`/api/admin/products/${sku}`, {
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

async function loadBackofficeData() {
  try {
    await Promise.all([loadAdminProducts(), loadBusinessBio(), loadBankInfo()]);
    hasAuthenticatedSession = true;
    updateLoginForm();
  } catch (error) {
    hasAuthenticatedSession = false;
    updateLoginForm();
    setLoginStatus(error.message || 'Sign in required.', true);
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
    try {
      await backofficeRequest('/api/business-bio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: bioText.value.slice(0, 500) }),
      });
      setLoginStatus('Business bio saved.');
      loadBusinessBio();
    } catch (error) {
      setLoginStatus(error.message, true);
    }
  });
}

if (bankForm) {
  bankForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await backofficeRequest('/api/business-bank-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountHolder: bankForm.querySelector('#accountHolder').value,
          bankName: bankForm.querySelector('#bankName').value,
          accountNumber: bankForm.querySelector('#accountNumber').value,
          routingNumber: bankForm.querySelector('#routingNumber').value,
        }),
      });
      setLoginStatus('Bank info saved.');
      loadBankInfo();
    } catch (error) {
      setLoginStatus(error.message, true);
    }
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

  try {
    await backofficeRequest('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    productForm.reset();
    setLoginStatus('Product created.');
    loadAdminProducts();
    notifyProductRefresh();
  } catch (error) {
    setLoginStatus(error.message, true);
  }
});

if (loginForm) {
  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const username = adminUsername?.value.trim();
    const password = adminPassword?.value.trim();
    if (!username || !password) {
      setLoginStatus('Enter a username and password.', true);
      return;
    }
    backofficeAuth.setCredentials(username, password);
    updateLoginForm();
    loadBackofficeData();
  });
}

if (logoutButton) {
  logoutButton.addEventListener('click', () => {
    backofficeAuth.clearCredentials();
    hasAuthenticatedSession = false;
    if (adminPassword) {
      adminPassword.value = '';
    }
    updateLoginForm();
    adminProducts.innerHTML = '<p>Sign in to view products.</p>';
  });
}

if (credentialsForm) {
  credentialsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = newAdminUsername?.value.trim();
    const password = newAdminPassword?.value || '';

    if (!username) {
      setLoginStatus('Enter a new username.', true);
      setCredentialsStatus('Enter a new username.', true);
      return;
    }

    if (!isStrongPassword(password)) {
      setLoginStatus('Password must be 8+ chars with uppercase, lowercase, number, and special character.', true);
      setCredentialsStatus('Password must be 8+ chars with uppercase, lowercase, number, and special character.', true);
      return;
    }

    try {
      await backofficeRequest('/api/backoffice/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      backofficeAuth.setCredentials(username, password);
      hasAuthenticatedSession = true;
      if (newAdminPassword) {
        newAdminPassword.value = '';
      }
      updateLoginForm();
      setLoginStatus('Backoffice credentials updated.');
      setCredentialsStatus('Credentials updated successfully.');
    } catch (error) {
      setLoginStatus(error.message || 'Unable to update credentials.', true);
      setCredentialsStatus(error.message || 'Unable to update credentials.', true);
    }
  });
}

updateLoginForm();
loadBackofficeData();
