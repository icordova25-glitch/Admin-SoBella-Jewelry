const adminProducts = document.getElementById('adminProducts');
const productForm = document.getElementById('productForm');
const bioForm = document.getElementById('bioForm');
const bioText = document.getElementById('bioText');
const bioCount = document.getElementById('bioCount');
const bankForm = document.getElementById('bankForm');
const adminStatus = document.getElementById('adminStatus');
const logoutButton = document.getElementById('logoutButton');
const imageUploadInput = document.getElementById('imageUpload');
const removeImageInput = document.getElementById('removeImage');
const editingSkuInput = document.getElementById('editingSku');
const productSubmitButton = document.getElementById('productSubmitButton');
const cancelEditButton = document.getElementById('cancelEditButton');
const adminImageGallery = document.getElementById('adminImageGallery');
const heroSlidesAdmin = document.getElementById('heroSlidesAdmin');
const productRefreshChannel = window.BroadcastChannel ? new BroadcastChannel('sobella-products') : null;
const apiBase = window.location.protocol === 'file:' ? 'http://localhost:3001' : window.location.origin;
const backofficeAuth = window.sobellaBackofficeAuth;
const maxUploadMb = Number(window.SOBELLA_MAX_UPLOAD_MB || 25);

function apiUrl(path) {
  return `${apiBase}${path}`;
}

function setLoginStatus(message, isError = false) {
  if (!adminStatus) {
    return;
  }
  adminStatus.textContent = message;
  adminStatus.style.color = isError ? '#c0392b' : '';
}

function requireCredentials() {
  return fetch(`${apiBase}/api/backoffice/session`, { credentials: 'same-origin' })
    .then((response) => response.json())
    .then((session) => {
      if (!session?.authenticated) {
        backofficeAuth?.redirectToLogin('Please sign in to access the backoffice.');
        return null;
      }
      if (logoutButton) {
        logoutButton.disabled = false;
      }
      setLoginStatus(`Signed in as ${session.username}`);
      return session;
    });
}

async function backofficeRequest(path, options = {}) {
  if (!backofficeAuth) {
    throw new Error('Backoffice auth helper is unavailable.');
  }
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

function notifyProductRefresh() {
  if (productRefreshChannel) {
    productRefreshChannel.postMessage({ type: 'refresh' });
  }
  localStorage.setItem('sobella-product-refresh', String(Date.now()));
}

function resetProductForm() {
  productForm.reset();
  if (editingSkuInput) {
    editingSkuInput.value = '';
  }
  const skuField = document.getElementById('sku');
  if (skuField) {
    skuField.readOnly = false;
  }
  if (productSubmitButton) {
    productSubmitButton.textContent = 'Create product';
  }
  if (cancelEditButton) {
    cancelEditButton.hidden = true;
  }
}

function startEditingProduct(product) {
  if (editingSkuInput) {
    editingSkuInput.value = product.sku;
  }
  document.getElementById('sku').value = product.sku || '';
  document.getElementById('sku').readOnly = true;
  document.getElementById('name').value = product.name || '';
  document.getElementById('category').value = product.category || '';
  document.getElementById('description').value = product.description || '';
  document.getElementById('price').value = product.price ?? 0;
  document.getElementById('stock').value = product.stock ?? 0;
  if (removeImageInput) {
    removeImageInput.checked = false;
  }
  if (imageUploadInput) {
    imageUploadInput.value = '';
  }
  if (productSubmitButton) {
    productSubmitButton.textContent = 'Save product';
  }
  if (cancelEditButton) {
    cancelEditButton.hidden = false;
  }
  setLoginStatus(`Editing ${product.name}. Choose a new image to replace the current one.`);
  productForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

async function updateHeroSlide(slideId, payload) {
  const response = await backofficeRequest(`/api/admin/hero-slides/${encodeURIComponent(slideId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

async function loadHeroSlides() {
  if (!heroSlidesAdmin) {
    return;
  }

  const response = await backofficeRequest('/api/admin/hero-slides');
  const slides = await response.json();
  renderHeroSlidesAdmin(slides);
}

function renderHeroSlidesAdmin(slides) {
  if (!heroSlidesAdmin) {
    return;
  }

  heroSlidesAdmin.innerHTML = '';

  slides.forEach((slide, index) => {
    const card = document.createElement('article');
    card.className = 'admin-slide-card';
    const isLogoSlot = index === 0;
    card.innerHTML = `
      <img class="admin-slide-image" src="${slide.image}" alt="${slide.alt}" />
      <div class="admin-slide-meta">
        <h3>Slide ${index + 1}${isLogoSlot ? ' · Logo default slot' : ''}</h3>
        <p>${slide.alt}</p>
      </div>
      <label class="inventory-btn secondary admin-slide-upload">
        <span>${isLogoSlot ? 'Replace logo slide' : 'Upload replacement'}</span>
        <input type="file" accept="image/*" hidden />
      </label>
      <button type="button" class="inventory-btn secondary" data-action="preview">View</button>
      <button type="button" class="inventory-btn" data-action="reset">Restore default</button>
    `;

    const fileInput = card.querySelector('input[type="file"]');
    const previewButton = card.querySelector('[data-action="preview"]');
    const resetButton = card.querySelector('[data-action="reset"]');

    if (previewButton) {
      previewButton.addEventListener('click', () => showImagePreview(slide.image));
    }

    if (resetButton) {
      resetButton.addEventListener('click', async () => {
        try {
          await updateHeroSlide(slide.id, { removeImage: true });
          setLoginStatus(`Restored default image for slide ${index + 1}.`);
          loadHeroSlides();
        } catch (error) {
          setLoginStatus(error.message, true);
        }
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', async () => {
        const imageFile = fileInput.files?.[0];
        if (!imageFile) {
          return;
        }

        const maxUploadBytes = maxUploadMb * 1024 * 1024;
        if (imageFile.size > maxUploadBytes) {
          setLoginStatus(`Image too large. Please upload a file up to ${maxUploadMb}MB.`, true);
          fileInput.value = '';
          return;
        }

        try {
          const dataUrl = await readFileAsDataUrl(imageFile);
          await updateHeroSlide(slide.id, {
            imageFile: {
              filename: imageFile.name,
              content: dataUrl.split(',')[1] || '',
            },
            alt: slide.alt,
          });
          setLoginStatus(`Updated hero slide ${index + 1}.`);
          loadHeroSlides();
        } catch (error) {
          setLoginStatus(error.message, true);
        } finally {
          fileInput.value = '';
        }
      });
    }

    heroSlidesAdmin.appendChild(card);
  });
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
  if (adminImageGallery) {
    adminImageGallery.innerHTML = '';
  }

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
        <th>Description</th>
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
      <td>${product.description || ''}</td>
      <td>${product.category}</td>
      <td>$${product.price}</td>
      <td>${product.stock}</td>
      <td>
        <button class="inventory-btn secondary" data-action="edit" data-sku="${product.sku}">Edit</button>
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
        if (button.dataset.action === 'edit') {
          startEditingProduct(product);
          return;
        }
        updateStock(product.sku, button.dataset.action);
      });
    });
    tbody.appendChild(row);
  });

  adminProducts.appendChild(table);
  renderAdminImageGallery(products);
}

function renderAdminImageGallery(products) {
  if (!adminImageGallery) {
    return;
  }

  if (!products.length) {
    adminImageGallery.innerHTML = '<p>No products available for gallery preview.</p>';
    return;
  }

  products.forEach((product) => {
    const card = document.createElement('article');
    card.className = 'admin-gallery-card';
    const imageMarkup = product.image
      ? `<img class="admin-gallery-image" src="${product.image}" alt="${product.name}" />`
      : '<div class="admin-gallery-empty">No image uploaded yet</div>';

    card.innerHTML = `
      ${imageMarkup}
      <h3>${product.name}</h3>
      <p>${product.description || 'No product description set yet.'}</p>
      <div class="admin-gallery-actions">
        ${product.image ? '<button type="button" class="inventory-btn secondary" data-action="preview">View</button>' : ''}
        <button type="button" class="inventory-btn" data-action="replace">${product.image ? 'Replace image' : 'Upload image'}</button>
      </div>
    `;

    const viewButton = card.querySelector('[data-action="preview"]');
    if (viewButton && product.image) {
      viewButton.addEventListener('click', () => showImagePreview(product.image));
    }

    const replaceButton = card.querySelector('[data-action="replace"]');
    if (replaceButton) {
      replaceButton.addEventListener('click', () => {
        startEditingProduct(product);
        imageUploadInput?.focus();
      });
    }

    adminImageGallery.appendChild(card);
  });
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
    await Promise.all([loadAdminProducts(), loadBusinessBio(), loadBankInfo(), loadHeroSlides()]);
  } catch (error) {
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
  const editingSku = editingSkuInput?.value || '';
  const imageFile = imageUploadInput?.files[0];
  const payload = {
    sku: document.getElementById('sku').value,
    name: document.getElementById('name').value,
    category: document.getElementById('category').value,
    description: document.getElementById('description').value,
    price: Number(document.getElementById('price').value),
    stock: Number(document.getElementById('stock').value),
    removeImage: Boolean(removeImageInput?.checked),
  };

  if (imageFile) {
    const maxUploadBytes = maxUploadMb * 1024 * 1024;
    if (imageFile.size > maxUploadBytes) {
      setLoginStatus(`Image too large. Please upload a file up to ${maxUploadMb}MB.`, true);
      return;
    }
    const dataUrl = await readFileAsDataUrl(imageFile);
    payload.imageFile = {
      filename: imageFile.name,
      content: dataUrl.split(',')[1] || '',
    };
  }

  try {
    await backofficeRequest(editingSku ? `/api/admin/products/${encodeURIComponent(editingSku)}` : '/api/admin/products', {
      method: editingSku ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    resetProductForm();
    setLoginStatus(editingSku ? 'Product updated.' : 'Product created.');
    loadAdminProducts();
    notifyProductRefresh();
  } catch (error) {
    setLoginStatus(error.message, true);
  }
});

if (cancelEditButton) {
  cancelEditButton.addEventListener('click', () => {
    resetProductForm();
    setLoginStatus('Edit cancelled.');
  });
}

if (logoutButton) {
  logoutButton.addEventListener('click', () => {
    backofficeAuth.clearCredentials();
    fetch(`${apiBase}/api/backoffice/session`, { method: 'DELETE', credentials: 'same-origin' })
      .finally(() => {
        backofficeAuth.redirectToLogin('You have been signed out.');
      });
  });
}

requireCredentials().then((session) => {
  if (session) {
    loadBackofficeData();
  }
});
