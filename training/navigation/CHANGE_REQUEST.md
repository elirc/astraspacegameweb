# Change request: "World status" banner and endpoint

> **From:** community manager · **To:** engineering
> During last Saturday's slowdown, players flooded the forum asking whether their attacks would still count. We want a small banner in the game,
> "The world is running N seconds behind; all battles will resolve in order", that appears when resolution is late, and a public
> `GET /api/world/status` JSON we can link from Discord: `{ status: "ok"|"delayed"|"catching_up", behindSeconds, pendingDue, updatedAt }`.
> It must keep working when the game is struggling. That's the whole point.

## Before any agent writes code, write down (in `training/navigation/MY_CHANGE_PLAN.md`)
1. **Where it belongs:** which files in `transport/`, `application/`, `apps/web/src/`, and where the numbers come from. Can you reuse something that already
   computes "oldest pending event"? Should you?
2. **Cost and failure behaviour:** this endpoint will be hit by every open client (and by Discord embeds) while the DB is under the most pressure. What does
   each request cost today if implemented naively? What happens when the DB is slow: does the banner disappear exactly when it's needed?
3. **Auth:** public or authenticated? Look at the `onRequest` hook's allow-list in `transport/app.ts` and what `/api/health` and `/api/legal` do.
   Could this route leak anything the map privacy rules protect (`docs/architecture.md`: "The map reveals public metadata only")?
4. **Data changes:** does this need a migration? A new table, or none?
5. **Client:** where in `App.tsx` does the banner go, how often does it poll (or can it ride the existing WS hint / `server_time` heartbeat?), and how does it
   behave offline (service worker `apps/web/public/sw.js`)?
6. **Tests:** which unit, integration and e2e tests prove it, including "DB slow" and "Redis down"?
7. **Observability:** does this endpoint need its own SLI? What would make it lie (think INC-002)?

Sealed reference placement: `_answers/navigation/change-request.md`
