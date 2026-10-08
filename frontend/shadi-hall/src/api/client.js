// HTTP client for the API. Sessions live in httpOnly cookies; when the short-lived access token expires the client
// refreshes it once (shared by all concurrent requests) and retries.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let refreshing = null;
let onSessionExpired = () => {};

// Calls that must never trigger an automatic token refresh + retry.
const NO_REFRESH = new Set(['/auth/login', '/auth/refresh', '/auth/logout', '/auth/forgot-password', '/auth/reset-password']);

/** Called by the auth provider so an unrecoverable 401 sends the user back to the sign-in page. */
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

function buildUrl(path, query) {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  return url;
}

async function parseError(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    // non-JSON error body
  }
  const error = body?.error;
  return new ApiError(
    response.status,
    error?.code ?? 'HTTP_ERROR',
    error?.message ?? (response.status >= 500 ? 'The server had a problem. Please try again.' : 'Request failed'),
    error?.details,
  );
}

function refreshSession() {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => {
        refreshing = null;
      }, 0);
    });
  return refreshing;
}

/**
 * @param {string} method
 * @param {string} path API path without the /api prefix
 * @param {{ body?: unknown, query?: Record<string, unknown>, signal?: AbortSignal, raw?: boolean, retry?: boolean }} [options]
 */
export async function request(method, path, { body, query, signal, raw = false, retry = true } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: 'same-origin',
      signal,
      headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }

  if (response.status === 401 && retry && !NO_REFRESH.has(path)) {
    if (await refreshSession()) return request(method, path, { body, query, signal, raw, retry: false });
    onSessionExpired();
  }

  if (!response.ok) throw await parseError(response);
  if (raw) return response;
  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  get: (path, query, options) => request('GET', path, { query, ...options }),
  post: (path, body, options) => request('POST', path, { body, ...options }),
  put: (path, body, options) => request('PUT', path, { body, ...options }),
  patch: (path, body, options) => request('PATCH', path, { body, ...options }),
  delete: (path, options) => request('DELETE', path, options),
};

/** Downloads a file (PDF/CSV) from the API and saves it with its server-provided name. */
export async function downloadFile(path, query) {
  const response = await request('GET', path, { query, raw: true });
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'download';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** URL for opening a PDF inline in a new tab (cookies authenticate it). */
export function fileUrl(path, query) {
  return buildUrl(path, query).toString();
}
