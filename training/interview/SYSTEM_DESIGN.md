# System design: take Warband to 50× and multi-region

## The prompt (the interviewer reads this)
"Warband today: one world, one Postgres, 3 resolvers, 2 API instances, Caddy on one host. The publisher wants **50 worlds** of 20k players each, players in
EU, NA and SEA, and a war-night peak of 1,000 arrivals/s *per world* in the first minute of each hour. Walk me through the architecture, then I'll push on it."

Candidate: 5 minutes of structure first. Use the real code as your baseline (`apps/server/src/index.ts` roles, `packages/db/causality.ts`, `engine.ts` `drain`).

## Pressure points (the interviewer asks these in order, and digs into each)
1. **Unit of scale.** Worlds are independent game universes (the code already carries `world_id` and `worlds.config`, but everything assumes world 1:
   `WHERE world_id=1` literals in `engine.ts`). World-per-database, world-per-schema, or shared tables? What breaks in each for accounts that play in two worlds?
2. **Resolver throughput per world.** Today ~110–120 events/s on a laptop (M2). What's your per-world target, where does it come from, and what's the first
   thing you change (journal size, shard leases, `synchronous_commit` for replayable work)? What must stay true (determinism; `tools/sim/chaos.ts`)?
3. **Multi-region.** A world has one authoritative timeline. Where does its primary live? What do SEA players in an EU world experience for commands
   (RTT + drain)? Would you do read replicas for `/api/state`, and what does "state as of replica lag" do to the timers the client renders (`server_now`)?
4. **Realtime fan-out at scale.** Every API instance receives every Redis message today (`index.ts` subscriber). At 50 worlds × N instances, what's the cost?
   Channels per world? Per player? A managed pub/sub? What happens to hints during a cross-region partition? (Curriculum 08.)
5. **The hour mark.** 1,000 arrivals/s for 60 s, then quiet. Autoscale resolvers? Pre-warm? Accept a 30 s backlog? Express it as an SLO (M1) and defend it
   to the product owner.
6. **Failure domains.** One world's poison event, one world's runaway NPCs (`runNpcBatch`), one bad release. How do you stop one world from hurting the other 49?
   (Per-world resolver pools, per-world rollout cohorts, per-world kill switches.)
7. **Operations.** 50 worlds × 7 roles × 16 connections: do the M4 math. Metrics cardinality with a `world` label: which metrics get it, which mustn't?
8. **Enterprise-ish asks:** a tournament organiser wants an isolated world with their own admins and audit export. What reuses the current model
   (`audit_log`, admin roles), and what doesn't?

## What a strong answer contains
- A capacity model with a number per resolver and per DB, and a plan to measure it on target hardware (not "Kubernetes will scale it").
- World as the shard key and the failure domain. Shared identity service for accounts. World routing at the edge.
- Explicit keeps: Postgres authority, ordered `(due_at,id)` per causal component, realtime as hints.
- Explicit changes: shard leases instead of random windows, a journal diet, per-world channels, migrations as a gated job per world cohort, SLOs per world.
- It names what gets worse: cross-world features, ops toil, schema migrations × 50.
