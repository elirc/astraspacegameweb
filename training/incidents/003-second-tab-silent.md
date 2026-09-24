# INC-003: "the game stops updating in one of my tabs"

**Branch:** `training/incidents/003-second-tab-silent` · **Severity:** SEV-3, affects every multi-device player · **Timebox:** 60 min

## Reports (all since Tuesday's release)

- "I keep the map in one tab and my village in another. One of them soon stops showing incoming attacks until I reload. The green *Connected* dot stays green."
- "Laptop open all evening, then I open the game on my phone: within seconds the phone stops getting live updates. The laptop is fine."
- Tribe leaders: "Incoming attack warnings show up 10 s late." (The client falls back to its 10 s `/api/state` poll: `apps/web/src/App.tsx`, `refetchInterval: 10000`.)

Single-tab players report nothing wrong. The e2e suite (`tests/e2e/*.spec.ts`, one browser context per player) is green.

## What was collected

Reproduction with `training/ops/two-tabs.mjs`: two scripted "tabs" for **one** guest player. Each tab copies the reconnect logic of `App.tsx` (1 s backoff, `GET /api/state`, reconnect).
Tab B opens 1.5 s after tab A. Then 5 `rename` commands are sent, each of which should produce one live hint per tab:

| Build | Tab A: opens / close codes / hints | Tab B: opens / close codes / hints | `warband_ws_connections` |
|---|---|---|---|
| previous release | 1 / – / 5 | 1 / – / 5 | 2 |
| this release | 2 / `4000`×1 / 5 | 1 / – / **0** | **1** (two sockets are open) |

API log line on the release build, around the time tab B connects:

```
{"level":30,"reqId":"req-7","req":{"method":"GET","url":"/api/ws"},"msg":"incoming request"}
```

There's no error anywhere. The per-socket heartbeat (`server_time` every 5 s) still reaches **both** tabs.

## Suspect PR

```diff
--- a/apps/server/src/transport/app.ts
+++ b/apps/server/src/transport/app.ts
   app.get('/api/ws', { websocket: true }, (socket, req) => {
     const id = req.playerId;
-    let set = sockets.get(id);
-    if (!set) sockets.set(id, (set = new Set()));
-    set.add(socket);
+    // One live socket per player. Tabs that crash or sleep never send a close frame,
+    // so their sockets piled up in the set and every hint was fanned out to dead
+    // connections. The newest connection is the one the player is looking at.
+    for (const old of sockets.get(id) || []) old.close(4000, 'Replaced by a newer connection');
+    const set = new Set<WebSocket>([socket]);
+    sockets.set(id, set);
```

(The `socket.on('close', …)` handler further down is unchanged.)

## Your job

1. Walk the exact event sequence (connect A, connect B, close A, reconnect A) against `sockets` in `apps/server/src/transport/app.ts`.
   Which `Set` object does each close handler hold? Which map entry does it delete?
2. Explain why tab B still looks connected, and why the gauge reads 1.
3. The PR's stated problem (dead sockets never closed) is real. What actually cleans up a socket whose tab died without a close frame? Is that good enough?
4. Fix it. Write the test that would have failed on this PR. Say which layer it belongs in: unit, `app.inject`, or a real ws client.
5. Name two metrics you'd add so the next realtime regression is visible without player reports.

Concept page: [08 Realtime fan-out](../../../opusorganize/apprenticeship/curriculum/08-realtime-fanout.md).
Sealed answer: `_answers/incidents/003-second-tab-silent.md`
