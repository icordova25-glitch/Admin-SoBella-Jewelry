const BACKOFFICE_AUTH_KEY = 'sobella-backoffice-auth';

function toBasicAuthToken(username, password) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function getCredentials() {
  try {
    const raw = localStorage.getItem(BACKOFFICE_AUTH_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed.username || !parsed.password) {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function setCredentials(username, password) {
  localStorage.setItem(BACKOFFICE_AUTH_KEY, JSON.stringify({ username, password }));
}

function clearCredentials() {
  localStorage.removeItem(BACKOFFICE_AUTH_KEY);
}

function parseCredentialParams(searchParams) {
  const username =
    searchParams.get('username') ||
    searchParams.get('user') ||
    searchParams.get('u') ||
    searchParams.get('adminUsername') ||
    '';
  const password =
    searchParams.get('password') ||
    searchParams.get('pass') ||
    searchParams.get('p') ||
    searchParams.get('adminPassword') ||
    '';

  if (username && password) {
    return { username, password };
  }

  const encodedPair = searchParams.get('auth') || searchParams.get('basic') || searchParams.get('token') || '';
  if (!encodedPair) {
    return null;
  }

  try {
    const decoded = atob(encodedPair);
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex <= 0) {
      return null;
    }
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch (error) {
    return null;
  }
}

function clearCredentialParams(url) {
  ['username', 'user', 'u', 'adminUsername', 'password', 'pass', 'p', 'adminPassword', 'auth', 'basic', 'token'].forEach((key) => {
    url.searchParams.delete(key);
  });
}

function hydrateCredentialsFromUrl() {
  try {
    const url = new URL(window.location.href);
    const fromQuery = parseCredentialParams(url.searchParams);
    const fromUserInfo = url.username && url.password ? { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) } : null;
    const credentials = fromQuery || fromUserInfo;

    if (!credentials || !credentials.username || !credentials.password) {
      return;
    }

    setCredentials(credentials.username, credentials.password);

    const initialHref = url.href;
    url.username = '';
    url.password = '';
    clearCredentialParams(url);

    if (window.history?.replaceState && url.href !== initialHref) {
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  } catch (error) {
    // Ignore malformed URLs or unsupported browser environments.
  }
}

function getAuthHeader() {
  const credentials = getCredentials();
  if (!credentials) {
    return '';
  }
  return toBasicAuthToken(credentials.username, credentials.password);
}

async function backofficeFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const authHeader = getAuthHeader();
  if (authHeader) {
    headers.set('Authorization', authHeader);
  }

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    clearCredentials();
  }
  return response;
}

window.sobellaBackofficeAuth = {
  getCredentials,
  setCredentials,
  clearCredentials,
  getAuthHeader,
  fetch: backofficeFetch,
};

hydrateCredentialsFromUrl();
