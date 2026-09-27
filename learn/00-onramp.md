# On-ramp: 10 warm-ups before `training/`

Each exercise takes 10–20 minutes. You need only an editor and this repo; none of them need Docker. #10 needs `pnpm install --frozen-lockfile`
first (`node_modules` was removed to free disk space). Write your answers in `learn/MY_ONRAMP.md`, then check them against
`learn/_answers/00-onramp.md`. Aim for 8 of 10 before you start `training/`.

---

## 1. Predict: what does a resolver process actually do? (read `apps/server/src/index.ts`)

You start `ROLE=resolver PORT=3002 npx tsx apps/server/src/bootstrap.ts`. Without running it, answer these:

a. Does it run the migrations? (line 16)
b. Which of the four `setInterval` loops (resolver, relay, NPC, gauges) do real work, and which return early?
c. Does it subscribe to Redis `warband:events`?
d. Does `curl http://127.0.0.1:3002/api/health` answer? Does `/metrics`?
e. Why does (d) matter for INC-004 ("every role restarts in a loop")?

## 2. Trace: from a database row to a browser refetch

A resolver has just committed a battle and inserted an `outbox` row for the defender. List every hop until the defender's browser re-reads
`/api/state`. Give `file:line` for each hop. Start at `apps/server/src/index.ts:59` and end in `apps/web/src/queryRefresh.ts`.
Then answer: **what does the WebSocket message contain, and why doesn't the client just apply it?**

## 3. Read: the WebSocket registry on `main`

Read `apps/server/src/transport/app.ts` lines 116–145.

a. What is the type of `sockets`, and what's the key?
b. Tab A connects, then tab B connects for the same player, then A closes. What's in `sockets.get(player)` after each step?
c. The close handler uses `set`, a variable captured when the socket connected. Why is that safe *on `main`*? (Hold on to this answer. INC-003 breaks it.)
d. Name the two timers that can close a socket, and their close codes.

## 4. Histogram math: what can the lag panel show?

`warband_event_lag_seconds` has buckets `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60]` (`apps/server/src/metrics.ts:19`).
`histogram_quantile` returns a value by linear interpolation inside the bucket where the target rank falls.

a. 1,000 events each commit exactly **0.3 s** late. What does `histogram_quantile(0.99, …)` return? (Hint: it's not 0.3.)
b. 1,000 events each commit **90 s** late. What does it return?
c. Why is the answer to (b) dangerous for an alert written as `… > 120`?

## 5. The counter that never moves

The dashboard shows `warband_lock_retries_total` = 0 during heavy resolver contention. Using only the code, explain why. Follow these:
`metrics.ts` (the gauge with `collect()` reading `dbCounters.retries`), `packages/db/index.ts` `transaction()` lines 71–81, and
`apps/server/src/application/engine.ts` `resolveDue()` lines 796–809 (look at the second argument to `transaction`, and at the `catch`).
Bonus: the metric is a **Gauge** whose name ends in `_total`. What goes wrong when this process restarts?

## 6. Predict: the migration checksum (`packages/db/index.ts` `initialize()`, lines 134–156)

The database was migrated by yesterday's release. Today you open `packages/db/migrations/013_npc_players.sql` and add one comment line at the top.

a. What exactly happens when *any* role starts? Quote the line that throws.
b. Does `014_spawn_frontier.sql` or any later file run? Is the database left half-migrated? (Look at what wraps the whole function.)
c. Git on this laptop has `core.autocrlf=true`, and the repo has no `.gitattributes`. Describe a way to hit the same error **without editing any file**.

## 7. Who asks "are you healthy?"

a. What does `/api/health` check today? (`apps/server/src/application/game.ts:62`)
b. Is it behind authentication? (`apps/server/src/transport/app.ts:79`)
c. Find every caller: `infra/Caddyfile`, `compose.production.yaml` (the `healthcheck` and a `depends_on`), and `tools/sim/`. For each one, what does it do when the endpoint returns 500?
d. Postgres goes down for 30 s. Walk through what players see.

## 8. Redis goes away: what still works?

Read `apps/server/src/redis.ts` (44 lines) and the relay loop in `index.ts:59-60`.

a. With Redis down, does rate limiting still work? Where does the count live, and is it shared by both api instances?
b. What's the storage key for player 7's movement limit in a 60 s window? Why does the key contain a bucket number, and what deletes old rows?
   (Search for `rate_buckets` in `apps/server/src/sidejobs.ts`.)
c. What happens to outbox rows while Redis is down? Are they lost?
d. `docs/architecture.md` says Redis "only holds disposable caches, queue delivery state and invalidation hints". Is that true of this file?

## 9. Explain the schema: the table that *is* the game clock

Read the `scheduled_events` table and the two indexes under it in `packages/db/migrations/001_initial.sql` (lines 8–10).

a. Explain in plain words what one row means, and what `status` values it moves through.
b. The resolver query is `… WHERE world_id=1 AND status='pending' AND due_at<=statement_timestamp() ORDER BY due_at,id LIMIT $1`
   (`engine.ts:786-790`). Why does the partial index `events_due` fit that query well? What would a full (non-partial) index cost?
c. Why are game timers rows in Postgres rather than BullMQ delayed jobs? Give one reason, then check it against `training/navigation/TRADEOFFS.md` W1.

## 10. Write one characterization test: `committedResolutions`

`committedResolutions(events)` in `apps/server/src/metrics.ts` (lines 27–36) turns `{ due, kind }` items into lag observations.
Write `tests/metrics-lag.test.ts` (vitest, like `tests/client-refresh.test.ts`) that pins down **current** behaviour:

- An event due 1,500 ms in the past is observed as 1.5 s.
- An event due in the *future* (clock skew) is observed as 0, never negative.
- The observer registered with `observeResolutions` gets one sample per event, with the right `kind`.

Constraints:
- Use `vi.useFakeTimers()` + `vi.setSystemTime()`. Don't sleep.
- Read the histogram with `await eventLag.get()`, **not** `registry.metrics()`. Why? Look at what the other gauges' `collect()` functions do.
- Importing `metrics.ts` also imports `packages/db`, which creates a `pg.Pool`. Does that open a connection at import time? Decide before you run it.

Run: `pnpm install --frozen-lockfile` (once), then `npx vitest run tests/metrics-lag.test.ts`.
Exit: the test passes; delete `Math.max(0, …)` and exactly one case fails; put it back. **Don't commit the test to `main`.** Keep it on a scratch branch.
