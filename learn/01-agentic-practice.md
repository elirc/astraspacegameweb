# Agentic practice: direct an agent through this repo's incidents, then catch what it gets wrong

Each drill has the same four steps. Only step 2 is delegated.

1. **You write the spec** (by hand, 15–30 min): the problem in one paragraph, the invariant that must hold, the files the agent may touch, the tests that
   must fail before and pass after, and the non-goals.
2. **The agent implements it** on a scratch branch in a worktree, never on `main` and never on the incident branch itself:
   `git worktree add ../warband-drill-N training/incidents/00N-… && cd ../warband-drill-N && git switch -c drill/N`.
   Give it your spec, the incident brief and the files named below. Tell it to **show every command it ran and its output**.
3. **You review adversarially** with the checklist at the bottom, *then* open the sealed rubric in `learn/_answers/01-agentic-practice.md`.
4. **You write 5 lines:** what the agent got right, what it got wrong, and what you'd put in the spec next time.

Setup: `pnpm install --frozen-lockfile` in the worktree (`node_modules` is gone from `main` too). Anything that needs Postgres, Redis, Prometheus or
`promtool` **requires Docker, currently down**. Tick those boxes as "deferred: requires Docker" rather than trusting the agent's claim that it ran them.

Only do a drill after you've done the matching incident's diagnosis yourself (study route sessions 5–10). An agent that fixes a bug you
haven't diagnosed teaches you nothing, and you can't review it.

---

## Drill 1: M1 SLOs + burn-rate alerts (the flagship; 2 h)

The full procedure is `training/agentic/WORKFLOW.md`. Follow it exactly. Junior additions:

- Before SPEC.md, list the **exact** bucket bounds from `apps/server/src/metrics.ts` for `warband_event_lag_seconds` (line 19) and
  `warband_http_request_seconds` (line 56). Your spec needs `le="2"` for lag and `le="0.5"` for commands. Check each exists in the matching list.
- Add one line to your spec that the agent will probably ignore: *"the rules must evaluate to no alert at zero traffic."* See whether it does.
- Docker substitute: you can't run `promtool` here (the WORKFLOW uses `docker compose … exec prometheus promtool`). A standalone `promtool` binary from
  the Prometheus release archive would work but is **UNVERIFIED on this machine**. Otherwise mark those boxes deferred and review the YAML by hand
  against the idle case.

Review focus: `le="2"` vs `le="2.0"` (Prometheus 3 normalizes the label), `clamp_min(…)` in denominators, `for:` on burn-rate alerts, and selectors on a
`role` label that `infra/prometheus.yaml` doesn't produce.

## Drill 2: fix INC-003 (the silent second tab) with a test that would have caught it (60 min)

Branch: `training/incidents/003-second-tab-silent`. File: `apps/server/src/transport/app.ts` (`/api/ws` handler) and `apps/server/src/index.ts` (subscriber loop).

Your spec must include:
- The invariant, in your own words: *a close handler may only remove its own socket from the entry that is live right now.*
- The exact sequence the test must replay: connect A, connect B, A closes, A reconnects → B must still receive a hint.
- The layer: a unit test on an extracted registry (no Fastify, no DB). Optionally an `app.injectWS` test (needs Postgres for auth, so requires Docker, currently down).
- Non-goals: no per-player socket cap in this drill; don't touch `App.tsx`.
- Proof it's a real test: it must **fail on the incident branch's semantics** and pass after the fix. Ask the agent to show both runs.

## Drill 3: split `/api/health` after INC-005 (75 min)

Branch: `training/incidents/005-redis-blip-outage`. Files: `apps/server/src/application/game.ts` (`get_api_health`), `apps/server/src/transport/app.ts:79`
(the auth skip list), `infra/Caddyfile`, `compose.production.yaml` (healthcheck), `tools/sim/redis-outage.ts`, `tools/wait-ready.mjs`, `infra/alerts.yaml`.

Your spec must include:
- The table: live / ready / details. Which checks go in which, and which caller uses which. Write it *before* the agent sees the task.
- The rule: a **shared** dependency failure (Redis) must not remove every instance from the load balancer.
- The caller list. If the agent adds new endpoints but leaves Caddy on `/api/health`, nothing changed in production.
- A metric for Redis status (`warband_dependency_up{dep="redis"}` or similar), with a bounded label.
- Acceptance: `pnpm test:redis-outage` passes (requires Docker, currently down), plus a unit test of the readiness function with a fake Redis that throws.

## Drill 4: make INC-002 impossible to merge again (45 min)

Branch: `training/incidents/002-lag-panel-flat`. Files: `apps/server/src/metrics.ts`, `infra/alerts.yaml`, a new test file under `tests/`.

Spec: a vitest test that parses `infra/alerts.yaml`, finds every numeric threshold compared against `warband_event_lag_seconds`, and asserts the highest
finite bucket in `metrics.ts` is at least 2× that threshold. It must fail on the branch and pass on `main`. Non-goal: choosing new buckets. The agent will
want to "just add buckets". Don't let it. The deliverable is the *guard*, not the fix.
Extra (requires Docker, currently down): a `promtool test rules` file where every observation is 90 s and `EventLagHigh` must fire.

## Drill 5: stop a migration edit reaching production (INC-004; 45 min)

Branch: `training/incidents/004-deploy-crashloop`. Files: `packages/db/index.ts` `initialize()`, `packages/db/migrations/`, `.gitattributes` (new),
`.github/workflows/ci.yml`.

Spec: (a) a CI step that fails if any migration file that existed at the previous release tag has changed
(`git diff --name-only --diff-filter=M <tag> -- packages/db/migrations` must be empty); (b) `.gitattributes` with `*.sql text eol=lf`.
**Decide yourself** whether the agent may also change the checksum to hash normalized text. If you allow it, your spec must say what happens to a
database whose recorded checksums came from CRLF files. This is the trap in this drill.

---

## Verification checklist: before you trust agent output in *this* codebase

Paste evidence (command + output, or `path:line`) for each item into `drill-N/VERIFY.md`.

**Tests and gates**
- [ ] The new test **fails without the fix**. Revert the fix or check out the incident branch, run it, and paste the failure. A test that never failed proves nothing.
- [ ] `pnpm typecheck` and `pnpm lint` pass. `lint` includes `tools/check-boundaries.mjs`, which proves the ESLint boundary rules still *reject* forbidden imports.
- [ ] `pnpm test` (non-DB, 63 tests on `main` per B03) still passes. DB suites (`tests/*.integration.test.ts`) and `tools/sim/*.ts`: requires Docker, currently down.
      Mark them deferred and don't accept the agent's "ran them" without output.

**Invariants this repo depends on** (from `training/navigation/FIRST_CHANGE.md`)
- [ ] Postgres stays the only truth. No new code path makes correctness depend on Redis or on a WebSocket message (`apps/server/src/redis.ts`, `App.tsx` socket effect).
- [ ] "×7 processes": any new module-level side effect, `setInterval`, or async gauge `collect()` in `apps/server/src/metrics.ts` runs in every role. Is that intended?
- [ ] Simulation writes still go through `transaction()` + `lockCausalComponent()` + `drain()` (`application/engine.ts`, `packages/db/causality.ts`).
- [ ] Handlers in `apps/server/src/domain/events/handlers/` stay pure (no `db` import).
- [ ] **No existing file in `packages/db/migrations/` was edited**, not even whitespace or line endings. `git diff --stat main -- packages/db/migrations` shows only added files.

**Telemetry**
- [ ] Every metric name used in rules or dashboards exists in `apps/server/src/metrics.ts` (grep each one).
- [ ] Every `le="…"` is a real bucket bound, written the way Prometheus 3 stores it (`"2.0"`, not `"2"`).
- [ ] Every new label has a bounded value set (close codes, `kind`, `dep`). No player IDs or URLs as label values.
- [ ] Any `clamp_min`, `or vector(0)`, `absent()` or `unless`: write down what it does at zero traffic and during a deploy.

**Security and ops spots**
- [ ] `/api/health` and any new probe endpoint: is it in the auth skip list at `transport/app.ts:79` on purpose? Does it leak internals without auth?
- [ ] No secrets added. `.env` and `infra/runtime/metrics_token` stay untracked. The `JWT_SECRET` fallback at `transport/app.ts:47` isn't copied anywhere new.
- [ ] Nothing under `artifacts/` was overwritten (the drills in `tools/sim/` write there).
- [ ] Reversible: you can describe the exact revert, and no DB state change is left behind.

**Honesty**
- [ ] Every "I ran X" in the agent transcript has pasted output. Anything else is treated as not run.
