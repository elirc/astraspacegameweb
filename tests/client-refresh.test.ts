import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryRefresher, resetAccountQueries } from '../apps/web/src/queryRefresh';

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose();
});

describe('account query reset', () => {
  it('replaces an in-flight pre-authentication request even when it has no cached data', async () => {
    const { client } = setup();
    const requests: {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
    }[] = [];
    const observer = new QueryObserver(client, {
      queryKey: ['state'],
      // The transport can finish after cancellation because it does not consume the signal.
      queryFn: () =>
        new Promise<unknown>((resolve, reject) => {
          requests.push({ resolve, reject });
        }),
    });
    cleanup.push(observer.subscribe(() => {}));
    const originalQuery = client.getQueryCache().find({ queryKey: ['state'], exact: true });
    expect(requests).toHaveLength(1);

    const reset = resetAccountQueries(client);
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[0]!.reject(Object.assign(new Error('Sign in required'), { status: 401 }));
    await Promise.resolve();
    expect(client.getQueryState(['state'])?.status).toBe('pending');
    requests[1]!.resolve({ player: { id: 'signed-in' } });
    await reset;

    expect(client.getQueryData(['state'])).toEqual({ player: { id: 'signed-in' } });
    expect(observer.getCurrentResult().data).toEqual({ player: { id: 'signed-in' } });
    expect(client.getQueryCache().find({ queryKey: ['state'], exact: true })).toBe(originalQuery);
    expect(requests).toHaveLength(2);
  });

  it('purges old account caches and keeps the state observer connected to the replacement', async () => {
    const { client, observe } = setup();
    const { requests } = observe('state', { player: { id: 'previous' } });
    client.setQueryData(['reports'], { private: 'previous reports' });
    client.setQueryData(['messages', 'private-thread'], { private: 'previous messages' });
    const stateQuery = client.getQueryCache().find({ queryKey: ['state'], exact: true });

    const reset = resetAccountQueries(client);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(client.getQueryData(['state'])).toBeUndefined();
    expect(client.getQueryCache().getAll()).toEqual([stateQuery]);
    expect(stateQuery?.isActive()).toBe(true);
    requests[0]!.resolve({ player: { id: 'replacement' } });
    await reset;
    expect(client.getQueryData(['state'])).toEqual({ player: { id: 'replacement' } });

    // Same-player registration also needs a working observer after its reset.
    const repeatReset = resetAccountQueries(client);
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1]!.resolve({ player: { id: 'replacement', registered: true } });
    await repeatReset;
    expect(client.getQueryData(['state'])).toEqual({
      player: { id: 'replacement', registered: true },
    });
  });

  it('exposes a failed authenticated read without restoring old data and allows a retry', async () => {
    const { client, observe } = setup();
    const { requests } = observe('state', { player: { id: 'previous' } });
    client.setQueryData(['reports'], { private: 'previous reports' });
    const reset = resetAccountQueries(client);
    const failure = expect(reset).rejects.toThrow('World unavailable');
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    requests[0]!.reject(new Error('World unavailable'));
    await failure;
    expect(client.getQueryData(['state'])).toBeUndefined();
    expect(client.getQueryData(['reports'])).toBeUndefined();
    expect(client.getQueryState(['state'])?.status).toBe('error');

    const retry = client.refetchQueries({ queryKey: ['state'], exact: true });
    expect(requests).toHaveLength(2);
    requests[1]!.resolve({ player: { id: 'replacement' } });
    await retry;
    expect(client.getQueryData(['state'])).toEqual({ player: { id: 'replacement' } });
  });
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  cleanup.push(() => client.clear());
  const refresher = createQueryRefresher(client);
  cleanup.push(() => refresher.dispose());

  function observe(key: string, initial: unknown = { value: 0 }) {
    const requests: {
      resolve: (value: unknown) => void;
      reject: (reason: Error) => void;
      signal: AbortSignal;
    }[] = [];
    client.setQueryData([key], initial);
    const observer = new QueryObserver(client, {
      queryKey: [key],
      queryFn: ({ signal }) =>
        new Promise<unknown>((resolve, reject) => {
          requests.push({ resolve, reject, signal });
        }),
    });
    const subscribe = () => {
      const stop = observer.subscribe(() => {});
      cleanup.push(stop);
      return stop;
    };
    const stop = subscribe();
    return { requests, stop, subscribe };
  }
  return { client, refresher, observe };
}

describe('coalesced query refresh', () => {
  it('retains an in-flight response and then reads a snapshot newer than the notification', async () => {
    const { client, refresher, observe } = setup();
    const { requests } = observe('state', { spear: 35 });
    void client.refetchQueries({ queryKey: ['state'], exact: true });
    refresher.request();
    expect(requests).toHaveLength(1);
    expect(requests[0]!.signal.aborted).toBe(false);

    requests[0]!.resolve({ spear: 37 });
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(client.getQueryData(['state'])).toEqual({ spear: 37 });
    expect(requests[0]!.signal.aborted).toBe(false);
    requests[1]!.resolve({ spear: 38 });
    await vi.waitFor(() => expect(client.getQueryData(['state'])).toEqual({ spear: 38 }));
  });

  it('coalesces a notification burst into one current read and one trailing read', async () => {
    const { client, refresher, observe } = setup();
    const { requests } = observe('state');
    refresher.request();
    for (let i = 0; i < 100; i++) refresher.request();
    expect(requests).toHaveLength(1);
    requests[0]!.resolve({ value: 1 });
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1]!.resolve({ value: 2 });
    await vi.waitFor(() => expect(client.getQueryData(['state'])).toEqual({ value: 2 }));
    expect(requests).toHaveLength(2);
  });

  it('keeps a notification that arrives during the trailing read', async () => {
    const { client, refresher, observe } = setup();
    const { requests } = observe('state');
    refresher.request();
    refresher.request();
    requests[0]!.resolve({ value: 1 });
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    refresher.request();
    requests[1]!.resolve({ value: 2 });
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    requests[2]!.resolve({ value: 3 });
    await vi.waitFor(() => expect(client.getQueryData(['state'])).toEqual({ value: 3 }));
  });

  it('refreshes state independently of a slow map request', async () => {
    const { client, refresher, observe } = setup();
    const state = observe('state');
    const map = observe('map');
    refresher.request();
    state.requests[0]!.resolve({ value: 1 });
    await vi.waitFor(() => expect(client.getQueryData(['state'])).toEqual({ value: 1 }));
    refresher.request();
    expect(state.requests).toHaveLength(2);
    expect(map.requests).toHaveLength(1);
    state.requests[1]!.resolve({ value: 2 });
    await vi.waitFor(() => expect(client.getQueryData(['state'])).toEqual({ value: 2 }));
    map.requests[0]!.resolve({ value: 1 });
    await vi.waitFor(() => expect(map.requests).toHaveLength(2));
    map.requests[1]!.resolve({ value: 2 });
    await vi.waitFor(() => expect(client.getQueryData(['map'])).toEqual({ value: 2 }));
  });

  it('keeps a requested follow-up after an error and accepts later requests', async () => {
    const { client, refresher, observe } = setup();
    const { requests } = observe('state');
    refresher.request();
    refresher.request();
    requests[0]!.reject(new Error('Temporarily unavailable'));
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1]!.resolve({ value: 2 });
    await vi.waitFor(() => expect(client.getQueryData(['state'])).toEqual({ value: 2 }));
    refresher.request();
    expect(requests).toHaveLength(3);
    requests[2]!.resolve({ value: 3 });
    await vi.waitFor(() => expect(client.getQueryData(['state'])).toEqual({ value: 3 }));
  });

  it('does not retry an error forever without another notification', async () => {
    const { client, refresher, observe } = setup();
    const { requests } = observe('state');
    refresher.request();
    requests[0]!.reject(new Error('Temporarily unavailable'));
    await vi.waitFor(() => expect(client.getQueryState(['state'])?.fetchStatus).toBe('idle'));
    expect(client.getQueryState(['state'])?.status).toBe('error');
    expect(requests).toHaveLength(1);
  });

  it('stops queued work on disposal without discarding the current response', async () => {
    const { client, refresher, observe } = setup();
    const { requests } = observe('state');
    refresher.request();
    refresher.request();
    refresher.dispose();
    refresher.request();
    requests[0]!.resolve({ value: 1 });
    await vi.waitFor(() => expect(client.getQueryData(['state'])).toEqual({ value: 1 }));
    expect(requests[0]!.signal.aborted).toBe(false);
    expect(requests).toHaveLength(1);
  });

  it('does not let a removed query refresh a replacement account with the same key', async () => {
    const { client, refresher, observe } = setup();
    const previous = observe('state', { player: 'previous' });
    refresher.request();
    refresher.request();
    previous.stop();
    client.removeQueries({ queryKey: ['state'], exact: true });
    const replacement = observe('state', { player: 'replacement' });
    previous.requests[0]!.resolve({ player: 'previous' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.getQueryData(['state'])).toEqual({ player: 'replacement' });
    expect(replacement.requests).toHaveLength(0);
  });

  it('leaves an unmounted query stale so reopening it still obtains fresh data', async () => {
    const { client, refresher, observe } = setup();
    const { requests, stop, subscribe } = observe('reports');
    refresher.request();
    refresher.request();
    stop();
    requests[0]!.resolve({ value: 1 });
    await vi.waitFor(() => expect(client.getQueryState(['reports'])?.isInvalidated).toBe(true));
    subscribe();
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1]!.resolve({ value: 2 });
    await vi.waitFor(() => expect(client.getQueryData(['reports'])).toEqual({ value: 2 }));
  });

  it('keeps an already-inactive request stale when its transport ignores cancellation', async () => {
    const { client, refresher } = setup();
    const requests: { resolve: (value: unknown) => void }[] = [];
    client.setQueryData(['reports'], { value: 0 });
    const observer = new QueryObserver(client, {
      queryKey: ['reports'],
      // Deliberately do not access Query's signal: the browser API transport behaves this way.
      queryFn: () =>
        new Promise<unknown>((resolve) => {
          requests.push({ resolve });
        }),
    });
    const stop = observer.subscribe(() => {});
    cleanup.push(stop);
    void client.refetchQueries({ queryKey: ['reports'], exact: true });
    expect(requests).toHaveLength(1);
    stop();
    expect(client.getQueryState(['reports'])?.fetchStatus).toBe('fetching');

    refresher.request();
    requests[0]!.resolve({ value: 1 });
    await vi.waitFor(() => expect(client.getQueryData(['reports'])).toEqual({ value: 1 }));
    await vi.waitFor(() => expect(client.getQueryState(['reports'])?.isInvalidated).toBe(true));
    expect(requests).toHaveLength(1);

    cleanup.push(observer.subscribe(() => {}));
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1]!.resolve({ value: 2 });
    await vi.waitFor(() => expect(client.getQueryData(['reports'])).toEqual({ value: 2 }));
  });
});
