# Runtime stack and service boundaries

Status: implemented, with the exceptions and acceptance gates below.

The project uses the specification's TypeScript stack so browser previews and authoritative workers execute the same pure formulas. Runtime validation remains necessary: TypeScript types cannot validate an HTTP request, a database JSON value or an operator-edited catalog.

| Decision | Reason and consequence |
| --- | --- |
| TypeScript, Zod | Shared pure rules and validated catalogs avoid separately maintained client/server combat formulas. Strict mode and unchecked-index checking are enabled. |
| pnpm, Turborepo | Explicit workspace packages and a pinned package manager make builds reproducible. Both dependency manifests and the frozen pnpm lock are required in CI. |
| Fastify, JSON Schema | Authentication, validation, rate limiting and OpenAPI share one transport. Additional properties are rejected rather than destructively removed during union validation. |
| PostgreSQL 16 | Transactions commit aggregates, events, reports and outbox entries together. Advisory locks encode application ordering; Redis loss cannot erase an arrival. |
| Drizzle and numbered SQL | Drizzle supplies typed tables and queries. Explicit SQL expresses locks, triggers and bulk operations. Checked-in migrations are checksum-verified; schema push is not a deployment path. |
| JSONB village aggregates | A locked village is the mutation unit. Relational ownership, map indexes, scores and support links support indexed queries; SQL checks protect resource and troop invariants. This differs from the specification's normalized illustrative schema. |
| Redis 7 | Disposable pub/sub, caches and shared rate limits reduce database work. PostgreSQL rate buckets provide an outage fallback. Session revocation is checked against PostgreSQL. |
| BullMQ | Email, Web Push, ranking caches and cleanup are side jobs. A durable PostgreSQL side-effect row survives queue loss; simulation arrivals never depend on a Redis timer. |
| WebSocket | Plain JSON invalidations prompt authoritative refetches. Reconnect is expected. A relay retry can duplicate a notification and clients must tolerate that. |
| Argon2id and rotating cookies | Short-lived access tokens and hashed refresh families provide persistent sessions and replay revocation. SameSite=Strict is intentionally stronger than the suggested Lax setting. API requests check revocation; sockets recheck at bounded intervals. |
| React 19 and Vite | One responsive client supports the village loop and administration. The production build injects its actual hashed assets into the offline service-worker manifest. |
| PixiJS 8 and Canvas | Streamed tiles and visible particles bound rendered objects. The Canvas fallback and searchable village list retain access when WebGL is unavailable. Physical GPU performance remains a measured release gate. |
| TanStack Query and Zustand | Query manages server snapshots and invalidation; Zustand persists camera and selected village. React Router represents the current page in the URL. |
| Tailwind and Radix | Tailwind utilities coexist with the original visual styles. Radix supplies modal focus management and keyboard dismissal. Browser tests exercise narrow layouts and dialogs. |
| Vitest, Testcontainers, Playwright, k6 | Property tests cover formulas, disposable real databases cover transactions, browsers cover user flows, and load tools measure capacity. Passing functional tests cannot certify throughput. |
| Pino, OpenTelemetry, Prometheus, Grafana | Structured logs, optional traces and committed-event metrics expose resolver and API behavior. Dashboards and alert expressions are versioned; a real alert recipient is an operator setting. |
| Docker and GitHub Actions | One immutable application image runs role-selected processes. Private PostgreSQL/Redis and an HTTPS edge provide the deployment boundary. CI checks the build, databases, browsers and isolated recovery drills. No hosting vendor is required by the implementation. |

The causal locking protocol is specified separately in [ADR 001](001-causal-components.md). The server now separates `transport/` route registration, `application/` operations and database orchestration, and `domain/events/handlers/` pure aggregate handlers. A typed registry requires a handler for every scheduled kind. Transport imports application operations; pure handlers import only shared rules and domain types. ESLint resolves extensionless TypeScript imports and executable forbidden-import probes check that the boundaries actually reject violations.

Further worlds, read replicas and time partitioning follow the explicitly deferred scaling path. Production release still requires the recorded capacity, real-device and operator deployment gates in [verification](../verification.md).
