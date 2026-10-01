# Reference reasoning: Warband / astraspacegameweb

Attempt the [design interview](../06-interview-lab.md) first. This is one defensible direction, not a unique correct architecture or a production patch.

## The core answer

Make committed world state authoritative and keep notification delivery and client refetch recoverable around it. The invariant remains: **An eligible world event has one policy-consistent committed effect, and client refresh/reconnect cannot make another world or obsolete account own the current displayed state.**

Separate event selection, ownership, resolution, commit, and notification. Sorting due events decides which work a worker would like to attempt. It does not prevent another worker from selecting the same event. The actual resolver must enforce an eligible transition or equivalent idempotent effect inside the appropriate transaction; inspect that boundary before claiming duplicate-effect safety.

Commit state changes and notification intent together when the architecture requires reliable downstream notification. Delivery can retry and clients can receive duplicate hints. The browser should reconcile against authorized current state after reconnect rather than depending on perfect transport delivery. A missing event in a sequential projection can trigger a snapshot reload; whether the actual API exposes revisions must be checked, not assumed from the teaching model.

Client ownership includes account and world. The inspected refresh coordinator already addresses an older in-flight request followed by a dirty refetch, so explain that behavior before proposing replacement code. Account reset has a separate boundary because previously private query data must not carry into another identity.

Capacity and fairness must be considered per world as well as globally. A per-batch world quota can limit one world's share of a batch without proving it can never starve under repeated scheduling. If measured skew requires stronger fairness, introduce a deliberate scheduling policy with persistent state and a testable progress claim.

## The failure answer must name the boundary

Plan two resolver processes competing for one event, a process exit around commit/notification, and a reconnect after missed hints. Inspect durable state and event ownership, not only selected IDs. For client work, use controlled fetch completion and account/world changes; do not infer engine health from a recent 200 response.

Reject an explanation that replaces this with a technology name. A queue does not by itself decide ownership, a transaction does not automatically include an external effect, and a cache key does not enforce authorization. Ask the learner to put the failure between two concrete steps and show the accepted, rejected, and unchanged state.

## Capacity and tradeoff answer

The ideal resolver capacity is40 events/s, leaving20 events/s for backlog reduction. Lock contention on one world can make four workers much less than four times one worker. Fanout is payload-only and should be measured per hot world; adding subscribers can move the bottleneck from resolution to delivery or snapshot reads.

The accepted cost is: The design needs durable ownership, reconnect semantics, bounded notification replay or refetch, and separate progress instrumentation. The revisit trigger is: Introduce partitioning or stronger per-world scheduling only when measured contention or starvation risk identifies the needed boundary; define cross-world operations before splitting ownership.

Accept alternatives that meet the same clarified contract and expose their costs. Do not reward unnecessary components or a fabricated production traffic number. The strongest follow-up asks what requirement would make this answer wrong and how the candidate would detect that change.

## What counts as completion

The learner can explain one happy path, one competing or failed path, the authoritative data identity, and one calculation with units. They can name the difference between inspected source and proposed design. An application guarantee still needs the corresponding runtime evidence. Historical tests remain historical; no new application verification is implied by reading these notes.
