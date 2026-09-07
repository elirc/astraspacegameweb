# Verification record

The local game is implemented and runnable. Production certification is a separate result: the sustained arrival-load target has not passed, and installed mobile push and operator-specific deployment checks require external systems. Measurements below use this Windows workstation with Docker PostgreSQL 16 and Redis 7.

## Frontier spawning and fortress map verification

The new starter-placement implementation passed **74/74 regression tests** in the built image against isolated PostgreSQL databases and real Redis: 39 engine/database, 19 API/auth, 12 rules/property and 4 spawning tests. The added cases cover outward growth, deterministic continuation, spacing and bounds, simultaneous new joins, rollback, unchanged existing coordinates, advanced-core avoidance and reuse of nearby neutral targets. Evidence: `artifacts/frontier-regression.log` (184.83 seconds).

A real stop/start of the isolated application preserved frontier cursor 26; the next join advanced it to 28 and used a different spaced site while the earlier castle kept its coordinates. Evidence: `artifacts/frontier-restart.json`. All 11 packaged production smoke checks passed on the first frontier image, including authenticated commands and clean shutdown in 6,232 ms. Evidence: `artifacts/package-smoke-frontier-before-watchdog.json`, `artifacts/frontier-package-smoke.log`.

Strict TypeScript, production build, full lint and executable import-boundary probes passed. The final split browser fixtures also passed TypeScript and focused lint. Evidence: `artifacts/frontier-build.log`, `artifacts/frontier-lint.log`, `artifacts/frontier-final-typecheck.log`. Placement rationale and primary research sources: [spawning and map design](spawning.md).

Browser testing exposed a graphics-initialization stall. The final map adds an eight-second deadline before the first animation frame and releases any late or partially initialized GPU renderer. A fault-injection test held the actual WebGL module, verified Canvas takeover, then released the module and observed native context disposal while Canvas remained interactive. It passed on desktop Chromium. Evidence: `artifacts/frontier-watchdog-browser.log`. The final image passed its production build and TypeScript check: `artifacts/frontier-final-build.log`.

The initial combined renderer fixture exceeded its timeout when Firefox took 101 seconds to create a second blank tab. Renderer cases are now independent. Later browser failures showed genuine map initialization stuck on loading; the watchdog addresses those failures. Evidence is retained in `artifacts/frontier-browser-tab-startup-failure.log`, `artifacts/frontier-browser-loading-failure.log` and `artifacts/frontier-loading-test-results/`. The final browser run allows 240 seconds for cold browser setup and the 50,000-location workload; interaction assertions retain their original limits.

## Developer NPC feature verification

The NPC extension passed **65/65 regression tests** against isolated PostgreSQL databases and real Redis: 34 engine/database, 19 API/auth and 12 rules/property tests. This includes concurrent NPC claims, paid construction and normal completion, independent recruitment, rollback and retry, real raids and reports, diplomacy exclusions, defeat, bans, admin-only access, idempotent creation and bulk controls. Evidence: `artifacts/npc-regression.log` (98.39 seconds).

The NPC administration flow passed on desktop Chromium and Firefox and mobile Chromium and WebKit. Each creates two realistically named accounts, observes actual automatic construction, edits the pace, disables building, pauses/resumes play and verifies that a demoted administrator loses access. Evidence: `artifacts/npc-browser-chromium.log`, `artifacts/npc-browser-remaining.log`. The initial selector failure is retained in `artifacts/npc-browser-locator-failure.log`; the corrected test uses the controls' accessible combobox roles.

A real application stop/start preserved the scheduled turn and resumed play without duplicating accounts. Evidence: `artifacts/npc-restart.json`. The first harness attempt checked a stale ephemeral Docker port; the successful harness discovers the new published port after startup. NPC regression and browser fixtures use separate drill databases, not the playable world. See [NPC controls and operating behavior](npcs.md).

The final NPC image passed strict TypeScript and the production build, then repeated the full NPC control flow on mobile WebKit and desktop Chromium after the layout polish. Screenshots were inspected for narrow-layout overflow and control placement. Evidence: `artifacts/npc-final-build.log`, `artifacts/npc-browser-final.log`. All 11 packaged production smoke checks passed, including clean SIGTERM shutdown in 2313 ms. Evidence: `artifacts/package-smoke-npc.json`, `artifacts/npc-package-smoke.log`. Image manifest: `sha256:633cf4c08b603074f4b2e6121a196db9dd9602cddf72be7385c60fd9481353df`. The local preview now serves this image with migration 013 and the existing persistent game database; NPC test accounts were created only in isolated drill databases.

The following base-game measurements predate the NPC extension. They remain historical evidence, and the outstanding production gates below remain open.

## Base-game correctness and packaging

- **59/59 tests passed inside the final release image against separate, initially empty PostgreSQL 16 databases and real Redis:** 29 engine/database tests, 18 API/auth tests and 12 rules/property tests, including 1,150 generated combat/plunder cases. Duration: 211.71 seconds. Evidence: `artifacts/regression-final-image.log`. The preceding 58-test revision also passed in fresh PostgreSQL and Redis Testcontainers: `artifacts/testcontainers-production.log`.
- The suite covers 500 tied attacks under serial and eight-worker resolution; a mixed multi-village history; shared point readers versus exclusive point writers; support casualties; conquest and return redirection; finite merchant returns; immutable scout intelligence; transactional rollback, connection loss and idempotency; range replay continuity and corruption detection; authentication, session revocation, password reset, catalog changes, map privacy and Redis loss.
- The first combined build/test attempt exceeded the 60-second API setup timeout. The compiler was stopped and the full suite rerun sequentially with a 180-second setup allowance for cold imports and fresh migrations. Every test passed. Request-latency and lock-behavior assertions were unchanged. Evidence of the failed attempt remains in `artifacts/testcontainers-startup-timeout.log`.
- On the final revision, two attempts to start fresh Testcontainers failed before tests began (container health, then port readiness). The successful final run used empty databases on the healthy isolated drill PostgreSQL server. Vitest required temporary writable cache mounts in the non-root image; application permissions were unchanged. These harness failures are preserved in `artifacts/testcontainers-final-startup-failure.log`, `artifacts/testcontainers-final-port-failure.log` and `artifacts/regression-image-cache-permissions.log`.
- **Crash drill passed on the revised engine:** 500 attacks and eight original workers. Three real event batches pause immediately before commit: one worker is killed, a second loses its PostgreSQL backend and is killed, and PostgreSQL restarts while a third batch remains uncommitted. Redis is flushed. Surviving and replacement resolvers remain running; final village state, reports and normalized scheduled events exactly match the serial reference. Worker startup now retries transient PostgreSQL restart errors. Evidence: `artifacts/chaos/simulation.json`, `artifacts/chaos-held-commits.log`. The initial replacement-startup failure remains in `artifacts/chaos-startup-failure.log`.
- **PITR and failover passed:** pgBackRest retained records before the target and excluded the later write; a synchronous `remote_apply` standby retained an acknowledged write after primary loss and promotion. Evidence: `artifacts/chaos/recovery.json`.
- The earlier startup-without-Redis drill authenticated a guest and committed a command using PostgreSQL. Current API regression also verifies continued authoritative operation after Redis disappears. Evidence: `artifacts/chaos/redis-outage.json` and the fresh-container suite.
- **11/11 production image smoke checks passed:** non-root UID 1000, compiled client and offline worker, guest sessions, Secure/HttpOnly cookies, authenticated state, committed command, Linux Argon2 registration and password verification, and SIGTERM shutdown with exit code 0 in 5,757 ms. Evidence: `artifacts/package-smoke-base-game.json`, `artifacts/package-smoke-final.log`.
- Strict TypeScript and the production Vite build passed inside the final Docker image. Boundary lint and executable negative-import probes passed. Evidence: `artifacts/build-final-image.log`, `artifacts/lint-production.log`. Final image manifest: `f840b6af5720acfdf76d5dae8a1d0e04056536630d165ec5eb94572d7f4790ef`.
- The revised browser fixture passed a final strict TypeScript check and focused ESLint check. Evidence: `artifacts/typecheck-final.log`, `artifacts/lint-map-final.log`. Machine-readable release status: `artifacts/release-verification.json`.
- The lockfile is frozen. The latest dependency audit reported zero known vulnerabilities; dependencies have not changed since that audit. Evidence: `artifacts/audit.json`.

## Replay and boundaries

Transport routes, application use cases and pure per-kind event handlers are separate modules. ESLint resolves TypeScript imports; negative checks demonstrate rejection of transport-to-database and domain-to-infrastructure imports.

The range replay CLI was exercised against existing recorded history, created its own scratch database, verified the event and removed that database. Tests also replay recruitment separated by a recorded rename checkpoint, detect corrupted state and reject incomplete ranges. New journals verify canonical effect hashes, and older full-effect journals remain compatible. Evidence: `artifacts/replay-cli.json`, `artifacts/replay-cli.log`; scope: [replay ADR](adr/003-replay-evidence.md).

## Capacity

The harness records actual post-commit arrival lag through worker IPC and requires one observation for every completed arrival. Command latency is measured separately from reads. Certification requires at least 600 seconds at 1,000 arrivals/second, every arrival completed, p99 committed lag below 2 seconds, API and command p95 below 150 ms, nonzero command samples and zero HTTP errors.

A packaged three-worker shared-point-lock probe at batch size 64 completed 8,706/10,000 arrivals in the ten-second injection plus thirty-second drain window. It recorded all 8,706 commit observations, p99 committed lag 31.585 seconds, command p95 324.17 ms, read p95 158.39 ms and zero HTTP errors. It failed the target. Evidence: `artifacts/load/shared-global-probe.json`.

An indexed-neighbor planner completed 6,772/10,000 with p99 32.799 seconds and command p95 348.20 ms. Profiling identified expensive neighbor discovery; that planner was removed. Its applied index migration remains immutable, with a subsequent migration removing the unused index. Evidence: `artifacts/load-local-graph.log`. Neither short probe certifies sustained capacity.

The earlier isolated k6 baseline against 50,000 villages passed 334 requests with zero failures or dropped iterations: command p95 126.12 ms and read p95 36.09 ms. It had no active battle stream and is not evidence for the combined load gate. Evidence: `artifacts/load/k6.json`.

Further isolated three-worker, batch-300 probes completed 4,968/10,000 arrivals with p99 committed lag 39.527 seconds and command p95 2,620.18 ms. An optional four-group candidate scheduler worsened the result to 4,308/10,000, p99 56.267 seconds, command p95 3,527.62 ms and three HTTP errors; that experiment was removed. Evidence: `artifacts/load/groups-one.json`, `artifacts/load/groups-four.json`. No PostgreSQL shared-lock-memory error appeared in the worker logs, so no speculative database lock-memory setting was applied.

No passing ten-minute capacity run has been established. The long certification run has not been attempted after failing preflights. Moving to dedicated hardware is not assumed to fix the failure; the intended deployment must be measured.

## Browser and deployment

The browser suite covers desktop Chromium/Firefox and mobile Chromium/WebKit: construction, recruitment, scouting, battles, reports, social actions, keyboard dialogs, narrow layouts, administration, replay, actual Mailpit password recovery and the compiled offline shell. The latest complete run passed 27/28 scenarios, including all 24 non-map scenarios. Its map fixture caused a WebKit request failure and an additional Chromium route-teardown error. The fixture now reads authenticated state normally, uses in-app navigation and real camera controls, and opens the Canvas fallback in a separate authenticated page so active polling requests are not cancelled by a hard navigation. Final map cases passed on WebKit and both Chromium projects, then Firefox passed an isolated rerun with the same assertions and 150-second timeout. All 28 functional browser cases are covered across the full run and focused reruns, not a single clean final full-suite run. Evidence: `artifacts/browser-production-full.log`, `artifacts/browser-map-final.log`, `artifacts/browser-firefox-final.log`. The final map run initially timed out in Firefox startup; that failure and the preceding navigation failures remain in `artifacts/browser-map-cold-firefox.log` and `artifacts/browser-map-navigation-failure.log`.

Offline testing cuts actual origin TCP connections and reloads the cached shell. WebKit uses this real outage because its offline emulation also failed on an independent minimal cache-only page. No case is skipped to accommodate that behavior.

The 50,000-village benchmark aligns the real camera with a tiled fixture and requires all villages to be served. Functional runs measure 300 animation-frame intervals after 60 warm-up frames; hardware acceptance measures 600 intervals after 120 warm-up frames. Hardware acceptance requires an Intel renderer, mean at least 59 fps and p95 frame interval at most 20 ms. Software rendering and profiled runs are labeled explicitly. The final three unprofiled runs identified physical Intel UHD Graphics 620 / Direct3D11, served all 50,000 villages, warmed up for 120 frames and measured 600 frames each. Mean frame rates were **59.1156, 58.2547 and 58.7297 fps**, with p95 frame intervals **16.8 ms** in every run. Only the first passed; stable 60fps acceptance remains unchecked. No other workspace checks were run during the measurement, but the workstation also hosts unrelated applications. Evidence: `artifacts/intel-final-map-0.json`, `artifacts/intel-final-map-1.json`, `artifacts/intel-final-map-2.json`, `artifacts/browser-intel-final.log`. Earlier failed measurements are retained.

Prometheus validated monitoring configuration and all four alert rules; Caddy validated ingress configuration. These checks do not establish real alert delivery or public TLS issuance. Installed Android/iOS Web Push, public SMTP deliverability, production hostname/hosting, off-host backup storage and alert recipients remain external launch checks. Emulated mobile browser passes do not certify installed-device push.

The final compiled client is running locally at `http://127.0.0.1:3001` in container `warband-preview-final`, using the existing persistent local database and Mailpit. This loopback preview uses development cookie settings; the separate image smoke run verifies production cookie flags. The container restarts with Docker unless explicitly stopped.

## Reproduce

```sh
pnpm config:validate
pnpm lint
pnpm build
pnpm test:containers
# Start the built app on port 3001, and local Mailpit.
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 pnpm test:e2e
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 PLAYWRIGHT_GPU=1 CERTIFY_MAP_FPS=1 pnpm exec playwright test tests/e2e/map-performance.spec.ts --project=desktop-chromium --repeat-each=3
pnpm test:chaos
pnpm test:recovery
pnpm test:load
```

The inline environment syntax above is for POSIX shells; PowerShell uses `$env:NAME='value'` before the command. Test/drill databases are isolated from the playable world. Do not overlap capacity measurements with builds, browser runs or recovery drills.
