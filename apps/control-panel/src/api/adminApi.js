const ADMIN_API_BASE_PATH = '/api/admin';

export function getAdminApiUrl() {
  return ADMIN_API_BASE_PATH;
}

function buildUrl(path, query) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${ADMIN_API_BASE_PATH}${normalizedPath}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export async function adminRequest(path, { method = 'GET', body, query, headers: extraHeaders, isFormData = false } = {}) {
  const headers = { Accept: 'application/json', ...(extraHeaders ?? {}) };
  const options = { method, headers, credentials: 'include', cache: 'no-store' };
  if (body !== undefined) {
    if (isFormData) {
      options.body = body;
    } else {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      options.body = JSON.stringify(body);
    }
  }
  const response = await fetch(buildUrl(path, query), options);
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? payload?.message ?? response.statusText ?? 'Request failed');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}
