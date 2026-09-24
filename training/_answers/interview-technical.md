# Model answers: technical questions (short form)

1. `command()` stores `request = JSON.stringify({id, raw})` with the key. Same key + different request → `fail('Idempotency key was already used for another command', 409)`.
   A replay would return a response for a command the client didn't send this time, hiding a client bug that reuses keys.
2. Timers are rendered client-side from `due_at`. The client needs the server clock to avoid showing "0:00" early or late. `App.tsx` keeps a rolling median of
   server clock samples (`docs/architecture.md`, "Server clock samples use a rolling median").
3. Advisory locks (`pg_advisory_xact_lock(1,id)`) serialize *logical* access before the row is read and are also used by the component try-locks.
   `FOR UPDATE` protects the row against writers that don't use the advisory protocol and makes the read consistent. Belt and braces, in a fixed id order to avoid deadlocks.
4. Resolvers should skip busy components and pick other work on the next 50 ms tick, while a player's command must eventually succeed. The cost: busy outcomes
   are swallowed (`return 0`) and never reach `dbCounters`, so contention is invisible (INC-001).
5. Benefit: atomic, self-contained schema setup for dev and tests. Costs: every production role takes the exclusive world lock at boot (stalls simulation
   during deploys), and a checksum mismatch (edited file, CRLF) crash-loops every role (INC-004).
6. Hot reads: morale needs a player's total points on every battle, and the planner needs support edges. A trigger `sync_village_indexes` maintains both inside the
   same transaction as the village update, so they're consistent at commit.
7. The DB is the truth. The WS is at-most-once and can arrive out of order or be missed on reconnect, so the client refetches `/api/state` (curriculum 08, rule 1).
8. The server sends close 1012 in `close()`. The client's `onclose` waits 1 s·2^attempt (max 30 s), GETs `/api/state`, and reconnects. The first `onopen` triggers a refresh, so nothing is lost, only delayed.
9. A response already in flight may reflect an older snapshot. Cancelling it and restarting under load can starve the query forever. The refresher waits for the
   pending fetch, then refetches once more if dirty. That's a correct-and-bounded coalescing loop.
10. It proves crash-safety and determinism: killed workers, a terminated backend, a DB restart and a Redis flush still produce a state identical to serial
    resolution. It says nothing about throughput or lag. [RUN: passed in 1m50s.]
11. One browser context = one socket per player, so the registry's multi-socket path never ran. The cheapest failing test: a registry unit test (add A, add B, remove A → B remains) or `app.injectWS` with two sockets.
12. `promtool test rules` in CI with synthetic series. Vitest can't evaluate PromQL. Also a live drill before promoting rules, because fixtures share the author's assumptions (le="2" vs "2.0").
13. `session_tokens.consumed_at` is set, so the stale token's refresh sees `consumed_at` and revokes the whole family (`UPDATE session_families SET revoked_at`).
    Both attacker and victim must sign in again. That's reuse detection.
14. Running with `NODE_ENV` unset or `staging` behind a proxy that doesn't strip `/metrics` (or exposing a role's port directly). Then `/metrics` is open and so is
    the JWT fallback secret (review #22/#24).
15. `sum(rate(warband_event_lag_seconds_bucket{le=~"2|2.0"}[1h])) / sum(rate(warband_event_lag_seconds_count[1h]))`. It's exact at a bucket boundary and can't be
    clipped by the top bucket (INC-002 / Lab 0 showed p99 pinned at 60.0 and at 2.0).
16. The async `collect()` waits on the DB. prom-client's `Promise.all` makes the whole scrape slow or 500, so `up` drops and *all* metrics from that target
    gap. The backlog alerts see no data exactly when needed (M3).
17. Commands, state reads and the resolver keep working on Postgres. Rate limits fall back to `rate_buckets`. Live hints stop (the relay waits for `redis.isReady`),
    and BullMQ side jobs pause. Check `/api/health` (must stay 200) and `outbox_backlog` rising. [RUN: redis-outage drill passes on main.]
18. `training/ops/inject.ts` drains of a fixed backlog with 3 vs 4 resolvers, ≥ 2 runs each, plus rollbacks/commit from `pg_stat_database` and DB CPU. If rollbacks
    rise and DB CPU is flat at max, a 4th hurts (M2).
19. The loops run from `setInterval` with no active span, so auto-instrumented pg spans become roots. Fix: `startActiveSpan('resolver.tick', …)` around each tick (J3).
20. With `build: .` you rebuild old source on the server (slow, non-reproducible, and may pull a different base image). With `image: …:${RELEASE}` it's
    `RELEASE=<prev> docker compose up -d`, with the schema expand-only so the old code still runs (S1).
