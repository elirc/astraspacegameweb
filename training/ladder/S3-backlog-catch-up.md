# S3: Catching up after a 6-hour resolver outage (senior)

## Situation
A managed-Postgres incident left the resolvers unable to commit from 01:00 to 07:00 (the API stayed read-only). At 07:00 there are ~2.1 M overdue
`scheduled_events` (builds, recruits, 180k battles, returns, market caravans). Players wake up. Every command drains its causal component first
(`application/engine.ts` `command()` → `lockCausalComponent` → `drain`). So a player whose village is entangled in last night's battles makes the API pay for
resolving hours of history inside their request. `EventLagHigh` has been firing for 6 hours. The support inbox is full.

## The problem to solve
Write the catch-up plan (≤ 2 pages) and a runbook section `docs/runbooks/catch-up.md` (draft it in `training/`), then **rehearse a scaled-down version**:
~60k overdue events from `training/ops/inject.ts` (e.g. `INJECT_RATE=6000 INJECT_SECONDS=10`), with Lab 0 roles and your M1 dashboards.

Cover:
1. **Order and correctness:** events must still resolve in `(due_at, id)` order per causal component. Is global order required? What stops a resolver from applying
   07:00 events before 01:00 events in the same component?
2. **Protecting commands:** API p95 during catch-up. Options: a read-only banner and 503 for commands on entangled components, a command-side drain budget
   (fail fast with 409 "world is catching up"), or temporarily more resolvers. Pick one and quantify it.
3. **Throughput levers you can pull at 07:00 without a deploy:** `RESOLVER_BATCH_SIZE`, resolver replicas, `RESOLVER_POLL_MS`, pausing NPCs (`runNpcBatch`),
   pausing side jobs. Which help and which hurt (INC-001, M4)?
4. **Players:** push/email volume when 180k battle reports land at once (relay 500 rows/100 ms; sidejobs push concurrency 4). Do you throttle, batch, or skip pushes for events older than X?
5. **Signals and exit criteria:** what the dashboard shows during catch-up, what "done" means, and which alerts to silence (and which must *never* be silenced).

## Constraints
- No manual `UPDATE scheduled_events SET status='done'` (`docs/runbooks/stuck-event.md`, `recovery.md`).
- The rehearsal must record: time to drain, API command p95 during the drain, and the peak outbox/side-effect backlog.

## Pressure points
- A tribe claims a noble train "should have landed before" the defender's support at 03:12. With ordered replay, prove who's right using `event_journal`
  and the replay tool.
- Halfway through, one resolver keeps failing on the same event (a poison event). What do you do without stopping the world?

Sealed answer: `_answers/ladder/S3.md`
