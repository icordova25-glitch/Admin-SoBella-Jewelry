const reviewItems = document.getElementById('reviewItems');
const checkoutForm = document.getElementById('checkoutForm');
const statusMessage = document.getElementById('statusMessage');
const paymentMethodSelect = document.getElementById('paymentMethod');
const cardFields = document.getElementById('cardFields');
const paymentStatusPanel = document.getElementById('paymentStatusPanel');
const shippingAddressSection = document.getElementById('shippingAddressSection');
const sameShippingAddressCheckbox = document.querySelector('input[name="sameShippingAddress"]');
const mailingAddressInput = document.getElementById('mailingAddress');
const shippingAddressInput = document.getElementById('shippingAddress');
const mailingAddressSuggestions = document.getElementById('mailingAddressSuggestions');
const shippingAddressSuggestions = document.getElementById('shippingAddressSuggestions');
const checkoutStatusStorageKey = 'sobella-last-payment-status';
const addressSearchTimers = new WeakMap();
const addressSearchControllers = new WeakMap();

function isApplePaySelected() {
  return paymentMethodSelect?.value === 'apple_pay';
}

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
  const selected = paymentMethodSelect.value;
  const isCard = selected === 'card';
  cardFields.hidden = !isCard;
  cardFields.querySelectorAll('input').forEach((input) => {
    input.disabled = !isCard;
    if (!isCard) {
      input.value = '';
    }
  });
}

function paymentMethodForApi(selectedMethod) {
  return selectedMethod;
}

function calculateOrderTotals(cart) {
  const subtotal = cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
  const shipping = subtotal > 0 ? 12 : 0;
  const total = subtotal + shipping;
  return { subtotal, shipping, total };
}

async function requestApplePayFromIOS(cart) {
  if (!window.PaymentRequest) {
    throw new Error('Apple Pay is only available in supported iOS/Safari browsers.');
  }

  const { subtotal, shipping, total } = calculateOrderTotals(cart);
  const methodData = [
    {
      supportedMethods: 'https://apple.com/apple-pay',
      data: {
        version: 3,
        merchantIdentifier: 'merchant.sobella.demo',
        merchantCapabilities: ['supports3DS'],
        supportedNetworks: ['visa', 'masterCard', 'amex', 'discover'],
        countryCode: 'US',
      },
    },
  ];

  const details = {
    displayItems: [
      { label: 'Items', amount: { currency: 'USD', value: subtotal.toFixed(2) } },
      { label: 'Shipping', amount: { currency: 'USD', value: shipping.toFixed(2) } },
    ],
    total: {
      label: 'SoBella Jewelry',
      amount: { currency: 'USD', value: total.toFixed(2) },
    },
  };

  const request = new PaymentRequest(methodData, details, {
    requestPayerName: true,
    requestPayerEmail: true,
  });

  const canPay = await request.canMakePayment().catch(() => false);
  if (!canPay) {
    throw new Error('Apple Pay is not available on this device/account.');
  }

  const paymentResponse = await request.show();
  await paymentResponse.complete('success');
  return paymentResponse;
}

async function fetchAddressSuggestions(query, signal) {
  const endpoint = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&countrycodes=us&limit=6&q=${encodeURIComponent(query)}`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });
  if (!response.ok) {
    return [];
  }
  const results = await response.json();
  if (!Array.isArray(results)) {
    return [];
  }
  return results.map((item) => item.display_name).filter(Boolean);
}

function bindAddressSuggestionSearch(inputEl, datalistEl) {
  if (!inputEl || !datalistEl) {
    return;
  }

  inputEl.addEventListener('input', () => {
    const query = inputEl.value.trim();

    const prevTimer = addressSearchTimers.get(inputEl);
    if (prevTimer) {
      clearTimeout(prevTimer);
    }

    const prevController = addressSearchControllers.get(inputEl);
    if (prevController) {
      prevController.abort();
    }

    if (query.length < 4) {
      datalistEl.innerHTML = '';
      return;
    }

    const timer = setTimeout(async () => {
      const controller = new AbortController();
      addressSearchControllers.set(inputEl, controller);
      try {
        const suggestions = await fetchAddressSuggestions(query, controller.signal);
        datalistEl.innerHTML = suggestions
          .map((value) => `<option value="${value.replace(/"/g, '&quot;')}"></option>`)
          .join('');
      } catch (error) {
        datalistEl.innerHTML = '';
      }
    }, 250);

    addressSearchTimers.set(inputEl, timer);
  });
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

  statusMessage.textContent = isApplePaySelected() ? 'Opening Apple Pay...' : 'Preparing secure checkout...';

  let applePayResult = null;
  if (isApplePaySelected()) {
    try {
      applePayResult = await requestApplePayFromIOS(cart);
    } catch (error) {
      const failureMessage = error?.message || 'Payment was not successful.';
      statusMessage.textContent = failureMessage;
      showPaymentStatus(failureMessage, false);
      setCheckoutStatusForShop('error', 'Payment was not successful.');
      return;
    }
  }

  const payload = {
    customerName: checkoutForm.customerName.value || applePayResult?.payerName || '',
    email: checkoutForm.email.value || applePayResult?.payerEmail || '',
    paymentMethod: paymentMethodForApi(checkoutForm.paymentMethod.value),
    paymentWallet: checkoutForm.paymentMethod.value === 'apple_pay' ? 'apple_pay' : null,
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
    cardData: isApplePaySelected() ? {} : {
      cardNumber: checkoutForm.cardNumber?.value || '',
      expiry: checkoutForm.expiry?.value || '',
      cvc: checkoutForm.cvc?.value || '',
    },
    items: cart.map((item) => ({ sku: item.sku, quantity: item.quantity })),
  };

  const endpoint = isApplePaySelected() ? '/api/orders' : '/api/checkout/create-session';
  const response = await fetch(endpoint, {
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

bindAddressSuggestionSearch(mailingAddressInput, mailingAddressSuggestions);
bindAddressSuggestionSearch(shippingAddressInput, shippingAddressSuggestions);

loadCheckoutInfo();
updateCardFieldsVisibility();
updateShippingAddressVisibility();
renderReview();
