# Production completion ledger

The user attachment is the acceptance specification. Implementation does not certify performance, real-device behavior or a public launch.

- [x] Versioned migrations, strict TypeScript, Drizzle table types and database integrity checks
- [x] Guest/account session families, refresh reuse detection, revocation and single-use password recovery
- [x] Shared command limits with PostgreSQL fallback; transactional game/social idempotency
- [x] JSON building/unit/economy/combat catalogs, immutable rule versions and admin dry runs
- [x] Admin inspection, event replay, audit, moderation and movement cancellation
- [x] Administrator-only NPC account creation with randomized names, persistent player villages, autonomous paid building/recruitment/scouting/raids, configurable decision intervals, individual/bulk controls and restart recovery; 65 regression tests and four NPC browser projects passed
- [x] OpenAPI generation, REST aliases, cursor inboxes, archive/read tools and tribe roles/invitations
- [x] Finite merchants and scheduled merchant returns
- [x] BullMQ side jobs, durable mail/push outbox, role lifecycle and Web Push subscription controls
- [x] Tile streaming, culled Pixi particles, Canvas fallback, keyboard and touch map controls
- [x] Persistent, randomized outward starter frontier shared by humans/NPCs; spaced castles, advanced-core avoidance, nearby neutral quota and transactional rollback; dark fortress atlas shared by Pixi/Canvas; 74 regression tests passed
- [x] Router/Zustand client state, rolling-median server clock, field guide and legal/operator pages
- [x] Metrics, traces, dashboards, validated alert/ingress configurations and deployment/recovery runbooks
- [x] Actual pgBackRest PITR and synchronous standby failover drill
- [x] 500-arrival deterministic simulation with competing workers and real crash/restart/Redis-loss drill
- [x] 59/59 final-image regression against initially empty PostgreSQL databases and real Redis; preceding 58/58 fresh-Testcontainers run; four browser projects cover delivery/map/offline flows (see the run and rerun evidence)
- [x] Transport/application/pure-domain split, typed per-event registry and executable forbidden-import guard checks
- [x] Village/time-range replay CLI with a disposable database, admin range controls, mutation checkpoints, continuity validation and state/effect diffs
- [ ] 1,000 arrivals/second for ten minutes with p99 committed event lag <2s and API p95 <150ms
- [x] Final 50,000-village functional map cases across Firefox, WebKit and both Chromium projects, including Canvas fallback
- [ ] Stable physical integrated-GPU 60fps (final runs: 59.12 / 58.25 / 58.73 fps; one of three passed)
- [ ] Installed Android/iOS Web Push verification
- [ ] Operator-provided production domain, hosting, SMTP deliverability, off-host backup storage, alert routing and public launch

Post-launch world sharding, read replicas and partitioning follow the specification's explicit “designed in, not built” scaling path. See [verification](verification.md) for evidence and measured failures; unchecked gates are not represented as complete.
