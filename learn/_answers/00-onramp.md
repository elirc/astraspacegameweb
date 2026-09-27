# SEALED: on-ramp answers

Verification: every answer below comes from reading the code at `3ef7432` / `2fca582` on 2026-09-26. Nothing was run in this pass (docs-only;
Docker is down and `node_modules` is absent). Runtime claims cite B03's live runs (`training/_answers/evidence/runs-2026-09-24.md`) or are marked UNVERIFIED.

## 1. What a resolver process does

a. **Yes.** `await initialize()` at `index.ts:16` runs before the role is even read. Every role migrates at boot.
b. The **resolver** loop does work (`index.ts:44` passes for `resolver`). The **relay** returns early (`:60`, role not in `['all','relay']`). The **NPC** timer returns early (`:100`).
   `startSidejobs` isn't called (`:97`). The **gauges** interval runs in *every* role (`:117-120`, no role check). On a resolver it always sets 0, because nobody connects sockets to it.
c. **No.** The subscriber only connects for `all|api|ws` (`:25`).
d. **Yes to both.** `buildApp()` + `installMetrics()` + `app.listen()` run for every role (`:20-21`, `:121`). A resolver serves the whole `/api/*` surface and `/metrics`.
e. Because startup (`initialize()`) is the same code in every role, one bad migration kills **all** roles at once. There's no "the API is down but resolvers keep going".
   It's also why the compose healthcheck (an HTTP call to `/api/health`) would work on any role.

## 2. Row to refetch
1. Relay loop `index.ts:59-96`: `SELECT * FROM outbox WHERE sent_at IS NULL … FOR UPDATE SKIP LOCKED` (`:62-66`) → `redis.publish('warband:events', JSON.stringify(row))` (`:68`) → `UPDATE outbox SET sent_at` (`:88`).
2. Each api instance's subscriber `index.ts:29-34`: parse the event → for each socket in `sockets.get(event.player_id)` with `readyState === 1` → `socket.send({...event, server_now})`.
3. Browser `apps/web/src/App.tsx:345-351` `socket.onmessage`: ignores `server_time`/`connected`, otherwise `refreshRef.current?.request()`.
4. `apps/web/src/queryRefresh.ts:45-60` `request()`: invalidates all queries and, per active query, starts or marks dirty a `flush` job → `refetchQueries` (`:31`) → `GET /api/state`.

The message is the raw outbox row (type, player_id, payload). The client doesn't apply it because Postgres is the only truth. Hints can be lost
(Redis down, socket not registered, out-of-order delivery). Re-reading `/api/state` is always correct. Curriculum 08 rule 1; `FIRST_CHANGE.md` rule 1.

## 3. Registry on `main`
a. `Map<number, Set<WebSocket>>`, keyed by `req.playerId` (`app.ts:34`, `:117`).
b. After A: `S1={A}`. After B: `S1={A,B}` (same Set, because `sockets.get(id)` exists at `:118`). After A closes: `S1={B}`. The entry stays, since the size is not 0.
c. On `main` every connection of a player gets **the same Set object** from the map. So the captured `set` and the current map entry are the same object, and
   `if (!set?.size) sockets.delete(id)` only deletes an entry that is really empty. INC-003's PR creates a *new* Set per connection, and then the old handler deletes the new entry.
d. `heartbeat` (every 5 s re-authenticates; on failure `close(4001, 'Session revoked or expired')`, `:130`) and `expiry` (at JWT `exp`, `close(4001, 'Session refresh required')`, `:135-138`).
   (On shutdown, `index.ts:131` closes everything with `1012`.)

## 4. Histogram math
a. All observations fall in `(0.25, 0.5]`. The count below the bucket is 0, and the bucket holds N. Rank = 0.99·N, so the result is
   `0.25 + (0.5 − 0.25) × 0.99 = 0.4975` s. The histogram can't know the real value is 0.3. It only knows "somewhere in 0.25–0.5".
b. All observations fall in `(60, +Inf]`. When the rank lands in `+Inf`, Prometheus returns the **upper bound of the highest finite bucket: 60**.
   B03's Lab 0 saw exactly that: `lag_p99 = lag_p50 = 60.0` while the oldest event was 111 s (`training/_answers/lab0.md` Q2).
c. `histogram_quantile(...) > 120` can **never** be true: the quantile's maximum possible value is 60. That's an unreachable alert. INC-002 is this bug with a 2 s top bucket.
   Rule: the top finite bucket must sit well above every threshold that reads it, or use a bucket-ratio SLI (curriculum 09).

## 5. The counter that never moves
- `dbCounters.retries++` only happens in the retry branch of `transaction()` (`packages/db/index.ts:74-77`), and only when `attempt < maxAttempts - 1`.
- `resolveDue()` calls `transaction(fn, 1)` (`engine.ts:805`), so `maxAttempts = 1`, `attempt < 0` is always false, and it **never retries**. Exhaustion
  (`:79-80`) needs `WB_BUSY && maxAttempts > 1`, so it doesn't count either.
- The error is rethrown, then caught in `resolveDue` (`engine.ts:806-808`): `40001/55P03/WB_BUSY → return 0`. No metric, no log. The resolver loop sees "0 events resolved".
- So contention shows up only as **rollbacks** (`pg_stat_database.xact_rollback`, Tempo `pg.query:ROLLBACK`), never on the dashboard. That's Lab 0 Q6 and the heart of INC-001.
- Bonus: it's a Gauge set from a per-process JS variable. On restart it drops to 0. `rate()` would treat that as a counter reset (fine), but a
  `Gauge` type means Grafana and `promtool` don't treat it as a counter, and summing across instances hides which process was retrying.
  It should be a real `Counter` incremented where the retry happens.

## 6. Migration checksum
a. Every role runs `initialize()` → for `013_npc_players.sql`: `sha256(file text)` ≠ `schema_migrations.checksum` → `throw new Error('Applied migration was modified: ' + name)` (`index.ts:148`).
   The top-level `await` rejects, the process exits 1, and with `restart: unless-stopped` it loops. B03 reproduced this: exit after about 21 s (`runs-2026-09-24.md`, INC-004).
b. No. The loop is sorted and throws at 013, so 014+ never run. And the whole of `initialize()` is one `transaction()` (`:135`), so anything
   applied earlier in this boot would roll back. Nothing is half-applied.
c. CRLF. The committed blobs are LF. A fresh Windows checkout or worktree with `autocrlf=true` gets CRLF `.sql` files, so every byte hash differs. A database
   first migrated from an LF checkout refuses a CRLF one (`Applied migration was modified: 001_initial.sql`) and vice versa. B03 verified this on `main`.
   Fix: `.gitattributes` with `*.sql text eol=lf`, plus hashing normalized text (`sql.replace(/\r\n/g, '\n')`) with a transition that accepts the legacy hash.

## 7. Health
a. Only `SELECT 1` against Postgres (`game.ts:63`).
b. No. `app.ts:79` skips `authenticate` for `/api/health`.
c. Callers:
   - **Caddy** (`infra/Caddyfile:7-8`, every 10 s) marks the upstream unhealthy → no upstreams → **502 for everything**, including the SPA.
   - The **compose healthcheck** (`compose.production.yaml:25-31`) marks the container unhealthy. `edge` has `depends_on: api: condition: service_healthy`
     (`:68-70`), so the edge won't even start until the api is healthy. Compose does *not* restart unhealthy containers.
   - `tools/sim/load.ts:90`, `tools/sim/redis-outage.ts:39`, `tools/sim/package-smoke.mjs:68`, `tools/wait-ready.mjs:2` use it as "is the server ready?" and keep polling or fail.
d. Every api instance fails `SELECT 1` together → Caddy removes all upstreams → players get 502 for about 30 s (+ up to 10 s detection each way). That's
   arguably correct, since nothing works without the DB, but it's a *choice*. INC-005 makes the same thing happen for Redis, where it's the wrong choice.

## 8. Redis gone
a. Yes. `takeLimit` falls back to Postgres `rate_buckets` (`redis.ts:27-33`). Postgres is shared, so **both** api instances count against the same row.
b. `wb:limit:player:7:movement:<floor(Date.now()/60000)>` (key built in `transport/contracts.ts:76-78`, prefixed and bucketed in `redis.ts:16-17`). The
   bucket number makes each window a fresh key, so there's no reset logic. Old rows are deleted by `maintenance()` in `sidejobs.ts:9` (`DELETE FROM rate_buckets WHERE expires_at<now()`).
c. The relay loop returns early if `!redis.isReady` (`index.ts:60`). Rows stay `sent_at IS NULL` and are published after Redis comes back. Nothing is lost,
   only delayed. Clients still converge through the 10 s poll (`App.tsx:2606`).
d. True for this file: limits fall back to Postgres, and `cached()` falls back to fetching. (BullMQ side jobs *do* stall without Redis, which is "queue delivery state".)
   INC-005 is the PR that broke this promise at the health endpoint.

## 9. Schema
a. One row = one thing that will happen to a village at `due_at` (an arrival, a return, a build finishing), with a `kind` and a JSON `payload`. It is
   `pending` until a resolver commits it (`done`), or `cancelled`. Resolvers poll for `pending` rows whose time has come.
b. `events_due ON scheduled_events(world_id,due_at,id) WHERE status='pending'`: equality on `world_id`, then already sorted by `(due_at,id)`. Postgres can walk
   the index in order and stop after `LIMIT` rows, with no sort. The partial predicate matches `status='pending'` exactly, so `done` rows (the vast
   majority after a few days) aren't in the index at all. A full index would grow with the whole history, and every scan would skip dead `done` entries.
c. Any of: the timers must commit **in the same transaction** as the game state they affect (no dual write between Redis and Postgres); Postgres
   survives Redis loss (INC-005's premise); replay/journal needs the event history in SQL. See `navigation/TRADEOFFS.md` W1 and `_answers/navigation/tradeoffs.md`.

## 10. Characterization test (reference sketch, UNVERIFIED: not run in this pass)
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { committedResolutions, eventLag, observeResolutions } from '../apps/server/src/metrics';

afterEach(() => { vi.useRealTimers(); observeResolutions(undefined); eventLag.reset(); });

describe('committedResolutions (current behaviour)', () => {
  it('observes lag in seconds and never negative', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:10.000Z'));
    const now = Date.now();
    const seen: { kind: string; lag: number }[] = [];
    observeResolutions((s) => seen.push(...s));
    committedResolutions([{ due: now - 1500, kind: 'movement' }, { due: now + 5000, kind: 'return' }]);
    expect(seen).toEqual([{ kind: 'movement', lag: 1.5 }, { kind: 'return', lag: 0 }]);
    const m = await eventLag.get();
    expect(m.values.find((v) => v.metricName === 'warband_event_lag_seconds_count')?.value).toBe(2);
    expect(m.values.find((v) => v.metricName === 'warband_event_lag_seconds_sum')?.value).toBe(1.5);
  });
});
```
- Why not `registry.metrics()`: it calls every gauge's `collect()`, and several of them run SQL (`warband_pending_events`, `warband_oldest_event_seconds`,
  `warband_outbox_backlog`). Without a database the test would hang or fail on a connection error.
- `pg.Pool` is lazy: constructing it opens no connection until the first `query`/`connect`. So importing `metrics.ts` is safe as long as nothing queries.
  (The `pool.on('error')` handler is registered, but no socket exists.) **UNVERIFIED** at runtime here. If vitest reports an open handle, add `afterAll(() => pool.end())`.
- The property that `Math.max(0, …)` protects is exactly the "future due" case. Removing it makes the second expectation fail (`lag: -5`) and the `_sum` becomes −3.5.
- Grading: full marks if the test checks behaviour through the public function (not by copying the formula), uses fake time, and avoids `registry.metrics()`.
