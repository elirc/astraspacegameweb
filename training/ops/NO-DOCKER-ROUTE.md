# No-Docker route: practise the lab when the stack won't start (B08 addition)

**Gap this fills:** everything in this lab assumes a running Postgres/Redis/Prometheus/Grafana/Tempo stack, and Lab 0 §6 only covers questions 1–6 of
Lab 0 without it. As of 2026-09-26, Docker on this laptop is broken (the WSL distro is gone). This page gives each incident a substitute
that needs only `git`, a text editor and plain `node` (no `pnpm install`). Your scripts go in a scratch folder **outside the repo**.

These are substitutes, not equivalents. Mark every note you write here `NO-DOCKER`, and redo the live step once Docker works.
Reference answers: `training/_answers/no-docker-route.md`. Open them only after you've written your own.

## Part A: Lab 0 from recorded evidence (30 min, after Lab 0 §6)

Data: `training/ops/evidence/baseline-150rps-3resolvers.jsonl` (main, 150 arrivals/s for 90 s from 05:24:35, 3 resolvers, one sample every ~10 s).

A1. Write a plain `node` script that reads the file and prints one line per sample: `t`, `resolved_per_s`, `pending_due`, `oldest_s`, `lag_p99`, `alerts`.
    Careful: the file contains `NaN`, which is not valid JSON. How do you parse it anyway?
A2. From your output, estimate the **net backlog growth** in events/s between 05:24:46 and 05:26:12. Is the system keeping up?
A3. Find the first sample where `lag_p99` equals a bucket bound exactly and then never changes. Find the same for `resolver_tx_p99`. Which lines of
    `apps/server/src/metrics.ts` explain both numbers?
A4. How many seconds passed from injection start (05:24:35) to the first sample with `EventLagHigh` in `alerts`? The rule has `for: 2m`
    (`infra/alerts.yaml`). Work out roughly when it must have gone *pending*.
A5. At 05:26:36 two of the three resolvers show 0.0 events/s while `resolver_errors` and `lock_retries` are both 0. Give two explanations that fit
    the data, and say what extra signal would tell them apart.

## Part B: INC-002 by hand (20 min)

B1. From the bucket dump in `training/incidents/002-lag-panel-flat.md` (`le=2.0: 2 … +Inf: 27000`), compute `histogram_quantile(0.5, …)` and
    `histogram_quantile(0.99, …)` by hand. Show the rank and the bucket each one falls in.
B2. Write, but don't run, a `promtool test rules` file for the branch's `infra/alerts.yaml` (read it with `git show training/incidents/002-lag-panel-flat:infra/alerts.yaml`).
    It should feed `warband_event_lag_seconds_bucket` series where every observation is 90 s, and assert that `EventLagHigh` fires. Which `le` series
    can you even write for 90 s on this branch? What does that tell you?

## Part C: INC-003 as a 25-line simulation (30 min)

C1. In a plain `node` script, model `sockets` as `new Map()` and each socket as `{ name, closed:false, onclose:null }`. Implement two versions of
    `connect(player, socket)`: the `main` version (`apps/server/src/transport/app.ts:116-145`) and the branch version
    (`git show training/incidents/003-second-tab-silent:apps/server/src/transport/app.ts`). Both must use the **same** close handler
    (`set?.delete(socket); if (!set?.size) sockets.delete(id)`), with `set` captured by closure.
C2. Replay the sequence: connect A, connect B, (branch only: A is closed by the server) run A's close handler, connect A2. Then print
    `sockets.get(player)` as names, and whether B is registered.
C3. Now change only the close handler to the reference fix (look up the live entry with `sockets.get(id)` instead of using the captured `set`), and keep
    each version's connect logic. Replay C2 again. Is B registered in the `main` version? What happens to B in the branch version at the moment A2
    connects, and what would the two tabs then do to each other every second? What does that tell you about fixing only the handler?

## Part D: INC-004 with `git` and `node` only (20 min)

D1. Run `git ls-files --eol packages/db/migrations | head`. What do the `i/` and `w/` columns tell you about this checkout? Then run
    `git config --get core.autocrlf` and check whether the repo has a `.gitattributes`.
D2. In a plain `node` script, read `packages/db/migrations/013_npc_players.sql` as `utf8`. Print `sha256` of (a) the text as read,
    (b) the text with every `\n` turned into `\r\n`, and (c) the text with every `\r\n` turned into `\n`. Which of these would `initialize()`
    (`packages/db/index.ts:143-148`) compare, and in which situation does each one crash-loop production?
D3. Read the branch diff: `git diff main...training/incidents/004-deploy-crashloop -- packages/db/migrations` (three dots: only the incident's own change, not the `training/` folder the branch predates). Which file makes the process crash, which never runs, and why?

## Part E: INC-005 with `grep` and `git` only (20 min)

E1. `git diff main...training/incidents/005-redis-blip-outage -- apps infra` shows the whole PR (three dots, as in D3). Then find every caller of `/api/health` in the repo
    (`grep -rn "api/health" infra compose.production.yaml tools apps/server/src`). Make a table with columns caller | interval | what it does on a 500.
E2. Read `apps/server/src/redis.ts:3-10`. Why does `redis.ping()` fail *immediately* rather than hanging when Redis is down? Which option causes that?
E3. Using the INC-005 timeline, estimate what fraction of the 5xx that `ApiErrors` counted came from real players. Explain from the Caddyfile why.

## Part F: INC-001 as a probability model (30 min)

F1. Read `apps/server/src/application/engine.ts:782-810` on `main`, then the diff in `training/incidents/001-resolver-oldest-first.md`.
    With `RESOLVER_BATCH_SIZE=300` and a backlog of at least 2,400 due events, how many candidate rows does each version read, and which 300 does it pick?
F2. Write a plain `node` Monte Carlo script. Three resolvers each pick a 300-row window from the same 2,400 ordered candidates: `main` picks a random
    start, the branch always picks the head. Estimate the probability that at least two resolvers' windows overlap in one tick, for each version.
    (Overlapping rows ≈ overlapping causal components, so one of them gets `WB_BUSY`.)
F3. Use F2 and your on-ramp exercise 5 answer to explain the brief's table: why 1 resolver is unaffected and 3 resolvers get about 40% slower, with **zero** errors and retries on the dashboard.
