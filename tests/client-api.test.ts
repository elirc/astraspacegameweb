import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let client: typeof import('../apps/web/src/api');
const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  client = await import('../apps/web/src/api');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('browser API requests', () => {
  it('sends credentialed GET requests and accepts JSON objects and arrays', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
    fetchMock.mockResolvedValueOnce(Response.json([{ id: 1 }]));
    await expect(client.api('/state')).resolves.toEqual({ ok: true });
    await expect(client.api('/reports')).resolves.toEqual([{ id: 1 }]);
    expect(fetchMock.mock.calls[0]).toEqual([
      '/api/state',
      expect.objectContaining({
        method: 'GET',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        signal: expect.any(AbortSignal),
      }),
    ]);
  });

  it('serializes mutations and honors an explicit method', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    await client.api('/settings', { name: 'New village' }, 'PATCH');
    const options = fetchMock.mock.calls[0]![1]!;
    expect(options.method).toBe('PATCH');
    expect(options.body).toBe('{"name":"New village"}');
    expect(new Headers(options.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('accepts a successful response with no content', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(client.api('/settings', {}, 'DELETE')).resolves.toEqual({});
  });

  it('preserves actionable server errors and the HTTP status', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'Not enough wood' }, { status: 409 }));
    await expect(client.api('/command', {})).rejects.toMatchObject({
      message: 'Not enough wood',
      status: 409,
    });
  });

  it.each([
    [403, 'You do not have permission'],
    [404, 'The requested resource was not found'],
    [429, 'Too many requests'],
    [500, 'The server is temporarily unavailable'],
    [502, 'The server is temporarily unavailable'],
    [503, 'The server is temporarily unavailable'],
  ])('explains a non-JSON HTTP %s response', async (status, message) => {
    fetchMock.mockResolvedValue(new Response('<html>Proxy error</html>', { status }));
    await expect(client.api('/state')).rejects.toMatchObject({
      message: expect.stringContaining(message),
      status,
    });
  });

  it.each([{ error: 42 }, { error: '' }, null])(
    'falls back safely for malformed server error %j',
    async (body) => {
      fetchMock.mockResolvedValue(Response.json(body, { status: 400 }));
      await expect(client.api('/command', {})).rejects.toMatchObject({
        message: 'Request failed (HTTP 400). Please try again.',
        status: 400,
      });
    },
  );

  it.each(['<html>Unexpected page</html>', '', 'null', 'true', '42', '"ok"'])(
    'explains an invalid successful response: %j',
    async (body) => {
      fetchMock.mockResolvedValue(new Response(body));
      await expect(client.api('/state')).rejects.toThrow('The server returned an invalid response');
    },
  );

  it('turns a fetch rejection into an actionable connection error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(client.api('/state')).rejects.toThrow(
      'Unable to reach the server. Check your connection and try again.',
    );
  });

  it('aborts a stalled request after 15 seconds', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_, options) =>
        new Promise((_, reject) => {
          options!.signal!.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const result = expect(client.api('/state')).rejects.toThrow('The request timed out');
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('also times out when headers arrive but the response body stalls', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async (_, options) => {
      const body = new ReadableStream({
        start(controller) {
          options!.signal!.addEventListener('abort', () =>
            controller.error(new DOMException('Aborted', 'AbortError')),
          );
        },
      });
      return new Response(body);
    });
    const result = expect(client.api('/state')).rejects.toThrow('The request timed out');
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timeout when the request succeeds', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    await client.api('/state');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('warns that a mutation may have completed when its connection fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(client.api('/command', { action: 'build' })).rejects.toThrow(
      'Your action may have completed. Check the latest state before trying again.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('warns about a missing mutation acknowledgement after a timeout', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_, options) =>
        new Promise((_, reject) => {
          options!.signal!.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const result = expect(client.api('/command', { action: 'build' })).rejects.toThrow(
      'The request timed out. Your action may have completed. Check the latest state before trying again.',
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refreshes once for concurrent requests and retains each mutation idempotency key', async () => {
    let resolveRefresh!: (response: Response) => void;
    const refresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const seen = new Set<string>();
    fetchMock.mockImplementation(async (input) => {
      const path = String(input);
      if (path === '/api/auth/refresh') return refresh;
      if (!seen.has(path)) {
        seen.add(path);
        return Response.json({ error: 'Expired session' }, { status: 401 });
      }
      return Response.json({ ok: true });
    });
    const first = client.api('/command', { action: 'build' });
    const second = client.api('/settings', { name: 'Ravenswood' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    resolveRefresh(Response.json({ ok: true }));
    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: true }, { ok: true }]);
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/auth/refresh');
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0]![1]).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    const keys = ['/api/command', '/api/settings'].map((path) => {
      const attempts = fetchMock.mock.calls.filter(([url]) => url === path);
      expect(attempts).toHaveLength(2);
      const firstKey = new Headers(attempts[0]![1]!.headers).get('Idempotency-Key');
      expect(firstKey).toBeTruthy();
      expect(new Headers(attempts[1]![1]!.headers).get('Idempotency-Key')).toBe(firstKey);
      return firstKey;
    });
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('does not refresh failed authentication endpoints', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'Invalid password' }, { status: 401 }));
    await expect(client.api('/auth/login', {})).rejects.toMatchObject({
      message: 'Invalid password',
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry forever when the refreshed session is still rejected', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(new Response('', { status: 401 }));
    await expect(client.api('/state')).rejects.toMatchObject({
      message: 'Your session has expired. Sign in and try again.',
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('allows a later refresh after an earlier refresh fails', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    await expect(client.api('/state')).rejects.toMatchObject({ status: 401 });
    await expect(client.api('/state')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/auth/refresh')).toHaveLength(2);
  });

  it('uses the median of the last five valid clock samples', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    for (const offset of [100, 300, 200, 900, 400, 1000]) {
      fetchMock.mockResolvedValueOnce(Response.json({ server_now: 10_000 + offset }));
      await client.api('/state');
    }
    expect(client.serverOffset).toBe(400);
    fetchMock.mockResolvedValueOnce(Response.json({ server_now: 'not a timestamp' }));
    await client.api('/state');
    expect(client.serverOffset).toBe(400);
  });
});
