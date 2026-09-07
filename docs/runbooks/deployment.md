# Deploy and roll back

1. Run the full checks, concurrency simulation and production build. Use one immutable image digest for all roles.
2. Supply private PostgreSQL/Redis URLs, HTTPS hostname/origin, random JWT/metrics secrets, VAPID keys, SMTP sender, operator name and support address. `compose.production.yaml` requires these values. Keep `.env` and `infra/runtime` out of source control and back up secrets separately.
3. Verify managed PostgreSQL PITR is enabled and a restore drill passed. With self-hosted PostgreSQL, use the pgBackRest image/config and an off-host encrypted repository; a volume on the database machine alone is not disaster recovery.
4. Run `pnpm db:migrate` from the new image before rolling application instances. Migration checksums reject changes to already applied SQL. Review Drizzle-generated SQL, then add a new numbered expand/contract migration. Never run schema push against a live world.
5. Start new API instances, verify health and authenticated commands, and switch the edge to them. WebSocket clients reconnect and refetch. Roll resolver instances one at a time; allow 60 seconds for in-flight transactions to finish. Killing a process rolls back its uncommitted work.
6. Watch event lag, HTTP errors, outbox backlog and lock retries. Roll the application image back if needed while retaining compatible expanded schema. Do not reverse a destructive migration automatically. Keep old columns until a later release after the rollback window.

The compose file separates API, resolver, relay and side-job roles. Only the HTTPS edge is public; Grafana is bound to loopback. Configure an Alertmanager destination appropriate to the operator rather than leaving Prometheus alerts without an on-call recipient. A real public deployment requires the operator's domain, hosting account, mail credentials and operational ownership.

## Local package and browser checks

`node tools/sim/package-smoke.mjs` verifies `warband-web:local` against the separate `warband_package_test` database in the `warband-drills` Docker project. It checks the served client, production cookie flags, a committed command, non-root UID and graceful Linux shutdown. It creates and removes only its own temporary application container. Start the drill PostgreSQL/Redis services first.

Playwright WebKit fails its browser-level offline-emulation reload even on the independent cache-only page in `tools/sim/offline-probe.mjs`; moving the game check to Linux reproduced the hang. The PWA regression therefore cuts the real origin's TCP connections through `tests/e2e/offline-proxy.ts`. The browser must serve its real cached assets and recover when the origin returns. Firefox and Chromium additionally use browser-level offline emulation. No mocked application response supplies the offline page.

For Linux WebKit on a Windows workstation, build `warband-browser:local` using `infra/browser/Dockerfile`, based on the application image. Run it with Docker's host gateway available and mount the current `tools/sim`, `tests/e2e`, `playwright.config.ts` and writable `artifacts` under `/app`, then execute `node tools/sim/linux-browser.mjs`. Its outer proxy preserves a localhost origin for the container browser. The application must serve a completed build on host port 3001.

Never rebuild the live `dist` directory during a browser test. Build a new immutable image or stop tests before replacing local static files.
