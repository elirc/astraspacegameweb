process.env.DATABASE_URL =
  process.env.LOAD_DATABASE_URL ||
  'postgres://warband:drill_only@127.0.0.1:55433/warband_load_test';
if (!/^[a-z_]+_test$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1)))
  throw new Error('Profiling must use a dedicated _test database');
const db = await import('../../packages/db');
const { lockCausalComponent } = await import('../../packages/db/causality');
const { drain } = await import('../../apps/server/src/engine');
await db.initialize();
await db.transaction(async (real) => {
  const tx = new Proxy(real, {
    get(target, key) {
      if (key === 'query')
        return async (...args: any[]) => {
          const t = Date.now();
          const r = await (target.query as any)(...args);
          console.log({ query: String(args[0]).slice(0, 75), ms: Date.now() - t });
          return r;
        };
      return Reflect.get(target, key);
    },
  });
  await tx.query("SET LOCAL statement_timeout='10s'");
  console.log((await tx.query('SHOW jit')).rows);
  const rows = (
    await tx.query(
      "SELECT village_id,due_at FROM scheduled_events WHERE status='pending' ORDER BY due_at,id LIMIT $1",
      [Number(process.env.PROFILE_BATCH || 1000)],
    )
  ).rows;
  if (!rows.length) throw new Error('No pending fixture events to profile');
  const at = rows.at(-1).due_at.getTime();
  const start = Date.now();
  console.log({ rows: rows.length, at, initial: rows.slice(0, 3) });
  const plan = await lockCausalComponent(
    tx,
    rows.map((r) => r.village_id),
    at,
  );
  console.log({
    stage: 'planned',
    ms: Date.now() - start,
    players: plan.players.length,
    villages: plan.villages.length,
  });
  const n = await drain(tx, at);
  console.log({ stage: 'drained', ms: Date.now() - start, n });
});
await db.pool.end();
export {};
