import pg from 'pg';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
const run = promisify(execFile);
const docker = (...args) => run('docker', args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
const db = new pg.Pool({
  connectionString: 'postgres://warband:drill_only@127.0.0.1:55433/postgres',
});
const name = 'warband_package_test';
try {
  if (!(await db.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
    await db.query('CREATE DATABASE warband_package_test');
} finally {
  await db.end();
}
const probe = createServer();
await new Promise((r) => probe.listen(0, '127.0.0.1', r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const env = resolve('artifacts/package.env'),
  container = 'warband-package-' + randomUUID().slice(0, 8),
  base = 'http://127.0.0.1:' + port;
await writeFile(
  env,
  [
    'NODE_ENV=production',
    'ROLE=all',
    'PORT=3001',
    'DATABASE_URL=postgres://warband:drill_only@postgres:5432/warband_package_test',
    'REDIS_URL=redis://redis:6379',
    'JWT_SECRET=' + randomBytes(32).toString('hex'),
    'METRICS_TOKEN=' + randomBytes(24).toString('hex'),
    'PUBLIC_ORIGIN=' + base,
  ].join('\n'),
);
let started = false;
let keepAlive;
const result = { at: new Date().toISOString(), image: 'warband-web:local', checks: [] };
const assert = (condition, label) => {
  if (!condition) throw new Error(label);
  result.checks.push(label);
};
try {
  // Some Node/Windows fetch timeout paths unref every handle during cold startup.
  // Keep the smoke harness alive until its finally block can clean up the container.
  keepAlive = setInterval(() => {}, 1000);
  await docker(
    'run',
    '-d',
    '--name',
    container,
    '--network',
    'warband-drills_default',
    '-p',
    `127.0.0.1:${port}:3001`,
    '--env-file',
    env,
    'warband-web:local',
  );
  started = true;
  let ready = false;
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(base + '/api/health', { signal: AbortSignal.timeout(2000) })).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(ready, 'packaged production server becomes healthy');
  assert(
    (await docker('exec', container, 'id', '-u')).stdout.trim() === '1000',
    'application runs as non-root UID 1000',
  );
  const root = await fetch(base + '/');
  assert(root.ok && (await root.text()).includes('Warband'), 'compiled client is served');
  const worker = await fetch(base + '/sw.js');
  assert(
    worker.ok && (await worker.text()).includes('Serve them directly'),
    'final offline worker is packaged',
  );
  const guest = await fetch(base + '/api/auth/guest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert(guest.ok, 'guest can join packaged production server');
  const set = guest.headers.getSetCookie();
  assert(
    set.length > 0 && set.every((c) => c.includes('Secure') && c.includes('HttpOnly')),
    'production session cookies are Secure and HttpOnly',
  );
  const cookie = set.map((c) => c.split(';')[0]).join('; ');
  const state = await fetch(base + '/api/state', { headers: { cookie } });
  assert(state.ok, 'packaged authenticated state succeeds');
  const village = (await state.json()).villages[0];
  const command = await fetch(base + `/api/villages/${village.id}/command`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
    body: JSON.stringify({ action: 'rename', name: 'Package verified' }),
  });
  assert(command.ok, 'packaged command commits');
  const credentials = {
    email: 'package-' + randomUUID() + '@example.test',
    password: 'PackagedCampaign2026!',
    name: 'Package ' + randomUUID().slice(0, 8),
  };
  const registered = await fetch(base + '/api/auth/register', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  assert(registered.ok, 'packaged Argon2 account registration succeeds');
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: credentials.email, password: credentials.password }),
  });
  assert(login.ok, 'packaged Argon2 password verification succeeds');
  const stopAt = Date.now();
  await docker('stop', '--time', '60', container);
  result.shutdownMs = Date.now() - stopAt;
  assert(
    (await docker('inspect', '--format', '{{.State.ExitCode}}', container)).stdout.trim() === '0',
    'Linux SIGTERM shutdown exits cleanly without forced kill',
  );
  result.passed = true;
} catch (error) {
  result.passed = false;
  result.error = error.message;
  process.exitCode = 1;
} finally {
  clearInterval(keepAlive);
  if (started) {
    const logs = await docker('logs', container);
    await writeFile('artifacts/package-server.log', logs.stdout + logs.stderr);
    await docker('rm', '-f', container);
  }
  await unlink(env);
  await writeFile('artifacts/package-smoke.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
