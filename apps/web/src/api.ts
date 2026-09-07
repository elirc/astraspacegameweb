export let serverOffset = 0;
const offsets: number[] = [];
const REQUEST_TIMEOUT_MS = 15_000;
type ApiResponse = { response: Response; text: string };
let refreshing: Promise<ApiResponse> | null = null;

async function request(path: string, options: RequestInit): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch('/api' + path, {
      ...options,
      credentials: 'same-origin',
      signal: controller.signal,
    });
    // Keep the timeout active while reading the body, too.
    return { response, text: await response.text() };
  } catch {
    const mutation =
      !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase()) &&
      path !== '/auth/refresh';
    const advice = mutation
      ? 'Your action may have completed. Check the latest state before trying again.'
      : 'Check your connection and try again.';
    throw new Error(
      controller.signal.aborted
        ? `The request timed out. ${advice}`
        : `Unable to reach the server. ${advice}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function httpError(status: number) {
  if (status === 401) return 'Your session has expired. Sign in and try again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return 'The requested resource was not found.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status >= 500) return 'The server is temporarily unavailable. Please try again.';
  return `Request failed (HTTP ${status}). Please try again.`;
}

export async function api(path: string, body?: unknown, method?: string): Promise<any> {
  const idempotencyKey = crypto.randomUUID();
  let sentAt = Date.now();
  const send = () => {
    sentAt = Date.now();
    return request(path, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: {
        'Content-Type': 'application/json',
        ...(body === undefined ? {} : { 'Idempotency-Key': idempotencyKey }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  };
  let result = await send();
  if (result.response.status === 401 && !path.startsWith('/auth/')) {
    if (!refreshing)
      refreshing = request('/auth/refresh', { method: 'POST' }).finally(() => {
        refreshing = null;
      });
    if ((await refreshing).response.ok) result = await send();
  }
  const { response, text } = result;
  let data: any;
  try {
    data = response.status === 204 ? {} : JSON.parse(text);
  } catch {
    // Proxies often return HTML or plain text; show a useful message instead of a SyntaxError.
  }
  if (!response.ok)
    throw Object.assign(
      new Error(
        typeof data?.error === 'string' && data.error.trim()
          ? data.error
          : httpError(response.status),
      ),
      { status: response.status },
    );
  if (data === null || typeof data !== 'object')
    throw new Error('The server returned an invalid response. Please try again.');
  if (typeof data.server_now === 'number' && Number.isFinite(data.server_now)) {
    offsets.push(data.server_now - (sentAt + Date.now()) / 2);
    if (offsets.length > 5) offsets.shift();
    serverOffset = [...offsets].sort((a, b) => a - b)[Math.floor(offsets.length / 2)]!;
  }
  return data;
}
export const format = (n: number = 0) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
export function duration(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 3600
    ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
    : s >= 60
      ? `${Math.floor(s / 60)}m ${s % 60}s`
      : `${s}s`;
}
