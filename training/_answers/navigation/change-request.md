# Reference placement: world status banner

1. **Where:** the numbers already exist as the scrape-time gauges in `apps/server/src/metrics.ts` (`warband_oldest_event_seconds`, `warband_pending_events`).
   Don't call `registry.metrics()` from a route, and don't add another per-request `count(*)`. Compute a **status snapshot once** on a timer in one role
   (M3's sampler: sidejobs, a 5 s timer, `statement_timeout 2s`), store it in Redis `wb:world-status` (EX 60) **and** in memory. Route
   `transport/…` → `application/worldStatus.ts` → reads the Redis key; on a miss, a single cached DB query with `cached()` from `redis.ts`
   (TTL 5 s) so a stampede costs one query.
2. **Failure behaviour:** when the DB is slow, the sampler times out and the last snapshot is served with its `updatedAt`. The client shows "status as of 40 s ago"
   instead of hiding the banner. If both Redis and the sampler are gone: return `{status:"unknown"}` with 200, never 5xx (don't trip the error SLI with a status endpoint).
3. **Auth:** public, like `/api/health` and `/api/legal`, so it must be added to the `onRequest` allow-list in `transport/app.ts`. It exposes only world-level
   aggregates, never village ids, owners or per-player counts (map privacy). Apply the IP rate limit (`@fastify/rate-limit` keys by IP when unauthenticated) and
   `Cache-Control: public, max-age=5` (note the `onSend` hook forces `no-store` on `/api`: that needs an explicit exception).
4. **Data:** no migration.
5. **Client:** `App.tsx`: a banner component fed by a `useQuery(['world-status'], refetchInterval: 15000)` plus refresh on `server_time` WS ticks every 4th beat. It
   must not trigger the full state refetch (don't route it through `refreshRef`). Offline: the service worker caches static assets only (`sw.js`), so offline
   shows "status unavailable".
6. **Tests:** unit (thresholds: ok < 5 s ≤ delayed < 120 s ≤ catching_up); integration with a seeded backlog (`scheduled_events` with past `due_at`) → `delayed`;
   "sampler stale" → the old snapshot with `updatedAt`; "Redis down" → a DB fallback within the TTL; an e2e smoke test that the banner appears under a seeded backlog.
7. **Observability:** the status is derived from the same signal as `EventLagHigh`. If the sampler dies, the banner freezes on "ok". Alert on
   `time() - warband_world_status_updated_seconds > 60`. Label thresholds in one shared constant used by both the banner and the alert, so they can't drift (INC-002 lesson).
