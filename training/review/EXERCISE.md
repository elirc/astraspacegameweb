# Blind review: Warband, "The Crownlands" (60 min)

You're the new staff engineer. The team says the game is "production-ready except for the load gate". Review it the way you would before
agreeing to be on call for it. **Don't open `_answers/`.**

## Scope (in this order)

1. The operating surface: `compose.production.yaml`, `Dockerfile`, `infra/` (Caddyfile, prometheus.yaml, alerts.yaml, tempo.yaml, grafana/), `.github/workflows/ci.yml`
2. Process roles and loops: `apps/server/src/bootstrap.ts`, `index.ts`, `metrics.ts`, `redis.ts`, `sidejobs.ts`
3. The engine's operating behaviour, not its game rules: `resolveDue`, `drain`, `transaction()`, `initialize()` in `packages/db/index.ts`, `packages/db/causality.ts`
4. Realtime: the `/api/ws` handler in `apps/server/src/transport/app.ts` and the socket effect in `apps/web/src/App.tsx`
5. Claims: `docs/architecture.md`, `docs/runbooks/*.md`, `docs/verification.md`. For each claim you check, write "verified at <path:line>" or "not true because …".

Skip: combat formulas (`packages/shared/game.ts`), CSS, and the map renderer. Authz and idempotency are already heavily drilled elsewhere, so note them only if severe.

## Output: `training/review/MY_FINDINGS.md`

For each finding:
`[SEV: critical|high|medium|low] [category] title` · evidence (`path:line` or a command you ran) · *what happens in production* · suggested fix (one line).

Categories: correctness, data integrity, concurrency, failure handling, operability/observability, deployment, performance/capacity, security, tests, maintainability.

Aim for **15+ findings**, at least **6 in operability or deployment**. Mark any finding you think is an *old-AI-generated smell*
(docs claiming more than the code does, config that looks complete but isn't wired, swallowed errors, a hard-coded fallback).

## Rules

- Evidence or it didn't happen. At least 3 findings must be backed by something you **ran**: a query in Prometheus, a `curl`, a test, `git` output.
  Lab 0 (`training/ops/LAB0-BRING-UP.md`) gives you a running stack.
- A finding is a production consequence, not a style preference. "Uses `any`" isn't a finding. "The metric that should page on X can never fire because Y" is.

When you're done, fill in `COMPARE.md`.
