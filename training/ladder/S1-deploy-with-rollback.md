# S1: A release process with a rollback you have rehearsed (senior)

## Situation
The world has 3,000 nightly players. Releases today: build on the server from a git checkout, `docker compose -f compose.production.yaml up -d`, and watch Grafana.
INC-004 showed what that costs: there's no image identity (`build: .`), migrations run inside every role at boot, compose recreates containers in place
(so old and new never overlap), and nothing decides "roll back" except a human reading dashboards. The project's own runbook
(`docs/runbooks/deployment.md`) describes a better process than the files implement.

## The problem to solve
Design, implement in `training/deploy/`, and **rehearse twice** a release process for this compose topology (no Kubernetes) that:
1. builds one image per commit, tagged by SHA, used by all four roles;
2. runs migrations once, as a gated step, refusing any change to an applied file (and surviving CRLF checkouts);
3. rolls API instances with overlap (new healthy before old removed; WebSockets get 1012 and reconnect), then resolvers one at a time;
4. decides rollback automatically from SLO signals (your M1 rules) within a bounded window, and rolls back with one command;
5. never needs a schema rollback (expand/contract, curriculum page 07).

## Constraints
- The single-host compose topology stays. You may add services (e.g. `migrate`), override files and a shell/tsx release script.
- Rehearsal A: release a *good* change (any harmless log line). Rehearsal B: release the INC-004 branch as the "bad" release. Your process must stop it before
  any player-facing role is replaced, **or** roll it back automatically. Record timestamps.
- In-flight resolver transactions must be allowed to finish (`stop_grace_period: 60s` exists. Is it enough? What does `close()` in `index.ts` wait for?).
- Write down what's *not* covered: the DB host, Redis, secrets rotation, a region failure.

## Deliverables
- `training/deploy/DESIGN.md` (≤ 2 pages): the release state machine, the gates, the rollback triggers with thresholds, and failure modes of the release tooling itself.
- Scripts plus a compose override file. Both rehearsal logs with timings (build, migrate, API swap, resolver roll, verify, rollback).
- A 5-line operator cheat sheet: release, check, roll back, abort, and "who to page".

## Pressure points your design must answer
- Two API versions serve traffic at once for N seconds. Which contracts must stay compatible (`/api/state` shape, WS hint format, idempotency keys)?
- A migration succeeded, then the app rollback happens. Why is that safe here, and when wouldn't it be?
- The auto-rollback fires on a real traffic spike during the release. How do you tell "bad release" from "bad evening"?
- Caddy's `health_uri` decides routing. What must `/api/health` mean for this to work (see INC-005)?

Sealed answer: `_answers/ladder/S1.md`
