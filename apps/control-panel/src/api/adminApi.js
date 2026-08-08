// Use the same-origin Cloudflare proxy by default.
// Falls back to direct API URL if explicitly configured
const DEFAULT_ADMIN_API_URL =
  import.meta.env.VITE_ADMIN_API_URL || '/api/admin';
const MAX_ADMIN_TOKEN_TTL_MS = 15 * 60 * 1000;
export const ADMIN_SESSION_CHANGE_EVENT = 'lythaus-admin-session-changed';

const STORAGE_KEYS = {
  apiUrl: 'controlPanelAdminApiUrl',
  token: 'controlPanelAdminToken',
  tokenExpiry: 'controlPanelAdminTokenExpiresAt'
};

function getLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage || null;
}

function getSessionStorage() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.sessionStorage || null;
}

function notifyAdminSessionChanged() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }
  window.dispatchEvent(new Event(ADMIN_SESSION_CHANGE_EVENT));
}

function clearLegacyAdminToken() {
  const localStorage = getLocalStorage();
  localStorage?.removeItem(STORAGE_KEYS.token);
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');

  if (typeof atob === 'function') {
    return atob(padded);
  }

  return Buffer.from(padded, 'base64').toString('utf-8');
}

function parseJwtPayload(token) {
  const [, payloadSegment] = token.split('.');
  if (!payloadSegment) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(payloadSegment));
  } catch {
    return null;
  }
}

function calculateAdminTokenExpiry(token) {
  const cappedExpiryMs = Date.now() + MAX_ADMIN_TOKEN_TTL_MS;
  const payload = parseJwtPayload(token);
  const tokenExpirySeconds = Number(payload?.exp);

  if (!Number.isFinite(tokenExpirySeconds) || tokenExpirySeconds <= 0) {
    return cappedExpiryMs;
  }

  return Math.min(cappedExpiryMs, tokenExpirySeconds * 1000);
}

function clearAdminTokenStorage() {
  const sessionStorage = getSessionStorage();
  sessionStorage?.removeItem(STORAGE_KEYS.token);
  sessionStorage?.removeItem(STORAGE_KEYS.tokenExpiry);
  clearLegacyAdminToken();
}

function readAdminTokenRecord() {
  const sessionStorage = getSessionStorage();
  clearLegacyAdminToken();

  if (!sessionStorage) {
    return null;
  }

  const token = sessionStorage.getItem(STORAGE_KEYS.token);
  if (!token) {
    sessionStorage.removeItem(STORAGE_KEYS.tokenExpiry);
    return null;
  }

  const expiresAtMs = Number(sessionStorage.getItem(STORAGE_KEYS.tokenExpiry));
  if (!Number.isFinite(expiresAtMs) || Date.now() >= expiresAtMs) {
    clearAdminTokenStorage();
    notifyAdminSessionChanged();
    return null;
  }

  return { token, expiresAtMs };
}

/**
 * Resolve a potentially relative URL to an absolute URL.
 * Handles both relative paths like "/api/admin" and absolute URLs like "https://...".
 * @param {string} urlOrPath - The URL or path to resolve
 * @returns {string} - An absolute URL suitable for use with new URL()
 */
function resolveToAbsoluteUrl(urlOrPath) {
  // If it's already absolute, return as-is
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    return urlOrPath;
  }
  // In browser context, resolve against current origin
  if (typeof window !== 'undefined' && window.location?.origin) {
    // Ensure we have a trailing slash for proper path joining
    const origin = window.location.origin;
    // Use URL constructor to properly join origin and path
    return new URL(urlOrPath, origin).toString();
  }
  // SSR fallback - return as-is (will fail on server, which is expected)
  return urlOrPath;
}

/**
 * Get the raw (potentially relative) admin API URL from config/storage.
 * Use getAbsoluteAdminApiUrl() for URL construction.
 */
export function getAdminApiUrl() {
  const localStorage = getLocalStorage();
  if (localStorage) {
    const stored = localStorage.getItem(STORAGE_KEYS.apiUrl);
    if (stored) {
      return stored;
    }
  }
  return DEFAULT_ADMIN_API_URL;
}

/**
 * Get the absolute admin API URL, resolving relative paths against window.location.origin.
 * This is the correct base URL for new URL() construction.
 */
export function getAbsoluteAdminApiUrl() {
  return resolveToAbsoluteUrl(getAdminApiUrl());
}

export function setAdminApiUrl(value) {
  const localStorage = getLocalStorage();
  if (!localStorage) {
    return;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    localStorage.removeItem(STORAGE_KEYS.apiUrl);
    return;
  }
  localStorage.setItem(STORAGE_KEYS.apiUrl, trimmed);
}

export function getAdminToken() {
  return readAdminTokenRecord()?.token || '';
}

export function getAdminTokenExpiry() {
  const record = readAdminTokenRecord();
  if (!record) {
    return null;
  }
  return new Date(record.expiresAtMs);
}

export function setAdminToken(value) {
  const sessionStorage = getSessionStorage();
  if (!sessionStorage) {
    return;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    clearAdminTokenStorage();
    notifyAdminSessionChanged();
    return;
  }

  clearLegacyAdminToken();
  sessionStorage.setItem(STORAGE_KEYS.token, trimmed);
  sessionStorage.setItem(
    STORAGE_KEYS.tokenExpiry,
    String(calculateAdminTokenExpiry(trimmed))
  );
  notifyAdminSessionChanged();
}

/**
 * Build a full URL from a path and optional query parameters.
 * Properly handles both relative and absolute base URLs.
 * @param {string} path - The API endpoint path (e.g., "_admin/flags")
 * @param {Object} query - Optional query parameters
 * @returns {string} - The full absolute URL
 */
function buildUrl(path, query) {
  // Get the absolute base URL (resolves relative paths against origin)
  const baseUrl = getAbsoluteAdminApiUrl();
  
  // Ensure proper path joining:
  // - baseUrl: "https://admin-api.lythaus.co/api"
  // - path: "_admin/flags"
  // - result: "https://admin-api.lythaus.co/api/_admin/flags"
  
  // Normalize: remove trailing slash from base, ensure path starts with /
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  const url = new URL(`${normalizedBase}${normalizedPath}`);
  
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return { message: text };
  }
}

/**
 * Check if an endpoint is available before making a request.
 * Uses OPTIONS (preflight) to verify the route exists without triggering full request.
 * @param {string} path - The API endpoint path
 * @returns {Promise<{available: boolean, methods?: string[], error?: string}>}
 */
export async function checkEndpointAvailable(path) {
  try {
    const url = buildUrl(path);
    const response = await fetch(url, {
      method: 'OPTIONS',
      headers: { 'Accept': 'application/json' }
    });
    
    // 200-299 = route exists and accepts OPTIONS
    // 405 = route exists but doesn't accept OPTIONS (still valid endpoint)
    // 404 = route doesn't exist
    if (response.ok || response.status === 405) {
      const allow = response.headers.get('Allow') || response.headers.get('Access-Control-Allow-Methods');
      return { 
        available: true, 
        methods: allow ? allow.split(',').map(m => m.trim()) : undefined 
      };
    }
    
    if (response.status === 404) {
      return { available: false, error: 'Endpoint not found (404). The function may not be deployed.' };
    }
    
    return { available: false, error: `Unexpected status: ${response.status}` };
  } catch (err) {
    return { available: false, error: err.message || 'Network error' };
  }
}

export async function adminRequest(path, { method = 'GET', body, query, headers: extraHeaders, isFormData = false } = {}) {
  const url = buildUrl(path, query);
  const headers = {
    Accept: 'application/json',
    ...(extraHeaders || {})
  };
  const token = getAdminToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const options = { method, headers };
  
  if (body !== undefined) {
    if (isFormData) {
      // FormData sets its own Content-Type with boundary
      options.body = body;
    } else {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      options.body = JSON.stringify(body);
    }
  }

  const response = await fetch(url, options);
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    if (response.status === 401) {
      setAdminToken('');
    }
    const message =
      payload?.error?.message ||
      payload?.message ||
      response.statusText ||
      'Request failed';
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}
