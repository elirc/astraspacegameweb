# 20 technical questions about this codebase

Answer out loud, then check `_answers/interview-technical.md`. Every answer must name a file or a measurement.

## API design
1. `POST /api/villages/:id/command` requires an `Idempotency-Key`, and the key is scoped per player (`idempotency_keys(player_id,key)`). What does a client
   see when it retries with the same key and a *different* body, and why is that a 409 rather than a replay?
2. Every JSON response gets `server_now` injected by a `preSerialization` hook (`transport/contracts.ts`). Why does a game client need it, and what does
   `App.tsx` do with it?

## Database
3. `drain()` locks due events with `SELECT … FOR UPDATE` and villages with advisory **and** row locks. Why both kinds for villages?
4. `resolveDue()` runs its transaction with `maxAttempts = 1`, while commands get 5 attempts. Why the difference, and what did it cost in observability?
5. `initialize()` runs every migration inside one transaction under an exclusive advisory lock. Name one benefit and two production costs.
6. Why do `player_scores` and `support_links` exist when both can be derived from `villages`? How are they kept consistent (`007_incremental_indexes.sql`)?

## Realtime and React
7. The WS payload is the raw outbox row. Why doesn't the client apply it directly to its React Query cache?
8. What happens to a tab's live updates when the API instance holding its socket restarts? Walk through the close codes and `App.tsx` backoff.
9. `queryRefresh.ts` refuses to cancel an in-flight refetch when a new hint arrives. Why is "cancel and restart" wrong here?

## Testing
10. `tools/sim/chaos.ts` compares the final world with a serial reference run. What property does that prove, and what can it *not* prove about performance?
11. Why did the e2e suite stay green through INC-003, and what's the cheapest test that would have failed?
12. Where would you put a test that alert rules can fire, and why not in vitest?

## Security
13. Refresh tokens: what happens when a stolen refresh token is used after the real client already rotated it? (`post_api_auth_refresh`)
14. `/metrics` is protected by a bearer token only when `NODE_ENV=production`, and Caddy blocks `/metrics` at the edge. Which deployment mistake exposes it anyway?

## Operations
15. Give the PromQL for "fraction of battles resolved within 2 s over the last hour". Why is it more trustworthy than `histogram_quantile(0.99, …) < 2`?
16. `warband_pending_events` is computed during every scrape of every process. What happens to your dashboards when Postgres stalls for 10 s?
17. During a Redis outage, what keeps working, what degrades, and which component would you check first to prove it?
18. On this laptop, 3 resolvers sustain ~110–120 events/s. How would you find out whether a 4th helps, without deploying it to production?
19. Traces from the resolver are one span each. What's the root cause, and what's the one-line idea of the fix?
20. `compose.production.yaml` uses `build: .`. Walk through a rollback at 3 a.m. with this file, and then with the fix you'd make.
