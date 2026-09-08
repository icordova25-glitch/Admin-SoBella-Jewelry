const loginForm = document.getElementById('loginForm');
const adminUsername = document.getElementById('adminUsername');
const adminPassword = document.getElementById('adminPassword');
const loginStatus = document.getElementById('loginStatus');
const clearSavedLoginButton = document.getElementById('clearSavedLogin');
const useSavedLoginButton = document.getElementById('useSavedLogin');
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
  if (credentials?.password && adminPassword) {
    adminPassword.value = credentials.password;
  }

  if (savedLoginNotice) {
    savedLoginNotice.hidden = !credentials?.username;
    savedLoginNotice.textContent = credentials?.username ? `Saved sign-in found for ${credentials.username}.` : '';
  }

  if (useSavedLoginButton) {
    useSavedLoginButton.hidden = !credentials?.username || !credentials?.password;
  }
}

async function verifyCredentials() {
  const response = await backofficeAuth.fetch(`${apiBase}/api/admin/products`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to sign in.');
  }
}

async function continueWithSavedCredentials() {
  const credentials = backofficeAuth?.getCredentials();
  if (!credentials?.username || !credentials?.password) {
    setLoginStatus('No saved login is available.', true);
    return;
  }

  setLoginStatus('Checking saved login...');
  try {
    await verifyCredentials();
    window.location.href = getReturnToPath();
  } catch (error) {
    backofficeAuth.clearCredentials();
    populateSavedCredentials();
    setLoginStatus(error.message || 'Saved login is no longer valid.', true);
  }
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

    backofficeAuth.setCredentials(username, password);
    setLoginStatus('Signing in...');

    try {
      await verifyCredentials();
      window.location.href = getReturnToPath();
    } catch (error) {
      backofficeAuth.clearCredentials();
      setLoginStatus(error.message || 'Unable to sign in.', true);
    }
  });
}

if (clearSavedLoginButton) {
  clearSavedLoginButton.addEventListener('click', () => {
    backofficeAuth.clearCredentials();
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

if (useSavedLoginButton) {
  useSavedLoginButton.addEventListener('click', () => {
    continueWithSavedCredentials();
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