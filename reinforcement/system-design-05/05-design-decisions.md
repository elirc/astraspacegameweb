# Decision record and worked design journal

## ADR: the boundary chosen for this case

**Status:** proposed teaching decision, not an approved application migration.

**Context:** A player issues a command, a server worker resolves due work, and the browser learns the committed result. The player may disconnect, miss notifications, switch accounts/worlds, and later reconcile from an authorized snapshot.

**Required invariant:** An eligible world event has one policy-consistent committed effect, and client refresh/reconnect cannot make another world or obsolete account own the current displayed state.

**Decision:** Make committed world state authoritative and keep notification delivery and client refetch recoverable around it.

**Alternative considered:** Use a single elected worker per world and periodic authorized snapshot polling. This simplifies ordinary ordering and client reconnect behavior but limits throughput per world and still needs fenced failover and idempotent commits. Partition work further only when measured world load requires it.

**Pitfall to reject:** Assume every client receives every event once in order, or use local arrival time as a global ordering source.

**Cost accepted:** The design needs durable ownership, reconnect semantics, bounded notification replay or refetch, and separate progress instrumentation.

**Revisit trigger:** Introduce partitioning or stronger per-world scheduling only when measured contention or starvation risk identifies the needed boundary; define cross-world operations before splitting ownership.

An alternative can become appropriate under a different workload or requirement. The purpose of the record is to make that change legible. A trigger should refer to measured contention, an operating requirement, a query/evaluation result, or a clear product constraint—not a preference for a more fashionable architecture.

## Worked journal: a fictional design-learning entry

The following paragraph is a teaching narrative, not a claim about the user's work or a new production incident.

My first design treated a successful refresh as proof that the game had advanced. Reading the metrics changed that: request availability, worker progress, and domain correctness are three different observations. I also separated the selector from the resolver transaction. That made the duplicate-worker test obvious and prevented me from claiming a sorting helper supplied ownership.

My next step would be to turn the strongest claim into a falsifiable example. I would state the initial values, put the competing action or failure at a specific boundary, and identify what must remain unchanged. If the source already implements the desired mechanism, I would characterize that behavior and preserve its evidence rather than propose a replacement just to make the exercise look larger.

I would also separate three levels of confidence: the diagram appears coherent, the code contains a relevant mechanism, and an executed test demonstrates the claimed outcome. Each is useful, but they are not interchangeable. The capacity worksheet supplies another kind of evidence: arithmetic under explicit assumptions. It does not fill in a missing benchmark or prove a service meets a latency objective.

## Write your own decision journal

Record the first design you considered, the concrete counterexample that changed it, and the simpler boundary you can now explain. Include one downside of the chosen design. Then change a requirement—higher contention, stricter freshness, a second process, revoked access, or an unavailable dependency—and explain whether the decision still holds.

Keep the actual source observation next to any claim about existing behavior. Label proposed APIs and schemas as proposed. If you later discuss this in an interview, distinguish reading, modeling, implementation, and runtime verification, and identify the artifacts you personally produced.
