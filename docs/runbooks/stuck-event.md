# Stuck or delayed events

Check `/metrics`: distinguish event backlog from a notification-only backlog. Inspect the oldest pending event in the admin event view and correlate resolver logs by request/trace ID. Confirm all resolver instances can reach PostgreSQL and are running the same release.

Do not mark an event done manually. An aborted transaction leaves its state, reports and outbox unchanged. Fix the handler/config or restore connectivity, then let a resolver retry the same event ID. Replay a previously committed event through the admin tool to compare recorded before/after state. Preserve the failed event and audit trail.

If a single event is poisonous, pause resolvers for that world and collect its pinned configuration, payload and affected village snapshots before applying a reviewed data repair. Resume one resolver, verify the oldest-event age decreases, then restore worker count.
