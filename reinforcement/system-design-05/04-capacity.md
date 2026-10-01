# Capacity, bottlenecks, and growth decisions

All numbers here are **hypothetical exercise inputs**, not observed traffic, a benchmark, a production capacity claim, or a vendor quote. Units and boundaries are part of the calculation. The [machine-readable worksheet](capacity.json) is checked by the shared offline calculator.

| Question | Assumptions | Calculation | Worked result |
|---|---|---|---|
| Illustrative snapshot read rate | active=1800, readsPerMinute=2 | active × readsPerMinute / 60 | 60 requests/s |
| One-world notification payload fanout | updatesPerSecond=10, subscribers=200, payloadBytes=300 | updatesPerSecond × subscribers × payloadBytes | 600000 bytes/s |
| Drain 600 overdue events with continuing arrivals | backlog=600, arrivalsPerSecond=20, workers=4, secondsPerJob=0.1 | backlog / (workers / secondsPerJob − arrivalsPerSecond) | 30 seconds |

## What these results imply—and what they do not

The ideal resolver capacity is40 events/s, leaving20 events/s for backlog reduction. Lock contention on one world can make four workers much less than four times one worker. Fanout is payload-only and should be measured per hot world; adding subscribers can move the bottleneck from resolution to delivery or snapshot reads.

**Illustrative snapshot read rate:** Counts the stated active population at the stated rate; not daily active users automatically acting simultaneously.

**One-world notification payload fanout:** Payload bytes per second; excludes transport overhead, retries, reconnect storms, and downstream snapshot reads.

**Drain 600 overdue events with continuing arrivals:** Requires positive net drain capacity and ideal independent workers. If service rate is not above arrivals, no finite drain time is returned.

## A second pass: remove the comfortable assumption

Choose the busiest tenant, world, route, event, or job represented by this design. Concentrate a substantial fraction of traffic there while leaving the aggregate rate unchanged. Explain whether the bottleneck becomes one row, one ordered stream, one subscription fanout, or a downstream quota. Aggregate averages can conceal that skew.

Now consider a cold cache, a worker restart, or a provider slowdown, whichever is relevant. Recalculate the request or drain rate using the same units. For a queue, if service capacity is equal to or below ongoing arrivals, an initial backlog has no positive drain rate under the model. Returning zero seconds would be a false result; the worksheet calculator uses null for that condition.

## Choose an intervention with a falsifiable trigger

Start with bounded queries, connection/concurrency budgets, and the actual dominant cost. Add caching only for eligible representations. Add workers only when downstream capacity and the ordering/ownership contract permit parallelism. Add a separate read projection or index only with an update, replay, and deletion story.

If proposing partitioning, name the partition key and the operations that cross it. If proposing replicas, identify reads allowed to be stale and the read-after-write behavior. If proposing admission control, explain the user outcome and fairness policy. These choices should preserve the invariant rather than merely move overloaded work out of view.

## Run the arithmetic checks

From the central system-design folder:

```powershell
node --test tools/check-capacity.mjs
```

The checks compare thirty hand-specified worksheet results and additional calculator boundary cases. They validate arithmetic and model preconditions only. They do not measure this application's performance. Keep load-test plans and actual measured evidence separate from these worked numbers.
