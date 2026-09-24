# M2: Measure the resolver capacity curve and name the bottleneck (mid)

## Context
`docs/verification.md` records failed load probes (e.g. 4,968/10,000 arrivals and p99 lag 39.5 s with three workers). `docs/production-work.md` leaves
"1,000 arrivals/s for ten minutes" unchecked. Nobody has written down *how many events/s one resolver can do* and *what limits it*. Without that,
"add replicas" is a guess. (INC-001 showed that 1 → 3 resolvers barely helps on `main` on this laptop.)

## Ticket
> Produce `training/ops/CAPACITY.md`: sustained events/s for 1, 2, 3 and 4 resolvers, and for `RESOLVER_BATCH_SIZE` 100/300/1000 at 3 resolvers,
> on this machine, with the limiting resource for each point and a recommendation.

## Constraints
- Use `training/ops/inject.ts` (a backlog drain *and* a steady rate) plus Lab 0's roles. Don't run `pnpm test:load` against the dev DB. It targets the drill
  DB on 55433 and writes into `artifacts/`, which holds the project's evidence files.
- Each point needs ≥ 2 runs. Report the spread, because this laptop is noisy (a 104 s vs 252 s pair was observed for the same configuration).
- Enable `pg_stat_statements` in the dev Postgres for the session (`shared_preload_libraries` needs a restart. Document how you did it, or use
  `PROFILE_RESOLVER=1` with `tools/sim/worker.ts` instead).

## Definition of done
- A table: config → events/s (mean, min, max) → Postgres CPU % → top 3 statements by total time → rollbacks/commit.
- A graph or ASCII chart of throughput vs resolver count.
- One paragraph: "The bottleneck is X because Y. The next change to try is Z, and I expect it to buy N%."

## Explain before touching
1. What *is* one unit of resolver work? (Follow `resolveDue` → `lockCausalComponent` → `drain` → the bulk writes at the end of `drain`.)
2. Which statements scale with batch size, and which run once per transaction regardless? Where does the fixed cost dominate?
3. How do you tell "CPU-bound in Postgres" from "waiting on locks" from "waiting in Node"? Name the queries/tools for each.
4. Why can more resolvers make things *slower*? Use your INC-001 evidence.

<details><summary>Hints</summary>

- A reference profile of one resolver on `main` (6,000-arrival backlog): 78 s total, ~522 events/tick. The biggest costs are `INSERT INTO event_journal` (15 s),
  `INSERT INTO reports` (11.6 s), the causal-plan SELECT (6.6 s over 46 calls). Your numbers will differ. Reproduce them, don't copy them.
- `docker stats astraspacegameweb-postgres-1` gives you DB CPU cheaply.
</details>

Sealed answer: `_answers/ladder/M2.md`
