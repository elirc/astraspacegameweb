# SEALED: no-Docker route answers (B08)

Verification: these answers come from reading the evidence file, the incident briefs and the code. The reference scripts below were **not run** in
B08 (docs-only pass), so treat exact outputs as UNVERIFIED and trust your own run. The live numbers quoted come from B03's runs (`_answers/evidence/runs-2026-09-24.md`).

## Part A
A1. The file writes `NaN` (Python's `json.dumps` default), which `JSON.parse` rejects. Replace it first:
```js
const fs = require('fs');
for (const line of fs.readFileSync(process.argv[2], 'utf8').trim().split('\n')) {
  const s = JSON.parse(line.replace(/\bNaN\b/g, 'null'));
  console.log(s.t, s.resolved_per_s, s.pending_due, s.oldest_s, s.lag_p99, s.resolver_tx_p99, s.alerts.join(','));
}
```
A2. `pending_due` goes 1,722 → 8,759 between 05:24:46 and 05:26:12, which is +7,037 in 86 s ≈ **+82 events/s net**. Not keeping up. Resolvers commit ~110–120/s
    while due work arrives faster, because every battle also schedules a `return` event, so 150 arrivals/s is more than 150 events/s of work.
A3. `lag_p99` hits **60.0** at 05:26:02 and never moves again (p50 joins it at 05:26:48). `resolver_tx_p99` hits **30.0** at 05:26:48. These are the top finite
    buckets of `warband_event_lag_seconds` (`metrics.ts:19`) and `warband_resolver_transaction_seconds` (`metrics.ts:39`). Both panels are clipped from then on.
    "A quantile stuck exactly on a bucket bound" means "at least this much".
A4. First sample with `EventLagHigh`: 05:27:00, **~145 s** after 05:24:35. With `for: 2m`, the expression was already true two minutes earlier, around
    05:25:00 or before. The oldest-event clause (`oldest_s > 5`) was already true at the 05:24:46 sample (10.6 s). So it went pending at about 05:24:45
    (matches `_answers/lab0.md` Q3). The `for:` clause costs you 2 minutes of detection by design.
A5. Two explanations fit:
    (1) **Long ticks.** `resolvedEvents.inc(n)` only runs when `resolveDue()` *returns* (`index.ts:46-47`). With `resolver_tx_p99` ≈ 26 s, a resolver inside
        one big transaction shows 0/s for tens of seconds, then a burst.
    (2) **Swallowed contention.** Its ticks keep returning 0 because of `WB_BUSY`/`55P03`, caught in `engine.ts:806-808`, with no metric (on-ramp #5).
    To tell them apart: `pg_stat_activity` (a long-running `xact_start` for that backend means 1), `pg_stat_database.xact_rollback` rising or Tempo
    `pg.query:ROLLBACK` spans (means 2), or a tick span with an outcome attribute (ladder J3). The resolver-duration histogram can't separate them either, because it times no-op ticks too.

## Part B
B1. Cumulative counts: `le ≤ 1.5 → 0`, `le=2.0 → 2`, `+Inf → 27,000`.
    - p50: rank 0.5 × 27,000 = 13,500 > 2, so it falls in `+Inf` → returns the highest finite bound, **2.0**.
    - p99: rank 26,730, also `+Inf` → **2.0**.
    Every quantile above 2/27,000 ≈ 0.007% returns 2.0. The panel is "flat at 2" whatever the real lag.
B2. Sketch (UNVERIFIED, not run):
```yaml
rule_files: [alerts.yaml]        # the branch's infra/alerts.yaml copied next to this file
evaluation_interval: 15s
tests:
  - interval: 15s
    input_series:
      - series: 'warband_event_lag_seconds_bucket{le="2.0"}'
        values: '0+0x40'
      - series: 'warband_event_lag_seconds_bucket{le="+Inf"}'
        values: '0+150x40'         # 10 events/s, all 90 s late
    alert_rule_test:
      - eval_time: 6m
        alertname: EventLagHigh
        exp_alerts:
          - exp_labels: { severity: critical }
```
On this branch the only buckets a 90 s observation can touch are `+Inf` (and `_count`/`_sum`). There's **no series that can express "90 s"**, so the quantile is
2.0, `> 5` is false, and this test **fails**. That failure is the point: it proves the alert is unreachable before merge. On `main` (buckets up to 60)
the same test with `le="60.0"` at 0 passes, because the quantile is 60 > 5. The oldest-event clause would also fire it.

## Part C
Reference script (UNVERIFIED):
```js
function run(version, fixHandler) {
  const sockets = new Map(), P = 1, closing = [];
  const sock = (name) => ({ name, onclose: null });
  function connect(s) {
    let set;
    if (version === 'main') { set = sockets.get(P); if (!set) sockets.set(P, (set = new Set())); set.add(s); }
    else { for (const old of sockets.get(P) || []) closing.push(old); set = new Set([s]); sockets.set(P, set); }
    s.onclose = () => {
      if (fixHandler) { const cur = sockets.get(P); cur?.delete(s); if (cur && cur.size === 0) sockets.delete(P); }
      else { set?.delete(s); if (!set?.size) sockets.delete(P); }
    };
  }
  const flush = () => { while (closing.length) closing.shift().onclose(); }; // close events arrive after the connect handler returns
  const A = sock('A'), B = sock('B'), A2 = sock('A2');
  connect(A); connect(B); flush(); connect(A2); flush();
  const names = [...(sockets.get(P) || [])].map((s) => s.name);
  console.log(version, fixHandler ? 'fixed-handler' : 'original', names, 'B registered:', names.includes('B'));
}
for (const v of ['main', 'branch']) for (const f of [false, true]) run(v, f);
```
Expected:
- `main original` → `[A, B, A2]`, B registered **true**. (On `main` the server doesn't close A. A2 is a third tab here.)
- `branch original` → `[A2]`, B registered **false**. A's handler held S1, emptied it, and deleted the map entry that pointed at S2 = {B}.
  A2 then found no entry and kicked nobody. B is open but unregistered. This matches the live run: tab B 0/5 hints, gauge 1 with 2 sockets open.
- `main fixed-handler` → `[A, B, A2]`, true.
- `branch fixed-handler` → A's close no longer deletes B's entry, **but A2's connect now kicks B** (4000), so the result is `[A2]` with B closed. In real life B
  reconnects after its 1 s backoff (`App.tsx` `onclose`) and kicks A2, and the two tabs **flap forever**.
  Fixing only the handler isn't enough. The eviction policy itself is wrong. That's why the reference fix (`_answers/incidents/003-second-tab-silent.md`)
  restores the shared-Set add path *and* makes the handler look up the live entry, and handles dead peers with ping/pong instead of evicting healthy tabs.

## Part D
D1. On this machine (checked 2026-09-26): `i/lf w/lf attr/` for the migrations, `core.autocrlf=true`, no `.gitattributes`. The index (committed blob) is LF, and
    **this** main working tree happens to be LF too. A *new* checkout or worktree on this machine gets CRLF (`w/crlf`), because autocrlf converts on checkout.
    B03 saw exactly that (`runs-2026-09-24.md`, INC-004 line-ending variant). Empty `attr/` means nothing pins the line endings.
D2. `initialize()` hashes the text **as read** (`readFile(…, 'utf8')` then `sha256`, `packages/db/index.ts:143-144`). No normalization.
    - (a) as read: what this checkout would record or compare.
    - (b) CRLF version: what a CRLF checkout would compute. It differs from (a), so a DB migrated from LF files crash-loops when roles run from a CRLF checkout,
      e.g. a Docker image built by `COPY . .` from a Windows clone.
    - (c) normalized: equal to (a) for this LF checkout. It's the right thing to hash, but switching to it breaks databases whose recorded checksums came
      from CRLF files. That needs a transition release that accepts either hash (agentic drill 5's trap).
D3. The diff adds two comment lines at the top of `013_npc_players.sql` (edits an **applied** migration) and adds `015_npc_admin_index.sql`. `initialize()` walks the files
    sorted: 001–012 match, 013's checksum differs → throw. 014 and 015 never run. The whole function is one transaction, so nothing is half-applied.

## Part E
E1. The PR adds `redis.ping()` to `get_api_health` in `apps/server/src/application/game.ts` (1 file). Callers:
| caller | interval | on 500 |
|---|---|---|
| Caddy `infra/Caddyfile:5-9` (`health_uri /api/health`, `health_interval 10s`) | 10 s per upstream | marks the upstream unhealthy; all unhealthy → `no upstreams available` → 502 for everything incl. the SPA |
| compose `healthcheck` `compose.production.yaml:25-31` | 15 s | container `unhealthy`; `edge` `depends_on … service_healthy` (`:68-70`) blocks the edge from starting; no restart |
| `tools/sim/redis-outage.ts:39`, `tools/sim/load.ts:90`, `tools/sim/package-smoke.mjs:68`, `tools/wait-ready.mjs:2` | poll loop | treat it as "not started yet" and keep waiting until they time out (the redis-outage drill fails with `Server did not start without Redis`) |
E2. `disableOfflineQueue: true` (`redis.ts:5`). While disconnected, commands aren't queued. They reject at once with `ClientOfflineError`. Without it, `ping()` would
    wait in the offline queue, and the health check would hang until Caddy's own timeout.
E3. About **0%**. Player requests stopped at Caddy, which generated the 502 itself (no healthy upstream). The app never saw them, so they're not in
    `warband_http_request_seconds`. The 5xx the app *did* count were the health probes themselves (Caddy every 10 s per instance, docker every 15 s). ApiErrors
    fired on probe traffic while real impact was 100%. Measure availability at the edge, and exclude `/api/health*` and `/metrics` from the SLI.

## Part F
F1. `main` reads `batchSize*8 = 2,400` candidates (`engine.ts:786-790`) and picks a **random** 300-row window (`:793-794`). The branch reads **300** and takes the head.
F2. Reference Monte Carlo (UNVERIFIED):
```js
const N = 2400, W = 300, R = 3, T = 100000;
const overlap = (a, b) => Math.abs(a - b) < W;
for (const mode of ['main', 'branch']) {
  let hit = 0;
  for (let t = 0; t < T; t++) {
    const s = Array.from({ length: R }, () => (mode === 'main' ? Math.floor(Math.random() * (N - W + 1)) : 0));
    if (overlap(s[0], s[1]) || overlap(s[0], s[2]) || overlap(s[1], s[2])) hit++;
  }
  console.log(mode, (hit / T).toFixed(3));
}
```
Analytically: two random starts in 0..2100 overlap when |a−b| < 300, which has probability ≈ 1 − (1800/2100)² ≈ 0.27. For three resolvers, "any pair overlaps"
comes out around 0.6. The branch always overlaps (**1.0**): every resolver fights for the same head of the queue on every tick. (This is a simplification.
Overlap in rows isn't exactly overlap in causal components, and resolvers don't tick in lockstep. But the direction and size are right.)
F3. With **one** resolver there's nobody to collide with. The branch just takes smaller batches (300 vs ~520 events per tick in the B03 profile: 78.4 s vs 78.7 s,
    no regression). With **three**, the branch makes every tick a collision. The losers hit `WB_BUSY`/`lock_timeout`, roll back, and return 0. That's wasted planning
    work with no metric (on-ramp #5: `transaction(fn, 1)` never retries, and `resolveDue` swallows the error). So throughput drops about 40% (drain 91–115 s →
    151–154 s) while `resolver_errors` and `lock_retries` stay at 0. The real signal was rollbacks per commit: `pg_stat_database` rollbacks went 163–179 → 568–649
    per drain. Full answer: `_answers/incidents/001-resolver-oldest-first.md`.
