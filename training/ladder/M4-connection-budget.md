# M4: The Postgres connection budget (mid)

## Context
`packages/db/index.ts` creates `new pg.Pool({ max: 16 })` in every process. `compose.production.yaml` runs api×2, resolver×3, relay and sidejobs.
Add `pnpm db:migrate` and `pnpm admin` from the runbooks, plus a psql session during an incident. Stock PostgreSQL 16 has `max_connections = 100`, with
3 reserved for superusers. Nobody exports pool statistics.

## Ticket
> Establish a connection budget per role, make it configurable (`DATABASE_POOL_MAX`), export pool metrics (`warband_db_pool_total/idle/waiting`), and alert
> when requests wait for a connection. Reproduce the failure first.

## Constraints
- Reproduce on your laptop: start the dev Postgres with `-c max_connections=40` (a compose override file in `training/ops/`), then run Lab 0's five roles
  plus `INJECT_RATE=150`. Capture the first `sorry, too many clients already` (or pool timeout) and say which role hit it first.
- The budget must be written down per role, with the reasoning (which loops hold connections, for how long: `drain`, sidejobs' SMTP-inside-transaction, WS heartbeats).
- No PgBouncer in this ticket. Say in one paragraph when you *would* add it and what breaks: transaction-scoped advisory locks are fine; session-level state is not.

## Definition of done
- Failure reproduced, with the log line and the time.
- `DATABASE_POOL_MAX` per role in `compose.production.yaml`. The sum is documented and below `max_connections − reserve`.
- Pool gauges visible in Prometheus. Alert `DbPoolWaiting: max(warband_db_pool_waiting) > 0 for 1m`.
- Re-run the reproduction: no connection errors, and the waiting gauge shows where the pressure is.

## Explain before touching
1. For each role: what holds a connection, and for how long (`transaction()`, `pool.query`, `collect()`)?
2. What happens in `pg.Pool` when `max` is reached? What is the default `connectionTimeoutMillis`, and what does the caller see?
3. Why might the resolver role need *fewer* connections than the API?
4. What does a 3-replica resolver change cost in connections? Put the formula in the doc.

<details><summary>Hints</summary>

- `pool.totalCount`, `pool.idleCount`, `pool.waitingCount` exist on `pg.Pool`. Read them in a gauge `collect()`. That's cheap: no SQL.
</details>

Sealed answer: `_answers/ladder/M4.md`
