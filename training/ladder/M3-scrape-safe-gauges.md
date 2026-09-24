# M3: Backlog gauges that survive the incident they exist for (mid)

## Context
`apps/server/src/metrics.ts` defines `warband_pending_events`, `warband_oldest_event_seconds` and `warband_outbox_backlog` with `async collect()` callbacks.
Every scrape of **every** process (7 in `compose.production.yaml`) runs the same global SQL on that process's 16-connection pool. `EventLagHigh` and
`OutboxBacklog` depend on these gauges. If the DB is saturated, or a resolver's pool is fully checked out by `drain`, what happens to the scrape?

## Ticket
> Make the backlog gauges cheap, single-sourced and failure-tolerant: computed by one role on a timer with a statement timeout, exported with a
> `warband_backlog_sample_age_seconds` freshness gauge, and absent from the other roles. Add an alert for a stale sample.

## Constraints
- Measure first: in Lab 0 at 150/s, record `scrape_duration_seconds` per target and the gauges' query times (`EXPLAIN (ANALYZE, BUFFERS)`) at 0 and at 8,000 pending.
- Only one role owns the sample. Pick it, and handle "that role is down". That's exactly when the freshness alert must fire, not silence.
- `SET LOCAL statement_timeout = '2s'` (or a dedicated 1-connection pool). Say which, and why.
- Keep the metric names so `infra/alerts.yaml` and `world.json` don't change.

## Definition of done
- Before/after table: scrape duration p95 per role, DB queries/s from scrapes.
- Drill: pause Postgres for 10 s (`docker pause astraspacegameweb-postgres-1`; `unpause`). Show that scrapes of the API/resolver roles still succeed, the
  freshness gauge rises, and your stale-sample alert goes pending.
- Unit test: the sampler keeps the last good value and marks it stale when a query times out.

## Explain before touching
1. How does prom-client handle a rejected `collect()`? Does the whole scrape fail or one metric? (Find out. Don't guess.)
2. `max(warband_pending_events)` across 7 identical copies: what does `max` hide when one copy is stale?
3. What's the trade-off between a scrape-time value (fresh, expensive, fragile) and a timer value (cheap, possibly stale)?
4. Which alert should depend on the freshness gauge, and how do you avoid double-paging?

<details><summary>Hints</summary>

- The sidejobs role already has timers and runs once per deployment.
- Look at `prom-client`'s `Registry.metrics()`: it awaits every collect.
</details>

Sealed answer: `_answers/ladder/M3.md`
