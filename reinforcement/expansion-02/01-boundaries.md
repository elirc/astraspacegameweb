# Boundary lessons: Bounded event work and evidence of engine freshness

## Selection is not ownership

A queue can contain overdue events from several worlds. Selecting the earliest entries answers which work a caller wants to attempt. It does not establish that another worker cannot select the same entries. Keep selection, claiming, processing, and committing separate in your source trace. The first lab is only a deterministic selection policy over a supplied snapshot.

Order matters when a batch boundary cuts through events with identical due times. A comparator that only uses dueAt can make the result depend on the incoming array order. The teaching policy breaks ties by the event ID's code-unit order, making a reordered snapshot produce the same selected IDs. This is a reproducibility choice, not a claim about the production database's current ordering.

A global batch limit bounds one call's output but allows a busy world to occupy the entire batch. The lab adds a per-world ceiling within the batch. For example, with a global limit of three and a per-world limit of one, three events from world A cannot prevent an eligible event from world B entering that batch. The result may contain fewer than three events even when more are due. Explain why this is an intentional policy result rather than lost work.

That ceiling still does not prove fairness across repeated batches. If only one slot is available and the same world always has the earliest event, another world can wait indefinitely. A persistent rotating cursor, weighted scheduling, or explicit age policy would be a separate design. Do not name a single-batch quota a starvation guarantee.

## Fresh pages can show stale state

The original refresh exercises concern requesting and applying newer query results. A successful HTTP response can still return state from an engine that has stopped advancing. Trace both freshness boundaries: when the server last made meaningful progress, and when the client last observed the server. A recent client fetch establishes only the second observation.

Read the server metrics source and identify the event lag measurement associated with resolved work. A measurement of completed events is useful, but does not automatically describe the oldest unresolved event. If work stops completely, a histogram of previously completed events can remain unchanged. List which source of evidence would tell you whether new work is arriving, whether workers are alive, and whether old work is accumulating.

The second lab combines heartbeat age with the age of the oldest due event. It intentionally distinguishes missing evidence from a healthy reading. A null heartbeat is unknown; a heartbeat timestamp in the future is clock skew; a heartbeat older than its budget is stalled. Only after those checks does it classify an old backlog. These labels are teaching policy, not existing production health endpoints.

## Choose the owner of time

Supply time as an argument to both labs. Tests can then express exactly-at-deadline and just-after-deadline behavior without sleeping. In production, timestamps from different clocks need a documented comparison rule. A future heartbeat should not become a reassuring negative age.

A healthy heartbeat proves that its writer executed recently. If it is emitted by a timer unrelated to event processing, it does not prove the processing loop advanced. Ask where the heartbeat is written, what successful action precedes it, and what happens if a transaction fails after the write. Record the answer before selecting alert names or thresholds.

## Make the boundary visible

For each source trace, record the caller, input representation, validation, state owner, returned value, and visible user consequence. Put a question mark beside every arrow you inferred rather than located. Resolve one question by reading its caller and one by proposing a focused test. A diagram full of accurate filenames can still miss an unhandled outcome.

End with three sentences: the invariant, the failure that would violate it, and the smallest observation that would detect the violation. Use [the source map](README.md) to keep this exercise attached to the actual repository.
