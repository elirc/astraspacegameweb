# SEALED: agentic-practice rubrics

Grade your *spec* and your *review*, not the agent's code. For each drill: 2 points for the spec, 2 for catching the planted or typical agent mistakes,
1 for honest verification (deferred items marked as deferred). 4–5 means you're directing. 2–3 means you're supervising. 0–1 means you're watching.

## Drill 1: M1 SLOs
Reference outcome and traps: `training/_answers/agentic.md` and `training/_answers/ladder/M1.md`. The reference rules (promtool-verified in B03) are in
`training/_answers/ladder/M1-slo-rules.yaml` + `M1-slo-tests.yaml`.

**Spec must contain:** a bucket-ratio SLI (`…_bucket{le="2.0"}` / `…_count`), not a quantile. The command SLI excludes `/api/health*` and `/metrics`
(probe noise, INC-005). A guard alert for "nothing commits" based on `warband_oldest_event_seconds`, because the lag histogram only sees *committed* events.
The page/ticket burn windows from the ticket. Zero-traffic behaviour stated.

**Mistakes to catch (the reference author, an AI, made the first two itself):**
| Mistake | How you catch it without Docker | With Docker |
|---|---|---|
| `le="2"` | Prometheus 3 normalizes float labels to `"2.0"`. A selector `le="2"` matches nothing, and the recording rule returns no series. Fixtures written with the same assumption pass anyway. | `curl localhost:59090/api/v1/label/le/values` |
| `clamp_min(denominator, 1e-9)` | At zero traffic, 0/1e-9 = 0 for the good ratio, so the error ratio = 1 − 0 = **1** and the fast-burn page fires. Without the clamp, 0/0 = NaN and comparisons are false. | an idle `promtool test rules` case |
| `for: 2m` on burn-rate alerts | Defeats the short window. Multi-window rules don't need `for`. | n/a |
| `role="resolver"` selectors | The training scrape config adds `role`. `infra/prometheus.yaml` (dns_sd) doesn't. The rule works in the lab and is silent in production. | compare both scrape configs |
| `absent(...)` guard | Fires during every deploy while targets restart. | n/a |

Full marks: your VERIFY.md shows the `le` check against `metrics.ts:19` and a reasoned zero-traffic evaluation. Live boxes are honestly marked deferred.

## Drill 2: INC-003 fix
Reference: `training/_answers/incidents/003-second-tab-silent.md`.

**Correct fix shape:** keep one shared Set per player (the `main` add path). The close handler looks up the **live** entry
(`const current = sockets.get(id); current?.delete(socket); if (current && current.size === 0) sockets.delete(id);`) instead of trusting the captured `set`.
Dead peers are handled with ws ping/pong + `terminate()`, not by evicting healthy tabs.

**Typical agent mistakes:**
- It "fixes" it by removing the `old.close(4000)` loop but keeps `new Set([socket])`. That still replaces the entry, and B's handler can still delete A's live entry.
  Your replay test catches it only if it includes the *reconnect* step.
- The test asserts on `sockets.size` or on the gauge, not on **delivery to B**. That's weaker. The symptom is "B gets 0 hints".
- The test builds its own Map logic instead of calling the production code, so it tests a copy. Check that it imports the extracted registry from `transport/app.ts`.
- It changes `App.tsx` reconnect logic (a non-goal) to "make it more robust".
- It claims an `app.injectWS` test passed. That needs Postgres for `authenticate` (session rows), so without Docker that claim is false.

## Drill 3: health split
Reference: `training/_answers/incidents/005-redis-blip-outage.md` (health-model table).

**Spec must contain:** `live` (process responsive, for restart policy), `ready` (local: DB connection within ~1 s, not `closing`, for Caddy),
`details` (Redis, backlogs, version, internal or auth only). Redis is **not** in readiness.

**Typical agent mistakes:**
- New endpoints added, but `infra/Caddyfile` `health_uri` and the compose `healthcheck` still point at `/api/health`, which still pings Redis. No production change.
- `/api/health/details` added to the auth skip list at `transport/app.ts:79` and exposing internals publicly.
- Readiness keeps `redis.ping()` "but with a timeout". It's still a correlated shared-dependency failure.
- `tools/sim/redis-outage.ts` / `tools/wait-ready.mjs` not updated, so the drill tests the old path.
- A `dependency` label that accepts arbitrary strings.
- Missing the SLI fix in `infra/alerts.yaml`: exclude `route=~"/api/health.*|/metrics"` from ApiErrors, otherwise probes still dominate the 5xx ratio.

## Drill 4: INC-002 guard
Reference: `training/_answers/incidents/002-lag-panel-flat.md` ("Catch it before merge").

**Good guard:** it reads the bucket list from the real `eventLag` object (or parses `metrics.ts`) and the thresholds from `infra/alerts.yaml`, then asserts
`maxFiniteBucket >= 2 * threshold`. On the branch, max bucket = 2 and threshold = 5, so it fails. On `main`, 60 ≥ 10, so it passes.

**Typical agent mistakes:**
- It "fixes" the buckets instead of writing the guard (scope creep that hides whether the guard works).
- It hard-codes `[..., 60]` in the test instead of reading it from the code, so the test can never fail.
- The regex misses the `or max(warband_oldest_event_seconds) > 5` clause, or treats it as a lag threshold. Only thresholds on `warband_event_lag_seconds` count.
- It doesn't mention that restoring the removed `oldest_event` clause matters as much as the buckets. That's the only signal that sees *uncommitted* lateness.

## Drill 5: migration immutability
Reference: `training/_answers/incidents/004-deploy-crashloop.md` §4 and the actions list.

**The trap:** if the agent switches `initialize()` to hash normalized text (`\r\n` → `\n`), databases already migrated **from LF files** keep working
(the normalized hash of LF text is unchanged). But any database first migrated **from a CRLF checkout** now has recorded raw-CRLF hashes that no longer
match, and every role crash-loops on the next release. A correct spec requires a transition: accept *either* the normalized hash or the legacy raw hash
for one release (optionally rewriting the stored checksum), then tighten.

**Other checks:**
- The CI diff must use `--diff-filter=M` (and D/R), not just "any change". Added files are allowed.
- The CI job needs the previous tag fetched (`fetch-depth: 0` in `.github/workflows/ci.yml`), or `git diff <tag>` errors, and a badly written step might treat that as success.
- `.gitattributes` alone doesn't rewrite existing working trees. Existing Windows checkouts need `git add --renormalize .` or a fresh checkout. The agent rarely says this.
- The 013 comment itself is reverted byte-for-byte. The doc goes in a new file or in `docs/`.
