import { pool } from '../../packages/db';
import { resolveDue } from '../../apps/server/src/engine';
import { observeResolutions } from '../../apps/server/src/metrics';
// Optional diagnostics for isolated probes; omit parameter values and result data.
if (process.env.PROFILE_RESOLVER === '1') {
  const timings = new Map<string, { calls: number; ms: number }>();
  pool.on('connect', (client) => {
    const query = client.query.bind(client);
    client.query = ((...args: any[]) => {
      const start = performance.now();
      const result = (query as any)(...args);
      if (!result?.then) return result;
      return result.finally(() => {
        const key = String(args[0]).replace(/\s+/g, ' ').slice(0, 100);
        const prior = timings.get(key) || { calls: 0, ms: 0 };
        prior.calls++;
        prior.ms += performance.now() - start;
        timings.set(key, prior);
      });
    }) as typeof client.query;
  });
  process.on('beforeExit', () =>
    console.log(JSON.stringify({ queryTimings: [...timings].sort((a, b) => b[1].ms - a[1].ms) })),
  );
}
// Isolated chaos harness only: hold an actual written batch immediately before
// COMMIT so fault injection cannot accidentally kill a worker before it starts.
if (process.env.CHAOS_HOLD_COMMIT === '1') {
  let held = false,
    resume!: () => void;
  const released = new Promise<void>((resolve) => (resume = resolve));
  process.on('message', (message) => {
    if (message === 'resume') resume();
  });
  pool.on('connect', (client) => {
    const query = client.query.bind(client);
    client.query = (async (...args: any[]) => {
      if (args[0] === 'COMMIT' && !held) {
        held = true;
        const backend = (await query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        process.send?.({ beforeCommit: true, backendPid: backend });
        await released;
      }
      return (query as any)(...args);
    }) as typeof client.query;
  });
}
observeResolutions((samples) => {
  const lags = samples.filter((s) => s.kind === 'movement').map((s) => s.lag);
  if (lags.length) process.send?.({ lags });
});
const startupDeadline = Date.now() + 120000;
for (;;) {
  try {
    await pool.query('SELECT 1');
    break;
  } catch (error: any) {
    if (
      !['57P03', '57P01', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code) ||
      Date.now() >= startupDeadline
    )
      throw error;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
process.send?.({ ready: true });
let stopped = false,
  active = false,
  total = 0;
const timer = setInterval(
  async () => {
    if (stopped || active) return;
    active = true;
    try {
      total += await resolveDue();
    } catch (e: any) {
      console.error(e.code || e.message);
      await new Promise((resolve) => setTimeout(resolve, 250));
    } finally {
      active = false;
    }
  },
  Number(process.env.RESOLVER_POLL_MS || 25),
);
const status = setInterval(() => console.log(JSON.stringify({ pid: process.pid, total })), 10000);
async function close() {
  stopped = true;
  clearInterval(timer);
  clearInterval(status);
  while (active) await new Promise((r) => setTimeout(r, 10));
  await pool.end();
}
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
