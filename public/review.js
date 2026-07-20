const reviewItems = document.getElementById('reviewItems');
const checkoutForm = document.getElementById('checkoutForm');
const statusMessage = document.getElementById('statusMessage');
const paymentMethodSelect = document.getElementById('paymentMethod');
const cardFields = document.getElementById('cardFields');
const paymentStatusPanel = document.getElementById('paymentStatusPanel');
const shippingAddressSection = document.getElementById('shippingAddressSection');
const sameShippingAddressCheckbox = document.querySelector('input[name="sameShippingAddress"]');
const checkoutStatusStorageKey = 'sobella-last-payment-status';

function setCheckoutStatusForShop(status, message) {
  localStorage.setItem(
    checkoutStatusStorageKey,
    JSON.stringify({
      status,
      message,
      createdAt: Date.now(),
    }),
  );
}

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem('sobella-cart') || '[]');
  } catch (error) {
    console.warn('Unable to parse cart', error);
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem('sobella-cart', JSON.stringify(cart));
}

function saveCheckoutInfo() {
  const fields = {
    customerName: checkoutForm.customerName.value,
    email: checkoutForm.email.value,
    mailingAddress: checkoutForm.mailingAddress?.value || '',
    mailingCity: checkoutForm.mailingCity?.value || '',
    mailingState: checkoutForm.mailingState?.value || '',
    mailingZip: checkoutForm.mailingZip?.value || '',
    sameShippingAddress: sameShippingAddressCheckbox?.checked || false,
    shippingAddress: checkoutForm.shippingAddress?.value || '',
    shippingCity: checkoutForm.shippingCity?.value || '',
    shippingState: checkoutForm.shippingState?.value || '',
    shippingZip: checkoutForm.shippingZip?.value || '',
    paymentMethod: checkoutForm.paymentMethod?.value || 'card',
    cardNumber: checkoutForm.cardNumber?.value || '',
    expiry: checkoutForm.expiry?.value || '',
    cvc: checkoutForm.cvc?.value || '',
  };
  localStorage.setItem('sobella-checkout-info', JSON.stringify(fields));
}

function loadCheckoutInfo() {
  try {
    const raw = localStorage.getItem('sobella-checkout-info');
    if (!raw) {
      return;
    }
    const data = JSON.parse(raw);
    if (!data) {
      return;
    }
    checkoutForm.customerName.value = data.customerName || '';
    checkoutForm.email.value = data.email || '';
    checkoutForm.mailingAddress.value = data.mailingAddress || '';
    checkoutForm.mailingCity.value = data.mailingCity || '';
    checkoutForm.mailingState.value = data.mailingState || '';
    checkoutForm.mailingZip.value = data.mailingZip || '';
    if (sameShippingAddressCheckbox) {
      sameShippingAddressCheckbox.checked = data.sameShippingAddress !== false;
    }
    checkoutForm.shippingAddress.value = data.shippingAddress || '';
    checkoutForm.shippingCity.value = data.shippingCity || '';
    checkoutForm.shippingState.value = data.shippingState || '';
    checkoutForm.shippingZip.value = data.shippingZip || '';
    if (checkoutForm.paymentMethod) {
      checkoutForm.paymentMethod.value = data.paymentMethod || 'card';
    }
    checkoutForm.cardNumber.value = data.cardNumber || '';
    checkoutForm.expiry.value = data.expiry || '';
    checkoutForm.cvc.value = data.cvc || '';
  } catch (error) {
    console.warn('Unable to load saved checkout info', error);
  }
}

function updateCardFieldsVisibility() {
  const isCard = paymentMethodSelect.value === 'card';
  cardFields.hidden = !isCard;
}

function updateShippingAddressVisibility() {
  if (!shippingAddressSection || !sameShippingAddressCheckbox) {
    return;
  }
  const sameAsMailing = sameShippingAddressCheckbox.checked;
  shippingAddressSection.hidden = sameAsMailing;
  if (sameAsMailing) {
    shippingAddressSection.querySelectorAll('input').forEach((input) => {
      input.value = '';
    });
  }
}

function showPaymentStatus(message, isSuccess) {
  paymentStatusPanel.hidden = false;
  paymentStatusPanel.textContent = message;
  paymentStatusPanel.className = `payment-status-panel ${isSuccess ? 'success' : 'error'}`;
}

function renderReview() {
  const cart = loadCart();
  if (!cart.length) {
    reviewItems.innerHTML = '<p>Your bag is empty. Return to the shop to add jewelry.</p>';
    return;
  }

  reviewItems.innerHTML = '';
  cart.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'order-card';
    card.innerHTML = `
      <div class="order-header">
        <strong>${item.name}</strong>
        <span>$${item.price * item.quantity}</span>
      </div>
      <div class="cart-quantity-controls">
        <button class="qty-btn" data-action="decrease" data-sku="${item.sku}">−</button>
        <span>${item.quantity}</span>
        <button class="qty-btn" data-action="increase" data-sku="${item.sku}">+</button>
      </div>
    `;
    card.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => updateQuantity(item.sku, button.dataset.action));
    });
    reviewItems.appendChild(card);
  });
}

function updateQuantity(sku, action) {
  const cart = loadCart();
  const target = cart.find((item) => item.sku === sku);
  if (!target) {
    return;
  }
  if (action === 'decrease') {
    target.quantity -= 1;
    if (target.quantity <= 0) {
      const filtered = cart.filter((item) => item.sku !== sku);
      saveCart(filtered);
      renderReview();
      return;
    }
  } else {
    target.quantity += 1;
  }
  saveCart(cart);
  renderReview();
}

checkoutForm.addEventListener('input', saveCheckoutInfo);
checkoutForm.addEventListener('change', saveCheckoutInfo);

checkoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const cart = loadCart();
  if (!cart.length) {
    statusMessage.textContent = 'Add at least one item to your bag first.';
    return;
  }

  statusMessage.textContent = 'Preparing secure checkout...';
  const payload = {
    customerName: checkoutForm.customerName.value,
    email: checkoutForm.email.value,
    paymentMethod: checkoutForm.paymentMethod.value,
    mailingAddress: {
      address: checkoutForm.mailingAddress?.value || '',
      city: checkoutForm.mailingCity?.value || '',
      state: checkoutForm.mailingState?.value || '',
      zip: checkoutForm.mailingZip?.value || '',
    },
    shippingAddress: sameShippingAddressCheckbox?.checked ? null : {
      address: checkoutForm.shippingAddress?.value || '',
      city: checkoutForm.shippingCity?.value || '',
      state: checkoutForm.shippingState?.value || '',
      zip: checkoutForm.shippingZip?.value || '',
    },
    cardData: {
      cardNumber: checkoutForm.cardNumber?.value || '',
      expiry: checkoutForm.expiry?.value || '',
      cvc: checkoutForm.cvc?.value || '',
    },
    items: cart.map((item) => ({ sku: item.sku, quantity: item.quantity })),
  };

  const response = await fetch('/api/checkout/create-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (!response.ok) {
    const failureMessage = result.error || 'Payment was not successful.';
    statusMessage.textContent = failureMessage;
    showPaymentStatus(failureMessage, false);
    setCheckoutStatusForShop('error', 'Payment was not successful.');
    return;
  }

  if (result.checkoutUrl) {
    statusMessage.textContent = 'Redirecting you to Stripe checkout...';
    showPaymentStatus('Payment processed successfully.', true);
    setCheckoutStatusForShop('success', 'Payment was successful.');
    window.location.assign(result.checkoutUrl);
    return;
  }

  statusMessage.textContent = `Order ${result.order.id} created successfully in demo mode.`;
  showPaymentStatus(result.paymentStatus || 'Payment processed successfully.', true);
  setCheckoutStatusForShop('success', 'Payment was successful.');
  saveCart([]);
  localStorage.removeItem('sobella-checkout-info');
  renderReview();
  checkoutForm.reset();
  updateCardFieldsVisibility();
});

if (paymentMethodSelect) {
  paymentMethodSelect.addEventListener('change', updateCardFieldsVisibility);
}

if (sameShippingAddressCheckbox) {
  sameShippingAddressCheckbox.addEventListener('change', updateShippingAddressVisibility);
}

loadCheckoutInfo();
updateCardFieldsVisibility();
updateShippingAddressVisibility();
renderReview();
