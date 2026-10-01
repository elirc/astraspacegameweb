# Failure and recovery: Warband / astraspacegameweb

This is a tabletop and integration-planning lab. It introduces no deliberate application defects and does not run infrastructure.

## Worked timeline

| Event or failure point | Authoritative/durable state | User or worker consequence |
|---|---|---|
| Workers A and B select the same due event | Selection is only a plan | No effect should be assumed yet |
| A wins the authoritative eligible transition | Event effect and committed intent are recorded | B must not apply an equivalent second effect |
| Notification is lost or repeated | Committed world state remains authority | Client can refetch on reconnect |
| Old request finishes after world switch | Its payload belongs to another owner | Do not install it as the current world |
| Requests stay healthy while due work stalls | HTTP availability and domain progress disagree | Use backlog age and progress signals to investigate |

The invariant across the timeline is **An eligible world event has one policy-consistent committed effect, and client refresh/reconnect cannot make another world or obsolete account own the current displayed state.**. Mark which transitions are atomic, which are observations, and which can be delivered again. A repeated message and a repeated effect are not the same thing. Selection, claiming, execution, committing, and acknowledging should remain separate words until the actual implementation proves they share a boundary.

## Focused proof plan

Plan two resolver processes competing for one event, a process exit around commit/notification, and a reconnect after missed hints. Inspect durable state and event ownership, not only selected IDs. For client work, use controlled fetch completion and account/world changes; do not infer engine health from a recent 200 response.

Preserve the fixture and initial state. Inject one failure at a named point, inspect all relevant effects, then recover using the same logical identity when the contract requires it. A test that only checks an exception can miss leaked durable changes. A test that mocks the critical repository may assume the property it was intended to establish.

## Three additional disturbances

**Dependency unavailable:** choose the dependency this design actually needs. Specify whether the operation fails, queues durably, serves a permitted stale read, or continues in a reduced mode. Define a bound on fallback work so recovery does not overload the next dependency.

**Duplicate or reordered input:** reuse an operation/event identity and vary delivery order. Explain which replays are harmless, which conflicting payloads must be rejected, and which outcomes require reconciliation. Do not promise exactly-once transport when the guarantee is really one durable effect per accepted identity.

**Old worker or client resumes:** let an earlier owner finish after scope, revision, session, or lease ownership changes. Identify the check at application/commit time that prevents obsolete work from taking ownership. Cancellation at launch is not enough to explain this case.

## Recovery and observability

Combine pending-event count, oldest overdue age, resolved-event rate, transaction failures, outbox age, and client refresh errors. Completed-event latency alone can look quiet when nothing completes; existing pending/oldest metrics supply different evidence.

Set a hypothetical recovery objective for the authoritative dataset and a separate one for rebuildable projections. State the allowable data-loss window (RPO) and time to useful restored service (RTO), then describe a restore rehearsal that could measure them. Do not claim those objectives are achieved merely because a backup command exists.

After a restore, decide how outstanding receipts, delayed events, and external effects reconcile with the restored state. A database restored to an earlier point can forget a previously accepted operation while an external effect still exists. The recovery plan needs that case, not only row counts after restoring a file.

## Handoff artifact

Write one page containing the failure trigger, expected durable state, exact identity used on retry, distinguishing observation, recovery action, and remaining uncertainty. A teammate should be able to tell whether your evidence comes from source reading, a pure model, a database exercise, or an external integration. Human learning and runtime guarantees remain separate assessments.
