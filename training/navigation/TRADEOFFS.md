# Senior trade-offs: "Why?" drills

For each decision, write your own answer in the "Why?" format *before* opening `_answers/navigation/tradeoffs.md`:
**Problem → naive approach → where it fails → options A/B/C → trade-offs → choice → failure modes → how it's tested → how it's monitored → when to revisit.**
Cite files for every claim.

## W1: Game timers are rows in Postgres, resolved by polling workers, not BullMQ delayed jobs
The v1 of this game (Desktop\spacegame) used BullMQ for every timer. Here `scheduled_events` + `resolveDue()` every 50 ms (`apps/server/src/index.ts`),
and BullMQ is kept only for email/push/rankings/maintenance (`sidejobs.ts`). Why?

## W2: Causal-component locking instead of one global lock or per-village locks
`packages/db/causality.ts` + `docs/adr/001-causal-components.md`. Morale reads player-wide points, support links villages, conquest redirects returns. Why not a
single world lock (simple, correct) or plain per-village row locks (fast)? What does INC-001 tell you about the cost of this choice?

## W3: The event journal stores every read the handler made
`engine.ts` `resolveEvent` wraps the transaction in a `Proxy` that records each query's SQL, params and rows into `event_journal.context.reads`. That's
~19% of resolver time in the profile. Why pay it?

## W4: Migrations run at startup in every process, guarded by a checksum
`packages/db/index.ts` `initialize()`. The alternative is a separate migration job (which `docs/runbooks/deployment.md` step 4 also describes). Why might the
authors have chosen boot-time migration, and when does it stop being right? (INC-004 is the "when".)

## W5: One image, many roles, selected by an environment variable
`compose.production.yaml` runs api/resolver/relay/sidejobs from one build with `ROLE`. Every role still starts the HTTP server. Why not separate entrypoints or services?
