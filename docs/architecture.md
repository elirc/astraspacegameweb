# Simulation and service architecture

## Authority and event order

PostgreSQL owns village aggregates, scheduled events, reports, idempotency records and the notification outbox. Redis only holds disposable caches, queue delivery state and invalidation hints. Flushing Redis does not change the world.

Each simulation batch orders events by `(due_at, id)`, advances resources and loyalty at the event timestamp, and applies the matching immutable rule version. Dynamically generated returns, support releases and merchant returns enter the same ordered queue when already due. PostgreSQL sequences provide stable persisted tie-breakers; rolled-back allocations may leave gaps.

A transaction commits changed villages, new events, journal entries, reports, notifications and completion markers together. A worker crash rolls the transaction back. Retry reuses the persisted event ID and rule version, preserving deterministic luck. Transaction-scoped village advisory locks and row locks guard mutation; bounded retries handle deadlocks and serialization conflicts.

## Causal components

A village alone is not a sufficient lock scope: morale reads player-wide points, support casualties affect the home village, and a return can redirect after conquest. The planner builds a graph from due event dependencies and stationed support. Villages belonging to a potential points/ownership writer share a player node; other villages retain separate nodes. Point readers use shared player locks, while potential writers and command actors use exclusive player locks. The transitive component includes the affected players and due village timelines.

The resolver acquires ordered player/village locks using a short admission mutex, then releases the mutex before processing. A second graph read checks for expanded dependencies or a required shared-to-exclusive lock upgrade; either rolls back and retries. Independent components can resolve concurrently. All simulation transactions hold a shared world lock; migrations and administrator changes hold its exclusive counterpart. A transaction identity token prevents a pooled connection from reusing an earlier component plan.

Commands drain their component before checking costs, ownership and units. Their clock is refreshed after admission, with dependencies rechecked at that time. Idle state reads use one consistent PostgreSQL MVCC snapshot without simulation locks, calculating resource displays without persisting a future anchor. The snapshot detects due effects targeting, originating from or owned by the player; support dependencies conservatively retain causal draining. Active timelines enter the same locked drain protocol as commands. Indexed owner lookups avoid scanning the world for each command. New-village placement uses a single indexed candidate query under the exclusive spawn gate. The [locking ADR](adr/001-causal-components.md) describes the protocol and its tests. Correct concurrency does not itself prove a throughput target; the sustained benchmark is a separate acceptance gate.

## Aggregates, reservations and rules

Village state uses JSONB with relational ownership, coordinates, points and foreign keys. Database checks reject negative resources, fractional/negative troop counts, invalid levels, negative reserved population and loyalty outside 0–100. Incremental relational indexes track player scores and stationed support. Drizzle describes application tables; numbered, checksum-verified SQL migrations remain the deployment authority, including functions, triggers, checks and partial indexes.

Recruitment creates one completion per unit, ensuring an attack arriving mid-queue sees only troops already trained. Queued buildings, recruiting troops, traveling armies and support reserve population. Casualties abroad release home reservations through the timeline. Market level limits available merchants; a caravan occupies its merchants until the return event.

Zod validates JSON catalogs, prerequisites, unit training buildings and feature flags. Administrator changes require the next version, a reason and a dry-run preview. Applying a config drains the old timeline, establishes resource anchors at the boundary, clamps resources to the new storage capacity, stores the new immutable version and publishes invalidations. Existing catalog entries cannot be removed, and population cost changes require an explicit reservation migration.

## Authentication and contracts

Passwords use Argon2id. Access JWTs are HttpOnly, SameSite=Strict cookies; production cookies also require HTTPS. PostgreSQL session families back both guest and account refresh tokens. Refresh tokens are stored as hashes and consumed once. Replay revokes the family. API authentication checks family revocation and account bans on every request; WebSocket sessions revalidate every five seconds and expire at the actual JWT expiry.

Password reset uses hashed, expiring, single-use tokens and a durable mail outbox. Reset revokes existing sessions. Redis provides shared command/auth limits, with a PostgreSQL fallback during Redis loss. Every game POST requires a player-bound idempotency key; concurrent repeated requests return the stored response, while conflicting reuse returns 409. Authentication endpoints use session/token semantics instead of game command replay.

The map reveals public metadata only. Defender movement views redact incoming troops. Reports, message archives and subscriptions are scoped to the authenticated player. Administrators require a host-granted role; moderation/config changes are audited with reasons. Push endpoints are restricted to browser push services to prevent server-side request forgery.

## Processes and delivery

The bootstrap validates role selection and optionally starts OpenTelemetry. API, WebSocket, resolver, relay and side-job roles can run separately. Graceful shutdown stops admission, closes sockets and waits for active transactions. Checked-out PostgreSQL clients capture connection errors between statements; rollback preserves the original failure and the transaction is never reported committed. Command retry exhaustion includes causal-lock contention, while ordinary resolver contention remains a retry signal. The relay uses `FOR UPDATE SKIP LOCKED` to publish committed outbox rows. A crash after publication can repeat a hint; clients refetch authoritative state.

BullMQ handles email, push, rankings cache and maintenance. Undelivered side effects remain in PostgreSQL and are resubmitted after Redis loss. Email and push can be delivered more than once if a process dies after the remote service accepts delivery but before PostgreSQL commits; notification tags and deterministic job IDs reduce duplication but do not provide cross-service exactly-once delivery.

Prometheus records event lag after commit, request latency, resolver duration/errors, lock retries, active sockets and queue backlogs. Grafana dashboards and alert rules are included; routing alerts to a real operator is a deployment setting. pgBackRest supplies base backups and WAL archives. The isolated recovery drill verifies time-targeted restore and preservation of a synchronously acknowledged commit after primary loss and standby promotion.

## Client and later scaling

React Query owns server state, Zustand stores selected village/camera, and React Router preserves navigation in the URL. Server clock samples use a rolling median. Pixi caches a spatial bucket index per streamed tile, reuses visible particle objects and culls both offscreen tiles and villages while panning; Canvas and a searchable list provide fallbacks. Camera rendering is scheduled once per animation frame, while React state and saved camera preferences are synchronized every 100 ms. Tile indexes are keyed by the village array, so timestamp-only refreshes do not rebuild graphics. The service worker caches static assets only and handles opt-in push notifications.

Additional worlds, read replicas and time partitioning are explicitly later work in the specification's scaling path. World identifiers and immutable config versions establish the boundaries; enabling another world requires removing the current world-1 routing assumptions and repeating cross-world authorization tests. Production capacity must be established using the load harness on the intended deployment hardware.

Village pages reserve 30% of their space for updates, and table-specific autovacuum thresholds address the high update rate. This targets the low HOT-update ratio observed in the load fixture; it is a tuning hypothesis until remeasured. PostgreSQL documents the relationship between free page space, unchanged indexed columns and [heap-only tuple updates](https://www.postgresql.org/docs/16/storage-hot.html). The migration changes future page usage without rewriting a live table or disabling durable commits.

## Application boundaries and replay

HTTP registration and schemas live in `transport`, database-backed use cases in `application`, and synchronous event handlers in `domain/events`. An exhaustive typed registry dispatches every event kind. ESLint resolves TypeScript imports and executable negative checks prove that transport-to-database and domain-to-infrastructure imports are rejected. Root module exports preserve existing import entry points.

Village/time-range replay exports a repeatable-read history, validates continuity through recorded command checkpoints and replays immutable event rules against temporary tables. The CLI creates and drops its own disposable database; the admin route uses transaction-local temporary tables. State/ownership diffs and deterministic effect hashes detect mismatches. Older full-effect journals remain supported. See [replay evidence](adr/003-replay-evidence.md) for the scope and limitations of historical inputs.
