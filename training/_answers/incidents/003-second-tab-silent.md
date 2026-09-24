# ANSWER: INC-003 second tab goes silent

**Verification:** RUN-VERIFIED with `training/ops/two-tabs.mjs` (main: both tabs 5/5 hints, gauge 2; branch: tab B 0/5 hints, gauge 1 with 2 open sockets).

## Mechanism, step by step (`apps/server/src/transport/app.ts`)

Every connection's `close` handler captures the `set` variable **from its own connect call**:
`socket.on('close', () => { set?.delete(socket); if (!set?.size) sockets.delete(id); … })`.

| Step | Map `sockets.get(player)` | What happens |
|---|---|---|
| A connects | `S1 = {A}` | – |
| B connects | `S2 = {B}` | PR code calls `A.close(4000)` and replaces the entry with a new Set |
| A's close handler | **deleted** | `S1.delete(A)` → S1 is empty → `sockets.delete(id)`. This deletes the entry that now points at **S2** |
| A reconnects (1 s backoff, `App.tsx`) | `S3 = {A'}` | `sockets.get(id)` is undefined, so nobody is kicked |
| Hint arrives via Redis (`apps/server/src/index.ts` subscriber) | `S3` | `sockets.get(player_id)` → only A' gets it. **B is open, but not registered anywhere** |

Tab B still looks connected because its heartbeat interval lives in the per-connection closure. It keeps sending `server_time` every 5 s and
re-authenticating, so the *Connected* dot stays green. The gauge (`wsConnections.set([...sockets.values()].reduce(...))` in `index.ts`) counts
registered sockets, not open ones: 1.

(On `main`, sharing one Set per player makes the captured `set` and the map entry the same object, which is why the old handler was safe.)

## Was the PR's premise right?

Partly. A tab that dies without a close frame leaves its socket in the Set until something notices. Here that is (a) the 5 s heartbeat `send`,
which eventually errors when TCP gives up (minutes), and (b) the `expiry` timer at JWT `exp` (≤ 15 min, `expiresIn: '15m'` in `application/auth.ts`).
Fanning a hint out to a few dead sockets costs almost nothing. The correct fix for dead peers is ws-level ping/pong with `terminate()` on a missed pong,
not evicting healthy connections.

## Fix

```ts
let set = sockets.get(id);
if (!set) sockets.set(id, (set = new Set()));
set.add(socket);
// …
socket.on('close', () => {
  const current = sockets.get(id);          // look up the live entry; never trust a captured one
  current?.delete(socket);
  if (current && current.size === 0) sockets.delete(id);
  clearInterval(heartbeat); clearTimeout(expiry);
});
```

If a per-player cap is wanted (say 8 sockets), evict the *oldest* with a distinct close code, and make sure the evicted socket's handler goes through
the same identity-safe path. Add `socket.ping()` in the heartbeat and `terminate()` when no `pong` arrives by the next beat.

## Tests

- **Unit:** extract `SocketRegistry { add(player, ws); remove(player, ws); get(player); count() }` and test the exact sequence above:
  add A, add B, remove A → `get(player)` still contains B, `count() === 1`. This fails on the PR's semantics.
- **Integration:** `@fastify/websocket` exposes `app.injectWS('/api/ws', { headers: { cookie } })`. Open two for one player, close the first, then call
  the fan-out function (move the subscriber's loop into an exported `deliver(event)` in `transport/app.ts`) and assert the second socket receives it.
- The e2e suite missed this because each Playwright test is one context = one socket per player. Add one multi-context test.

## Metrics that would have shown it

- `warband_ws_opened_total`, `warband_ws_closed_total{code}`. A spike of `code="4000"` right after the deploy is the smoking gun.
- `warband_ws_hints_total{result="delivered|no_socket"}` in the subscriber loop. A rise in `no_socket` for players with open sockets is the symptom.
- Note: `/api/ws` upgrades don't appear in `warband_http_request_seconds` today (verified), so WS traffic has no metric at all.

## Postmortem (short)

**Impact:** multi-tab and multi-device players lost live hints on all but one connection. Updates degraded to the 10 s poll.
**Trigger:** a "one socket per player" PR combined with an existing close handler that captured its Set by closure.
**Detection:** player reports. The gauge undercounted, but nobody alerts on a gauge dropping.
**Actions:** identity-safe registry + unit test; injectWS integration test; ping/pong for dead peers; WS open/close/hint metrics; one multi-context e2e.
Concept: curriculum 08 rules 1 and 2 (realtime is a hint; membership is per connection).
