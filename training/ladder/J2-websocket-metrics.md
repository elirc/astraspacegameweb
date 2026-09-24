# J2: WebSocket lifecycle metrics (junior)

## Context
Realtime is how players learn "an army is approaching". Today the only realtime metric is `warband_ws_connections`, a gauge recomputed every 5 s from the
in-memory `sockets` map (`apps/server/src/index.ts`, the `gauges` interval). `/api/ws` upgrades aren't even recorded in `warband_http_request_seconds`.
Check it yourself: open the game, then `curl -s localhost:3001/metrics | grep 'route="/api/ws"'`.

## Ticket
> Add `warband_ws_opened_total`, `warband_ws_closed_total{code}` and `warband_ws_hints_total{result="delivered|no_socket"}`. Add a Grafana panel
> "WS churn" (opens/s and closes/s by code) to `infra/grafana/dashboards/world.json`.

## Constraints
- `code` is a label. Bound it: map anything outside `{1000,1001,1006,1012,4000,4001}` to `other`. Explain the reason in the PR.
- `result="no_socket"` is counted in the Redis subscriber loop in `index.ts`, when an event arrives for a player with no registered socket
  *on this instance*. With 2 API replicas, is that an error? What does the sum across instances mean?
- Don't change connection behaviour. This ticket is measurement only.

## Definition of done
- Unit test for the code-bucketing function.
- Integration test using `app.injectWS` (`@fastify/websocket` 11): open → close(1000) → `opened_total` 1, `closed_total{code="1000"}` 1.
- Seen live: with Lab 0 running, open the game in two browser tabs, close one, and restart the api process. Screenshot the churn panel showing 1001/1012 closes.

## Explain before touching
1. Where does a socket's life start and end in `transport/app.ts`? Which timers can close it (`heartbeat`, `expiry`) and with which codes?
2. Which process role exports these metrics, and what happens to them on a resolver instance?
3. Cardinality: what is the maximum number of new series this adds per instance?
4. What would each metric look like during (a) a deploy, (b) a Redis outage, (c) the client's exponential-backoff reconnect loop in `App.tsx`?

<details><summary>Hints</summary>

- Close code 1012 is sent by `close()` in `index.ts` on shutdown. 4001 is revocation/expiry.
- `socket.on('close', (code) => …)`: the `ws` close event gives you the code.
</details>

Sealed answer: `_answers/ladder/J2.md`
