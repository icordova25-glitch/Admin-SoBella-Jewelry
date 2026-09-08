const loginForm = document.getElementById('loginForm');
const adminUsername = document.getElementById('adminUsername');
const adminPassword = document.getElementById('adminPassword');
const loginStatus = document.getElementById('loginStatus');
const clearSavedLoginButton = document.getElementById('clearSavedLogin');
const savedLoginNotice = document.getElementById('savedLoginNotice');
const loginDestination = document.getElementById('loginDestination');
const backofficeAuth = window.sobellaBackofficeAuth;
const apiBase = window.location.protocol === 'file:' ? 'http://localhost:3001' : window.location.origin;

function getReturnToPath() {
  const url = new URL(window.location.href);
  return backofficeAuth?.sanitizeReturnToPath(url.searchParams.get('returnTo') || 'admin.html') || 'admin.html';
}

function getDestinationLabel(returnToPath) {
  return returnToPath === 'orders.html' ? 'Order history' : 'Admin inventory';
}

function setLoginStatus(message, isError = false) {
  if (!loginStatus) {
    return;
  }
  loginStatus.textContent = message;
  loginStatus.style.color = isError ? '#c0392b' : '';
}

function populateSavedCredentials() {
  const credentials = backofficeAuth?.getCredentials();
  if (credentials?.username && adminUsername) {
    adminUsername.value = credentials.username;
  }

  if (savedLoginNotice) {
    savedLoginNotice.hidden = !credentials?.username;
    savedLoginNotice.textContent = credentials?.username ? `Last signed in as ${credentials.username}.` : '';
  }
}

async function verifyCredentials() {
  const username = adminUsername?.value.trim();
  const password = adminPassword?.value.trim();
  const response = await fetch(`${apiBase}/api/backoffice/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to sign in.');
  }
  return response.json().catch(() => ({}));
}

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = adminUsername?.value.trim();
    const password = adminPassword?.value.trim();
    if (!username || !password) {
      setLoginStatus('Enter a username and password.', true);
      return;
    }

    setLoginStatus('Signing in...');

    try {
      await verifyCredentials();
      backofficeAuth.setCredentials(username);
      window.location.href = getReturnToPath();
    } catch (error) {
      backofficeAuth.clearCredentials();
      populateSavedCredentials();
      setLoginStatus(error.message || 'Unable to sign in.', true);
    }
  });
}

if (clearSavedLoginButton) {
  clearSavedLoginButton.addEventListener('click', () => {
    backofficeAuth.clearCredentials();
    fetch(`${apiBase}/api/backoffice/session`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
    if (adminUsername) {
      adminUsername.value = '';
    }
    if (adminPassword) {
      adminPassword.value = '';
    }
    setLoginStatus('Saved login removed.');
    populateSavedCredentials();
  });
}

populateSavedCredentials();

if (loginDestination) {
  loginDestination.textContent = `Next destination: ${getDestinationLabel(getReturnToPath())}`;
}

const pageUrl = new URL(window.location.href);
const message = pageUrl.searchParams.get('message');
if (message) {
  setLoginStatus(message);
}

fetch(`${apiBase}/api/backoffice/session`, { credentials: 'same-origin' })
  .then((response) => response.json())
  .then((session) => {
    if (session?.authenticated) {
      window.location.href = getReturnToPath();
    }
  })
  .catch(() => {});