# Flashcards (24), each tied to this repo

| # | Front | Back |
|---|---|---|
| 1 | What does `histogram_quantile` return when the target rank is in `+Inf`? | The upper bound of the highest finite bucket. Seen as p99 = 60.0 on `main` and 2.0 on INC-002. |
| 2 | Why does `EventLagHigh` also check `warband_oldest_event_seconds`? | The lag histogram only sees *committed* events. A stuck or slow world is visible only through pending age. |
| 3 | Where is `WB_BUSY` swallowed? | `resolveDue` in `application/engine.ts`: caught, `return 0`. No metric (INC-001). |
| 4 | What spreads concurrent resolvers over the backlog? | The random 300-row window over 8× candidates in `resolveDue`. Removing it serializes them. |
| 5 | Rollbacks per 6,000-arrival drain, main vs INC-001 (3 resolvers)? | ~163–179 vs ~568–649 (`pg_stat_database`). |
| 6 | Laptop capacity with 3 resolvers on `main`? | ~110–120 events/s (Lab 0 evidence). The 150/s injection grows the backlog. |
| 7 | Biggest single cost in a resolver tick? | `INSERT INTO event_journal` (~19%): full before/after state plus the read trace for replay. |
| 8 | What does `initialize()` hash? | sha256 of raw `.sql` bytes. Comments and CRLF count (INC-004). |
| 9 | Why can't you roll back to "the previous image"? | `compose.production.yaml` uses `build: .` with no `image:` tag. |
| 10 | Which alert fires when every Warband target is down? | None today. Add `up == 0` / `absent(up{job="warband"})`, plus Alertmanager. |
| 11 | What does `/api/health` check on `main`? | `SELECT 1` only. It's used by Caddy `health_uri` for routing. |
| 12 | Why is adding `redis.ping()` to health an outage? | Redis is shared, so all instances fail together and Caddy has no upstream (INC-005). |
| 13 | What did ApiErrors measure during INC-005? | Health-probe 500s. Players' 502s came from Caddy and never reached app metrics. |
| 14 | How does the WS registry break with "one socket per player"? | The old socket's close handler deletes the map entry that now holds the new Set (INC-003). |
| 15 | What does the client do on a WS hint? | A coalesced refetch via `queryRefresh.ts`. It never applies the payload. |
| 16 | Is `/api/ws` in the HTTP latency histogram? | No (verified). WS has no lifecycle metrics. |
| 17 | Why are resolver traces one span each? | `setInterval` callbacks have no active span, so pg auto-instrumentation creates roots (J3). |
| 18 | Pool math for `compose.production.yaml`? | 7 processes × 16 = 112 > default `max_connections` 100 (M4). |
| 19 | What happens to a scrape when an async `collect()` rejects? | prom-client `Promise.all` makes the whole `/metrics` fail (M3). |
| 20 | Prometheus 3 `le` label for bucket 2? | `"2.0"`. The selector `le="2"` matches nothing (agentic exercise). |
| 21 | Stolen refresh token used after rotation? | `consumed_at` set, so the whole session family is revoked (`post_api_auth_refresh`). |
| 22 | Which chaos drill passed live, and what did it prove? | `tools/sim/chaos.ts`: 2 killed workers, a terminated backend, PG restart, Redis flush → identical world. Crash safety, not speed. |
| 23 | Side-job failures after 8 attempts? | `dispatch()` calls `prior.retry()` every 5 s, forever. No DLQ, no backlog metric (J1). |
| 24 | Why do commands drain before executing? | So cost/unit checks happen against the present. During a big backlog, the player's request pays for history (S3). |
