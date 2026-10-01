# Contracts, data ownership, and consistency

The tables are **proposed design contracts** for the worked case. They are not migration files, verified production schemas, or a claim that these exact endpoint paths exist. Compare them with the [source map](README.md) before any implementation.

## Data model

| Entity | Identity / candidate key | Important fields | Owner or purpose |
|---|---|---|---|
| WorldState | world identity plus relevant aggregate identity | authoritative state, optional revision under actual contract | Current accepted domain result |
| ScheduledEvent | event_id | world_id, due_at, status, payload, claim/attempt metadata | Eligible durable work |
| CommandReceipt/EffectIdentity | Scoped logical identity | accepted result and fingerprint if supported | Prevents repeated intent/effect under the chosen contract |
| Outbox/ClientSnapshot | event identity or query identity | delivery progress or account/world-scoped snapshot | Derived notification/read boundary |

Distinguish entity identity from operation identity. A record can receive many commands; a retry of one command should not automatically become a new intent. Include scope where it changes meaning. A globally unique-looking ID still needs authorization, and an opaque identifier should not be normalized as if it were human search text.

## Public API examples

| Illustrative endpoint | Input boundary | Accepted outcome | Other outcomes |
|---|---|---|---|
| POST /worlds/{id}/commands | Authorized world, intent, logical identity under the chosen command contract | Accepted command/result or scheduled work identity | Conflict/invalid command/unauthorized scope |
| GET /worlds/{id}/state | Trusted account/world and optional known version if supported | 200 authoritative current snapshot | Do not apply under an obsolete account/world owner |
| GET /worlds/{id}/events or notification channel | Authorized subscription/replay cursor under proposed policy | Committed hints or defined event stream | Explicit reconnect/gap policy; no promise of perfect delivery |

For one write, add literal examples of omitted, explicit null, zero, wrong-type, stale, and unauthorized input where meaningful. Do not collapse them with a truthiness default. Return an outcome that lets the UI distinguish rejection, accepted-but-not-yet-observed work, and an uncertain response. A timeout does not prove the effect rolled back.

## Query and constraint review

Review pending status/due_at selection and world-specific ordering against actual queries. A partial pending-work index may be a candidate, not a verified improvement. Claim identity or conditional event state must protect effect ownership; an index that makes two workers find the same event faster does not solve the race.

Write the actual predicate and order before proposing an index. Compare the read improvement with write/storage cost and use representative data when examining a plan. A complete cursor must match the complete order; a cursor alone does not freeze a changing dataset across requests. An index improves access to data, while a constraint or conditional transition enforces a different kind of rule.

## Consistency worksheet

Fill four rows for the design: authoritative mutation, immediate read after that mutation, another user's projection, and asynchronous notification/progress. For each, state the source of truth, acceptable staleness, and recovery action. Do not label the entire system strongly or eventually consistent without naming which operation the statement concerns.

The invariant to protect is **An eligible world event has one policy-consistent committed effect, and client refresh/reconnect cannot make another world or obsolete account own the current displayed state.**. Identify the exact write predicate, transaction, or durable identity that enforces it. If the rule spans several records, explain why concurrent operations cannot each pass an earlier check and then commit an invalid combination. A transaction boundary and an isolation choice must be examined together.

## Compatibility, retention, and deletion

When adding a field or outcome, describe what an older client or stored object does. A safe proposal can expand readers first, backfill deliberately, and later require the new writer contract; the exact sequence depends on the repository. Do not call a schema sketch a completed migration.

Choose retention separately for authoritative records, command receipts, work intents, audit history, private source material, and cache entries. Expiring a receipt too early can change retry behavior. Keeping every private payload forever can create unnecessary exposure and operating cost. Record the product decision and recovery consequence rather than inventing a universal retention period.
