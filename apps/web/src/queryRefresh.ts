import type { Query, QueryClient } from '@tanstack/react-query';

/** Start an authenticated read without reusing a pre-authentication request or private cache. */
export async function resetAccountQueries(client: QueryClient) {
  await client.cancelQueries();
  client.removeQueries({
    predicate: (query) => query.queryKey.length !== 1 || query.queryKey[0] !== 'state',
  });
  // Reset keeps the active state observer connected and forces a new request even without data.
  await client.resetQueries({ queryKey: ['state'], exact: true }, { throwOnError: true });
}

/** Refresh active queries without discarding a response that is already on its way. */
export function createQueryRefresher(client: QueryClient) {
  const jobs = new Map<Query, { dirty: boolean }>();
  let disposed = false;

  async function flush(query: Query, job: { dirty: boolean }) {
    try {
      // A fetch started before this notification may represent an older snapshot.
      // Keep its result, then read again after it finishes.
      const pending = query.state.fetchStatus !== 'idle' ? query.promise : undefined;
      if (pending) await pending.catch(() => {});
      while (job.dirty && !disposed && client.getQueryCache().get(query.queryHash) === query) {
        if (!query.isActive()) {
          query.invalidate();
          break;
        }
        job.dirty = false;
        try {
          await client.refetchQueries(
            { queryKey: query.queryKey, exact: true, type: 'active' },
            { cancelRefetch: false },
          );
        } catch {
          // Query observers expose refresh errors; they must not reject a committed action.
        }
      }
    } finally {
      if (jobs.get(query) === job) jobs.delete(query);
    }
  }

  return {
    request() {
      if (disposed) return;
      // Inactive pages should fetch fresh data when they are opened again, too.
      void client.invalidateQueries({ refetchType: 'none' });
      for (const query of client.getQueryCache().getAll()) {
        // An inactive transport may still finish and clear its stale flag after this hint.
        if (!query.isActive() && query.state.fetchStatus === 'idle') continue;
        const existing = jobs.get(query);
        if (existing) {
          existing.dirty = true;
          continue;
        }
        const job = { dirty: true };
        jobs.set(query, job);
        void flush(query, job);
      }
    },
    dispose() {
      disposed = true;
      jobs.clear();
    },
  };
}
