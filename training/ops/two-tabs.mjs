// Two scripted "tabs" for ONE guest player, mimicking the reconnect logic in apps/web/src/App.tsx.
// Usage: start a ROLE=all (or api+relay) server on :3001, then: node training/ops/two-tabs.mjs   (BASE=http://host:port to override)
const base = process.env.BASE || 'http://127.0.0.1:3001';
const guest = await fetch(base + '/api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
const cookie = guest.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const state = await (await fetch(base + '/api/state', { headers: { cookie } })).json();
const village = state.villages[0].id;
const stats = {};
function tab(name) {
  const s = (stats[name] = { opens: 0, closes: {}, hints: 0, stateGets: 0 });
  let attempt = 0;
  const connect = () => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/api/ws', { headers: { cookie } });
    ws.onopen = () => { s.opens++; attempt = 0; };
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type !== 'server_time' && m.type !== 'connected') s.hints++; };
    ws.onclose = (e) => {
      s.closes[e.code] = (s.closes[e.code] || 0) + 1;
      setTimeout(async () => { s.stateGets++; await fetch(base + '/api/state', { headers: { cookie } }).catch(() => {}); connect(); }, Math.min(30000, 1000 * 2 ** attempt++));
    };
  };
  connect();
}
tab('A');
await new Promise((r) => setTimeout(r, 1500));
tab('B');
await new Promise((r) => setTimeout(r, 3000));
for (let i = 0; i < 5; i++) {
  await fetch(base + `/api/villages/${village}/command`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ action: 'rename', name: 'Tab test ' + i }) });
  await new Promise((r) => setTimeout(r, 4000));
}
const metrics = await (await fetch(base + '/metrics')).text();
console.log(JSON.stringify({ stats, ws_gauge: metrics.match(/^warband_ws_connections (\S+)/m)?.[1], ws_upgrades: metrics.match(/warband_http_request_seconds_count\{method="GET",route="\/api\/ws"[^}]*\} \S+/g), state_gets: metrics.match(/warband_http_request_seconds_count\{method="GET",route="\/api\/state"[^}]*\} \S+/g) }));
process.exit(0);
