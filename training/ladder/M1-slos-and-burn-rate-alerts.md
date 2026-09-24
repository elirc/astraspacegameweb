# M1: Two SLOs, burn-rate alerts, and a drill that proves they fire (mid)

**This is the ticket for the agentic workflow** (`training/agentic/WORKFLOW.md`).

## Context
`infra/alerts.yaml` has four threshold alerts and no SLO. `docs/verification.md` defines a *certification* target (p99 committed lag < 2 s,
API/command p95 < 150 ms) but nothing turns it into an operating objective. Lab 0 showed that quantile panels clip at their top bucket (60 s lag, 30 s resolver).

## Ticket
> Define and ship two SLOs for world 1:
> 1. **Battle timeliness:** 99% of resolved events commit within 2 s of `due_at`, over 28 days.
> 2. **Command success:** 99.5% of `POST /api/villages/:id/command` requests return non-5xx within 500 ms, over 28 days.
> For each: recording rules for the SLI, multi-window multi-burn-rate alerts (page: 1h+5m at 14.4×; ticket: 6h+30m at 6×), a Grafana row with
> SLI, error budget remaining and burn rate, and a runbook section.

## Constraints
- Write the rules in `training/ops/slo-rules.yaml`. Promote them to `infra/` only after the drill passes.
- The SLI must be a **ratio of bucket counters**, not a quantile. `le="2"` and `le="0.5"` must be exact bucket bounds in `metrics.ts`. Check them.
- Exclude probe and scrape traffic from the command SLI. Say which routes you excluded and why.
- The lag SLI only sees *committed* events. Add a guard alert for work that never commits, and explain why the SLO alone can't catch a stopped resolver.
- `promtool test rules` unit tests: one where the page must fire and one where it must not.

## Definition of done
- `docker compose -f training/ops/compose.observe.yaml exec prometheus promtool check rules …` and `promtool test rules …` both pass. Paste the output.
- Drill: with Lab 0 running, `INJECT_RATE=150` → the timeliness **page** fires. Record the time from the start of the injection to firing, and the burn-rate values.
  Then kill all resolvers with no injection → your guard alert fires within 3 min.
- Runbook entry: what each alert means, the first 3 queries to run, and when to escalate.

## Explain before touching
1. What exactly is a "bad event" for SLO 1? Can an event be counted twice (think about `resolveEvent` retries and `afterCommit` in `packages/db/index.ts`)?
2. Where do the numbers come from: which process emits the histogram, and at what moment? What does `role` look like in production (dns_sd, `instance` = IP)?
3. At 150 arrivals/s on this laptop the world falls behind within seconds. Is a 14.4× burn page "too sensitive" for a game? Argue with numbers.
4. What happens to your alerts when a histogram's buckets change (series reset)? When a replica restarts (counter reset)?
5. Trade-offs: a 28-day window vs 7 days for a game with evening peaks.

<details><summary>Hints</summary>

- Error ratio for SLO 1: `1 - (sum(rate(warband_event_lag_seconds_bucket{le="2"}[1h])) / sum(rate(warband_event_lag_seconds_count[1h])))`.
- 14.4 × (1 − 0.99) = 0.144. Page when both the 1h and 5m ratios exceed 0.144.
- For the guard: `max(warband_oldest_event_seconds)` exists and doesn't depend on commits.
</details>

Sealed answer: `_answers/ladder/M1.md`
