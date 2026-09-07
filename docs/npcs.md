# Developer-controlled NPC residents

Register a normal account, then grant it the existing administrator role from the host:

```sh
pnpm admin grant exact-email@example.com
```

Open **World administration → npcs** and enter a reason for the change. Only authenticated administrators can list, create or control NPCs; ordinary players cannot promote themselves or convert a human account into an NPC.

Create 1–50 accounts at a time, up to 1,000 managed NPCs in the current world. Each gets an unused randomized first/surname, its own named village, normal starting resources and troops, and a persistent player identity. NPCs appear in maps, rankings, battles and reports like other players. They have no email, password or login session.

Choose Builder, Balanced or Raider behavior. Builders develop their economy and defenses; other styles also recruit offensive troops, scout and raid. Raids default to abandoned villages. The explicit rival-target setting permits attacks on other players, excluding the NPC's own tribe and allied tribes. Decisions use public target metadata, not hidden defender armies.

The development pace controls the randomized time between decisions: relaxed (5–15 minutes), steady (30–120 seconds), active (5–20 seconds), or a custom range of 5–86,400 seconds. These are real seconds, independent of world speed. Actual upgrades pay normal costs, obey prerequisites and population limits, and finish through the normal construction timeline. Intervals are opportunities to act, not guaranteed upgrades when resources or queue space are unavailable. Automatic building can be disabled independently of other behavior.

Select one or more NPCs to apply settings, or use each account's pause/resume controls. **Pause all NPCs** stops new automated actions. Existing queues and armies continue normally. Banned NPCs cannot act. An NPC that loses every village is paused rather than receiving a free replacement.

Automation runs in `all` and `sidejobs` processes and uses PostgreSQL directly, so Redis loss does not stop it. Due NPC rows are claimed with `FOR UPDATE SKIP LOCKED`; game actions use the same causal locks, command validation, resource accounting, audit history and event handlers as human commands. An action and its next scheduled turn commit atomically. Multiple workers and restarts cannot duplicate a turn. Schedules survive restarts, with at most one current decision per claimed NPC instead of replaying a burst of missed decisions.

Routes (all administrator-only, writes require the normal idempotency key):

- `GET /api/admin/npcs?q=&cursor=0`
- `POST /api/admin/npcs` — `{count, settings, reason}`
- `POST /api/admin/npcs/update` — `{ids, settings, reason}`
- `POST /api/admin/npcs/pause` — `{reason}`

Settings: `enabled`, `style`, `autoBuild`, `minDelaySeconds`, `maxDelaySeconds`, `targetMode`. Creation, settings changes and global pauses are audited. `warband_npc_turns_total` and `warband_npc_errors_total` expose worker activity. The admin list shows population counts, pending turns, each NPC's last action and next decision time.

The 1,000-account cap is an operational guard, not a throughput certification. Deploy enough side-job/resolver capacity for the chosen population and pace, and monitor overdue decisions and ordinary event lag.
