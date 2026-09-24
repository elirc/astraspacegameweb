# Before your first production change here (1 page)

1. **Postgres is the only truth. Redis and WebSockets are hints.** A WS message tells the client "refetch", never "here is the new state" (`App.tsx` socket →
   `refreshRef.current.request()`). If your change makes correctness depend on Redis, it's wrong. `docs/architecture.md` and INC-005 both say so.
2. **Every role runs the same code.** `ROLE` only switches loops on and off (`apps/server/src/index.ts`). A module-level side effect, a new `setInterval`, a new
   async `collect()` in `metrics.ts`, or a migration runs in *seven* processes in production. Ask "what happens ×7?"
3. **Simulation writes go through the lock protocol.** Anything that mutates a village or an event takes `transaction()` + `lockCausalComponent()` + `drain()`
   first (`engine.ts` `command()` is the template). Never `UPDATE villages` directly outside a reviewed migration/maintenance under `worldLock`
   (`docs/runbooks/locks.md`). Read `docs/adr/001-causal-components.md` before touching `causality.ts`.
4. **Handlers are pure.** `domain/events/handlers/*.ts` get a context and push effects. They mustn't import `db` (ESLint boundaries enforce this). Determinism
   is what makes replay (`application/replay.ts`) and the chaos drill's "identical" check possible.
5. **Migrations are append-only, and bytes matter.** A new numbered `.sql` file. Never edit an applied one, not even a comment or line endings
   (`initialize()` checksums raw bytes; INC-004). Expand/contract per curriculum page 07.
6. **Contention and backlog are silent today.** A change to how resolvers select work (INC-001), to histogram buckets (INC-002) or to `/api/health` (INC-005) can
   degrade production without a single error log. Bring a measurement: Lab 0 + `training/ops/inject.ts` before/after.
7. **Run before you push:** `pnpm lint` (includes the boundary probe), `pnpm typecheck`, `pnpm test` (non-DB: 63 tests, ~40 s), the integration tests against
   a `*_test` DB, `node --import tsx tools/sim/redis-outage.ts`, and for engine changes `tools/sim/chaos.ts` (needs `infra/chaos/compose.yaml`). If a drill
   fails "flakily", read its output before re-running (INC-005).
8. **Don't overwrite evidence.** `artifacts/` holds the project's verification evidence referenced from `docs/verification.md`. `tools/sim/*.ts` write into it.
   Run drills from a worktree when you only want to *look*.
9. **Secrets:** `.env` and `infra/runtime/metrics_token` are local and git-ignored. Never commit them. `pnpm configure:local` generates them.
10. **Know who's watching:** Grafana "Warband world health" (`infra/grafana/dashboards/world.json`) and 4 alerts in `infra/alerts.yaml`. There's no Alertmanager, so
    until someone adds one, *you* are the pager during your own release.
