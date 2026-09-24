# INC-005: a 40-second Redis restart takes the whole game down

**Branch:** `training/incidents/005-redis-blip-outage` · **Severity:** SEV-1, 100% of HTTP traffic returns 502 · **Timebox:** 60 min

## Timeline

- 03:10 Managed Redis maintenance window: the primary restarts (≈40 s).
- 03:10 Caddy starts returning **502 Bad Gateway** for every request, including the static client.
- 03:11 **ApiErrors** fires: `sum(rate(warband_http_request_seconds_count{status=~"5.."}[5m])) / clamp_min(…) > 0.01`.
- 03:11 Resolver lag stays normal. `warband_events_resolved_total` keeps rising. Postgres is healthy.
- 03:12 Redis is back. The 502s stop about 10–20 s later.

The architecture doc promises the opposite (`docs/architecture.md`: *"Redis only holds disposable caches, queue delivery state and invalidation
hints"*; `apps/server/src/redis.ts`: *"Redis loss must not remove abuse controls or stop the authoritative engine"*).

## What was collected

Prometheus during the window, API instance 1:

```
warband_http_request_seconds_count{method="GET",route="/api/health",status="500"}  climbing
warband_http_request_seconds_count{method="GET",route="/api/state",status="200"}   flat (no traffic reaches it)
```

API log (one per health probe):

```
{"level":50,"reqId":"req-1","err":{"type":"ClientOfflineError","message":"The client is offline",
 "stack":"Error: The client is offline\n at …@redis/client/lib/client/index.ts:1181:33 …"}}
```

Caddy log: `no upstreams available` for `api:3001`.

CI history for the release: the `check` job was red on the PR at step `pnpm test:redis-outage` with
`Error: Server did not start without Redis`. It was re-run twice and merged with the comment *"redis-outage has been flaky on GH runners for weeks"*.
(That test really does fail intermittently on a cold machine. It failed once on this laptop on `main` before passing on the rerun.)

## Suspect PR

```diff
--- a/apps/server/src/application/game.ts
+++ b/apps/server/src/application/game.ts
+import { redis } from '../redis';
@@ export const gameUseCases = {
   get_api_health: async () => {
-    await database.query('SELECT 1');
+    // Deep health: an instance that cannot reach Redis can neither fan out live
+    // events nor share rate limits with its peers, so it should not take traffic.
+    await Promise.all([database.query('SELECT 1'), redis.ping()]);
     return { ok: true, server_now: Date.now() };
```

## Your job

1. Reproduce: on the branch, run `pnpm test:redis-outage` (needs `docker compose up -d postgres`). Then run it on `main`.
2. Trace who calls `/api/health` (Caddyfile `health_uri`, the compose `healthcheck`, `tools/sim/*`, CI) and what each one does with a failure.
3. The PR author's argument isn't wrong: an instance without Redis *is* degraded. Design the health model: liveness, readiness, and degraded-but-serving.
   Which dependency failures should remove an instance from the load balancer?
4. Explain why the ApiErrors alert fired *but pointed at the wrong thing*. What share of that 5xx rate was real players?
5. How would you fix the flaky-test culture that let this merge? Be concrete about the test and about the CI policy.

Sealed answer: `_answers/incidents/005-redis-blip-outage.md`
