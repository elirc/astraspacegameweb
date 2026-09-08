# Final application improvements

Updated: 7 September 2026.

This continuation addresses lost state updates during notification bursts, account transitions, configuration readiness, and avoidable Canvas rendering work. The [6 September report](final-improvements-2026-09-06.md) preserves the earlier changes, failures, measurements, and test evidence.

## Changes in this continuation

| Area                        | Change                                                                                                                                                                                                                                                                   | Result                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Live state refresh          | Replace repeated cancel-and-restart invalidation with independent per-query refresh queues. Keep a response already in flight, then fetch a newer snapshot when notifications arrive during that request.                                                                | A completed troop/resource update can reach the screen. Notification bursts do not create overlapping replacement requests for the same query, and a slow map request does not block state refresh.    |
| Inactive pages              | Track a request that continues after its page becomes inactive, then preserve its stale flag when it finishes.                                                                                                                                                           | Reopening a page requests fresh data instead of trusting an older response that arrived after an update notification.                                                                                  |
| State subscriptions         | Share one state-query observer between the rules provider and the application.                                                                                                                                                                                           | Removes the duplicate polling observer and redundant subscription work.                                                                                                                                |
| Account transitions         | Cancel earlier query promises, remove the previous account's non-state caches, and explicitly reset/refetch state after authentication. Remount account content when player identity changes.                                                                            | The state cache does not reuse a pre-login query promise, and old private data and local selections do not carry into another account. Same-player registration renews its refresh queue safely.       |
| Initial connection recovery | Give a failed world-state request a player-facing message and retry button. Keep guest entry disabled until a non-authentication state failure is resolved.                                                                                                              | Players can retry loading their existing world without creating another guest or seeing server/database implementation instructions.                                                                   |
| Number formatting           | Reuse one formatter with the existing locale and precision.                                                                                                                                                                                                              | Frequent resource/countdown renders avoid repeatedly constructing identical formatter objects. Displayed numbers retain their existing formatting.                                                     |
| Canvas rendering            | Reuse the 2D context and terrain pattern. Resize the backing store only when its integer pixel dimensions change, and replace the transform on each draw.                                                                                                                | Panning no longer reallocates the Canvas surface every frame. Resize and pixel-density changes retain correct scaling without accumulating transforms.                                                 |
| Administration              | Keep the configuration editor and Validate/Apply controls disabled until real configuration is loaded. Show loading, failure and retry states; preserve edited and intentionally empty drafts.                                                                           | Prevents a fast operator from submitting a partial configuration containing only a version number.                                                                                                     |
| NPC test isolation          | Create fixture NPCs paused, then resume the precisely identified account after creation is acknowledged. Keep existing ownership-scoped cleanup.                                                                                                                         | A delayed creation acknowledgement cannot start background actors before the test has identified them. The failed run's two accounts were already paused by cleanup; no persistent leak was confirmed. |
| Diagnostic evidence         | Record map startup, fixture readiness, frame sampling and fallback milestones outside the measured frame loop. Focused retries also record bounded guest/state request and body-completion phases before map navigation. Save measurements in each test's output folder. | A timeout identifies the last reached phase; new measurements no longer overwrite the only copy of earlier evidence.                                                                                   |

Implementation: [App.tsx](../apps/web/src/App.tsx), [queryRefresh.ts](../apps/web/src/queryRefresh.ts), [api.ts](../apps/web/src/api.ts), [Admin.tsx](../apps/web/src/Admin.tsx), [TileMap.tsx](../apps/web/src/TileMap.tsx), and [mapCanvas.ts](../apps/web/src/mapCanvas.ts).

The earlier request deadlines, readable errors, session recovery, mobile focus/scroll handling, alert controls, map boundaries, and bounded PostgreSQL lock retries remain in place. Their detailed descriptions are in the archived report.

## Verification

The notification regression reproduced the intended failure on the previous production bundle: 20 notifications created **21 overlapping state refreshes**. The response containing 37 troops completed successfully approximately 14.7 seconds before the assertion failed, while the UI still showed 35. Later responses were deliberately held until cleanup. The baseline runner also reported one unattributed non-test error without further detail; the trace independently captures the failed troop-update assertion. [Baseline log](../artifacts/continued-review/refresh-baseline.log), [baseline trace](../artifacts/continued-review/refresh-baseline-results/refresh-notification-burst-3d749-anges-that-arrive-in-flight-desktop-chromium/trace.zip).

| Check                               | Scope                                                                                                                          | Result                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Request handling and Canvas helper  | 30 transport cases and 4 allocation/resize/pixel-density cases                                                                 | 34/34 passed; [log](../artifacts/continued-review/client-canvas-unit.log)                       |
| Refresh and account reset           | 10 refresh/lifecycle cases and 3 authentication-boundary/recovery cases                                                        | 13/13 passed; [log](../artifacts/continued-review/refresh-unit.log)                             |
| Full TypeScript                     | Final application and test source                                                                                              | Passed; [final log](../artifacts/continued-review/final-typecheck.log)                          |
| Full lint and dependency boundaries | Final application and test source                                                                                              | Passed; [final log](../artifacts/continued-review/final-lint.log)                               |
| Initial production bundle           | Refresh, account and Canvas improvements, before the final admin correction                                                    | Passed; 2,520 modules, 7m 13s; [log](../artifacts/continued-review/bundle.log)                  |
| Final production bundle             | Includes the admin readiness correction                                                                                        | Passed; 2,520 modules, 8m 29s; [log](../artifacts/continued-review/final-bundle.log)            |
| Focused browser regressions         | Notification bursts, world retry, account switching, Canvas pixel restoration, gameplay and 50,000-village map                 | 6/6 passed in 5.6 minutes on desktop Chromium; [log](../artifacts/continued-review/focused.log) |
| Complete browser matrix             | 30 scenarios in four browsers, before the final admin correction                                                               | 107 passed, 13 failed in 1.8 hours; [log](../artifacts/continued-review/browser.log)            |
| Final focused browser verification  | 22 selected cases on the final build, including every admin, NPC and offline case across four browsers plus the other failures | 10 passed, 12 failed in 1.1 hours; [log](../artifacts/continued-review/final-browser.log)       |

The final production entry is `index-Dt13elfn.js`: 796.30 kB (245.52 kB gzip). The review server was checked against this asset before the final browser follow-up. [Served entry](../artifacts/continued-review/final-served-index.html).

The initial production entry bundle used by the 120-case matrix was `index-CrNejXr8.js`: 795.86 kB (245.47 kB gzip). The review server was checked against that exact asset before browser testing. Vite still reports the existing large-chunk warning; dependency annotation warnings did not prevent a successful build.

The broad matrix ran 30 scenarios across 12 spec files in four projects (120 cases), with no explicit skips. The final admin regression adds one scenario in a thirteenth file, bringing the available inventory to 124 cases. The final focused selection covers the changed admin/NPC tests, corrected offline assertion and every failed matrix scenario; it is not another full 124-case matrix. The 30-scenario broad suite covers navigation and recovery (10), attack alerts (5), gameplay and social flows (3), castle rendering and its watchdog (3), state refresh (2), and seven account, map, administration, NPC, password-recovery and offline scenarios. Mobile projects emulate devices; push checks use browser API fixtures.

The 47 affected unit cases passed across two focused runs. No backend implementation changed in this continuation; earlier backend/rules coverage is retained in the archived report.

New browser regressions are in [refresh.spec.ts](../tests/e2e/refresh.spec.ts), [account-switch.spec.ts](../tests/e2e/account-switch.spec.ts), [map-canvas.spec.ts](../tests/e2e/map-canvas.spec.ts), and [admin-readiness.spec.ts](../tests/e2e/admin-readiness.spec.ts). The Canvas test checks both changed pixels when moving away and exact restoration after pan, zoom and resize round trips at device pixel ratio 2; a frozen canvas cannot pass. The notification test requires the completed intermediate response and the trailing update to reach the UI.

The [map benchmark](../tests/e2e/map-performance.spec.ts) retains 50,000 fixture villages, 60 warm-up frames and 300 measured frames for headless diagnostics. Assertion deadlines and gameplay waits have not been extended to make failures pass. Actual-hardware frame-rate certification remains separate.

The review world is isolated at [127.0.0.1:56843](http://127.0.0.1:56843), with separate PostgreSQL/Redis ports 56844/56845. Existing playable services were preserved. A [final cleanup snapshot](../artifacts/continued-review/final-cleanup-observation.json) found no enabled NPC fixtures, admin users or blocked database sessions. The final preview health and served-asset check is recorded in [final-health.json](../artifacts/continued-review/final-health.json). The sanitized launcher and readiness evidence are in [continued-review](../artifacts/continued-review/start-review.ps1).

## Findings from the broad matrix

The 13 failures are retained in a [detailed evidence summary](../artifacts/continued-review/matrix-failures.md). Three offline tests had already loaded the old error-message assertion before its source was updated; fresh test loading is needed to verify the corrected text and subsequent reconnection. The admin failure exposed the configuration-loading race corrected in this revision.

| Failure category                  | Cases | What the evidence establishes                                                                                                                                                                                                 |
| --------------------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Old offline-message assertion     |     3 | Firefox, WebKit and mobile Chromium rendered the new recovery UI but the running assertion still expected the old copy.                                                                                                       |
| Mutation acknowledgement deadline |     4 | Tribe creation, NPC creation, initial registration and NPC resume ended around the 15-second client deadline. Tribe and NPC creation have eventual-commit evidence; completion is not established for registration or resume. |
| Initial screen readiness          |     2 | Firefox map entry and WebKit alert settings did not reach their tested feature.                                                                                                                                               |
| Cumulative UI action delays       |     2 | WebKit castle selection and gameplay exhausted the 240-second overall budget. Recruitment reached 37 troops and a scout with a 7-second preview was sent; the gameplay test had not reached the report wait or raid.          |
| Map fallback completion           |     1 | WebKit completed all measured frames and rendered Canvas, then exhausted the overall budget before its remaining fallback checks finished.                                                                                    |
| Configuration-loading race        |     1 | Validate submitted only a version number before the real configuration GET completed.                                                                                                                                         |

No assertion deadline, recruitment/travel wait or frame count was extended to turn these failures into passes. The scripts use a 240-second overall case budget on this constrained host. Later focused results must be read alongside these failures, not substituted for them.

The [NPC fixture](../tests/e2e/npcs.spec.ts) now starts accounts paused before explicit resume. [Cleanup evidence](../artifacts/continued-review/npc-cleanup.log) confirms the earlier fixture's scoped accounts were already paused and its temporary administrator role was cleared.

## Final build follow-up

The 22-case follow-up completed with **10 passed and 12 failed**, without retries or skips. It used the final production asset and the existing assertion deadlines. The separate [evidence summary](../artifacts/continued-review/final-followup-findings.md) links each failure to its trace or stage diagnostics.

| Project          | Passed | Failed |
| ---------------- | -----: | -----: |
| Desktop Firefox  |      1 |      4 |
| Mobile WebKit    |      3 |      5 |
| Desktop Chromium |      3 |      2 |
| Mobile Chromium  |      3 |      1 |

The new administration loading/retry/draft regression passed in Firefox and both Chromium projects. WebKit failed before reaching its first admin-screen assertion. Existing administration validation/replay passed in WebKit and both Chromium projects; Firefox submitted the complete configuration but its request timed out. NPC creation, resume, autonomous building, pace editing and pause controls passed in WebKit and both Chromium projects. Firefox timed out during NPC creation; a later read confirmed both accounts existed paused, with no enabled NPCs. WebKit also passed disabling an existing notification subscription.

The 12 failures comprise eight aborted POST acknowledgements, two WebKit initial-screen readiness failures, one WebKit castle interaction timeout, and one incomplete WebKit map frame sample. Successful intermediate actions remain documented: the Chromium social flow completed tribe, forum and messaging operations before account saving timed out. The WebKit castle flow selected and closed Ironwatch before exhausting its overall budget during zooming.

**All four fresh login/offline scenarios stopped during registration or sign-in.** The corrected offline-message assertion and subsequent reconnection were therefore not reached in this follow-up. Firefox map entry stopped at an aborted guest request; WebKit reached 50,000 villages but did not complete frame sampling. Neither final map attempt produced a valid new FPS measurement.

The host had 628 MiB of free memory at one observation during this run. A later database snapshot showed no active or blocked sessions; it does not explain earlier request delays. Test mode disables server request logging, so identifying the cause requires request-correlated phase timings. These observations are limitations, not a confirmed cause of the failures.

## Map measurements and visual review

Fresh full-matrix diagnostics from the initial bundle are preserved in [map-visual-evidence.md](../artifacts/continued-review/map-visual-evidence.md), with timestamps, renderer identifiers, phase timings and screenshot links.

| Browser / reported renderer           |       Mean FPS | p95 frame time | Completed workload                                                           |
| ------------------------------------- | -------------: | -------------: | ---------------------------------------------------------------------------- |
| Desktop Chromium / WebGL, SwiftShader |           8.15 |       166.6 ms | 50,000 villages, 60 warm-up + 300 measured frames, Canvas fallback verified  |
| Mobile Chromium / WebGL, SwiftShader  |          12.78 |       150.0 ms | Same workload and fallback verified                                          |
| Mobile WebKit / WebGL, Apple GPU      |           2.85 |       891.0 ms | Same full frame sample; Canvas rendered, remaining fallback checks timed out |
| Desktop Firefox                       | No measurement | No measurement | Guest-to-village readiness failed before map navigation                      |

These headless measurements were taken under changing host load and do not establish a frame-rate improvement or physical-device performance. The Canvas allocation change is independently covered by unit tests and exact pixel-restoration checks in all four browsers.

Fresh desktop and mobile overview/Canvas screenshots showed no horizontal overflow, overlapping controls, blank seams or broken sprites. [Desktop overview](../artifacts/continued-review/screenshots/desktop-firefox-overview.png), [mobile overview](../artifacts/continued-review/screenshots/mobile-webkit-overview.png), and [mobile Canvas map](../artifacts/continued-review/screenshots/mobile-webkit-castles-canvas-canvas.png) are preserved. Secondary mobile text remains small and pale; it is a useful target for a future contrast/readability review.

## Ideas and next priorities

1. **Measure request latency through the server.** Reproduce the 15-second acknowledgement failures with sanitized request identifiers and timings for rate limiting, database checkout, world-lock acquisition, handler/commit and response completion. Test mode currently disables request logging. A single later database snapshot showed no blockers and cannot establish what delayed earlier requests. Preserve the current client deadline while establishing the cause.
1. **Finish large-map and deployment verification.** Use the new stage diagnostics to distinguish startup delays from rendering cost. Profile on the intended hardware before claiming stable frame rates, and complete the existing sustained-load, installed-device push, SMTP, TLS, backup and alert-delivery checks in [verification.md](verification.md).
1. **Split and lazily load larger screens.** Reports, messages, tribe, administration and simulator code can become focused modules. Measure initial loading and recheck the offline shell after any bundle split.
1. **Share typed API contracts with runtime boundary validation.** Start with state, villages, reports and messages so structurally wrong successful responses do not silently enter the UI.
1. **Complete unread-message filtering.** Add the missing server predicate, visible control and received-versus-sent regressions together.
1. **Polish social errors and stored roles.** Return a clear not-found response for missing diplomacy targets, and reset an officer's stored role when leaving a tribe. Membership is already required for leadership permissions.
1. **Keep failure and account-transition tests in routine checks.** Extend coverage to multiple tabs, long idle periods and delayed command acknowledgements. Retain evidence from failures rather than replacing it with later successful runs.
1. **Reconcile push subscription ownership across accounts.** Browser subscription status alone does not confirm its server registration belongs to the current player. Add server-backed status or an explicit relink flow and verify two-account use on one device.

1. **Propagate request cancellation and test delayed successful refreshes across sign-in/logout.** Query cancellation protects the cache but currently does not abort the underlying API fetch. Failed refresh does not clear cookies; a successful refresh from an earlier authenticated session needs a delayed-response regression and explicit ordering review before claiming every transport-level account race is covered.
1. **Reduce map refresh traffic and give browser checks dedicated resources.** The WebKit diagnostic served 50,000 villages from 16 unique tiles but made 184 tile requests during the long run. Investigate notification-specific invalidation or bounded tile refresh cadence, then profile it. Run browser projects with isolated worlds and enough memory; preserve normal deadlines and record timing failures separately from successful feature assertions.

## Limits

The initial build and six focused browser checks passed, and the broad matrix completed with the failures above. Final type checking, lint and production build passed. The final browser follow-up completed with 10 passes and 12 failures; the remaining request, readiness and map timing issues prevent a clean verification result. The new admin regression passed in three browsers, and its WebKit attempt stopped before reaching the controls. No public deployment, capacity certification or physical-device push certification is claimed.
