import pg from 'pg';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
const url =
  process.env.OUTAGE_DATABASE_URL ||
  'postgres://warband:warband_local@127.0.0.1:55432/warband_outage_test';
const name = new URL(url).pathname.slice(1);
if (!/^[a-z_]+_test$/.test(name)) throw new Error('Use a dedicated _test database');
const admin = new pg.Pool({ connectionString: url.replace(/\/[^/]+$/, '/postgres') });
try {
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
    await admin.query(`CREATE DATABASE "${name}"`);
} finally {
  await admin.end();
}
const probe = createServer();
await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
const port = (probe.address() as any).port;
await new Promise<void>((r) => probe.close(() => r()));
const base = `http://127.0.0.1:${port}`,
  delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    ROLE: 'all',
    PORT: String(port),
    DATABASE_URL: url,
    REDIS_URL: 'redis://127.0.0.1:1',
  },
});
try {
  let ready = false;
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(base + '/api/health', { signal: AbortSignal.timeout(2000) })).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (child.exitCode !== null) throw new Error('Server exited during Redis outage');
    await delay(500);
  }
  if (!ready) throw new Error('Server did not start without Redis');
  const guest = await fetch(base + '/api/auth/guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!guest.ok) throw new Error('Guest authentication failed');
  const cookie = guest.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const state = await (await fetch(base + '/api/state', { headers: { cookie } })).json();
  const command = await fetch(base + `/api/villages/${state.villages[0].id}/command`, {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ action: 'rename', name: 'Redis outage survived' }),
  });
  if (!command.ok) throw new Error('Command failed without Redis: ' + (await command.text()));
  const after = await (await fetch(base + '/api/state', { headers: { cookie } })).json();
  if (after.villages[0].name !== 'Redis outage survived')
    throw new Error('Command was not persisted');
  const result = {
    at: new Date().toISOString(),
    redisUnavailable: true,
    allRoleStarted: true,
    guestAuthentication: true,
    authoritativeRead: true,
    commandPersisted: true,
  };
  await mkdir('artifacts/chaos', { recursive: true });
  await writeFile('artifacts/chaos/redis-outage.json', JSON.stringify(result, null, 2));
  console.log(result);
} finally {
  child.kill('SIGTERM');
  await delay(1000);
  if (child.exitCode === null) child.kill('SIGKILL');
}
