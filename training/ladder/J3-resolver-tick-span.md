# J3: One trace per resolver tick (junior+)

## Context
Lab 0 question 7: in Tempo, `warband-resolver` produces thousands of one-span "traces" (`pg-pool.connect`, a lone `pg.query:SELECT`). BEGIN, COMMIT and
ROLLBACK are separate traces, because `resolveDue()` runs from a `setInterval` in `apps/server/src/index.ts` with no active span. OpenTelemetry is started in
`apps/server/src/bootstrap.ts` with auto-instrumentation only. `docs/runbooks/stuck-event.md` tells on-call to "correlate resolver logs by request/trace ID".

## Ticket
> Wrap every resolver tick in a root span `resolver.tick` with attributes `warband.selected` (candidate villages), `warband.resolved` (events committed)
> and `warband.outcome` (`committed | empty | busy | error`). The pg spans become its children. Do the same for the relay tick (`relay.tick`, `warband.published`).

## Constraints
- `@opentelemetry/api` must be a direct dependency if you import it. Check `package.json` and whether pnpm's strict layout lets you import it today.
- No behaviour change: the busy/empty paths still return 0. You're only *reporting* the outcome.
- Empty ticks happen 20 times a second per resolver. Decide what to do with them (sample? drop? record?) and justify it with a number from Lab 0.

## Definition of done
- Seen live: Tempo shows `resolver.tick` traces with children BEGIN → plan SELECTs → … → COMMIT. Screenshot one `committed` and one `busy`.
- A TraceQL query that finds busy ticks: `{ name = "resolver.tick" && span.warband.outcome = "busy" }`. Paste the count for a 60 s run with 3 resolvers.
- Unit test: an in-memory span exporter (`InMemorySpanExporter` from `@opentelemetry/sdk-trace-base`) records one `resolver.tick` span with the right outcome for a stubbed `resolveDue`.

## Explain before touching
1. Why does each pg query currently become its own trace? (What is the "active context" when `setInterval` fires?)
2. `resolveDue` decides "busy" inside a `catch`. How will the span learn the outcome without changing the function's return type for existing callers
   (`tools/sim/worker.ts` also calls it)?
3. What does this do to trace volume and Tempo storage? Estimate spans/s for 3 resolvers × 20 ticks/s.
4. Could this change hide an error that is visible today?

<details><summary>Hints</summary>

- `tracer.startActiveSpan(name, async (span) => { … span.end() })` makes children attach automatically through AsyncLocalStorage.
- Consider returning `{ resolved, outcome }` from a new function and keeping `resolveDue()` as a thin wrapper.
- `OTEL_TRACES_SAMPLER=parentbased_traceidratio` affects roots only.
</details>

Sealed answer: `_answers/ladder/J3.md`
