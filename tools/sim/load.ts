import pg from 'pg';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { defaultConfig, freshVillage, points } from '../../packages/shared/game';
const url =
  process.env.LOAD_DATABASE_URL ||
  'postgres://warband:drill_only@127.0.0.1:55433/warband_load_test';
const name = new URL(url).pathname.slice(1);
if (!/^[a-z_]+_test$/.test(name))
  throw new Error('Load database must be a dedicated _test database');
const seconds = Number(process.env.LOAD_SECONDS || 600),
  rate = Number(process.env.LOAD_RATE || 1000),
  villageCount = Number(process.env.LOAD_VILLAGES || 50000);
if (seconds < 1 || seconds > 3600 || rate < 1 || rate > 10000 || villageCount < 2000)
  throw new Error('Invalid load parameters');
const admin = new pg.Pool({ connectionString: url.replace(/\/[^/]+$/, '/postgres') });
if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
  await admin.query(`CREATE DATABASE "${name}"`);
await admin.end();
process.env.DATABASE_URL = url;
const db = await import('../../packages/db');
console.log('Preparing isolated load database...');
await db.initialize();
await db.pool.query('TRUNCATE worlds CASCADE');
const cfg = { ...defaultConfig, speed: 1, unitSpeed: 180 };
await db.pool.query('INSERT INTO worlds(id,name,config) VALUES(1,$1,$2)', [
  cfg.name,
  JSON.stringify(cfg),
]);
await db.pool.query('INSERT INTO config_versions(world_id,version,config) VALUES(1,$1,$2)', [
  cfg.version,
  JSON.stringify(cfg),
]);
await db.pool.query(
  "INSERT INTO players(id,world_id,name) SELECT i,1,'Load player '||i FROM generate_series(1,2000) i",
);
const state = freshVillage(Date.now());
state.units = { spear: 5 };
state.buildings.wall = 0;
state.reservedPopulation = 1000000;
await db.pool.query(
  "INSERT INTO villages(id,world_id,player_id,x,y,name,state,points) SELECT i,1,((i-1)%2000)+1,i%1000,floor(i/1000.0),'Load village '||i,$1::jsonb,$2 FROM generate_series(1,$3::int) i",
  [JSON.stringify(state), points(state.buildings), villageCount],
);
await db.pool.query(
  "SELECT setval('players_id_seq',(SELECT max(id) FROM players)),setval('villages_id_seq',(SELECT max(id) FROM villages))",
);
await db.pool.query(
  'ANALYZE villages; ANALYZE player_scores; ANALYZE support_links; ANALYZE scheduled_events',
);
await mkdir('artifacts/load', { recursive: true });
const committedLags: number[] = [];
const workers: ReturnType<typeof spawn>[] = [],
  logs: number[] = [];
const probe = createServer();
await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
const port = (probe.address() as any).port;
await new Promise<void>((r) => probe.close(() => r()));
const origin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  DATABASE_URL: url,
  REDIS_URL: process.env.LOAD_REDIS_URL || 'redis://127.0.0.1:56380',
  ROLE: 'api',
  PORT: String(port),
  NODE_ENV: 'test',
};
const apiLog = openSync('artifacts/load/api.log', 'w');
logs.push(apiLog);
const api = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
  env,
  windowsHide: true,
  stdio: ['ignore', apiLog, apiLog],
});
workers.push(api);
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
let cookie = '',
  apiErrors = 0;
const apiTimes: number[] = [],
  readTimes: number[] = [],
  commandTimes: number[] = [];
try {
  let ready = false;
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(origin + '/api/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (api.exitCode !== null) throw new Error('API exited; see artifacts/load/api.log');
    if (i % 20 === 0) console.log('Waiting for isolated benchmark API...');
    await delay(500);
  }
  if (!ready) throw new Error('API startup exceeded two minutes');
  const guest = await fetch(origin + '/api/auth/guest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!guest.ok) throw new Error('Benchmark API did not start: ' + (await guest.text()));
  cookie = guest.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const initialState = (await (
    await fetch(origin + '/api/state', { headers: { cookie } })
  ).json()) as any;
  const villageId = initialState.villages[0].id;
  const readiness: Promise<void>[] = [];
  for (let i = 0; i < Number(process.env.LOAD_WORKERS || 3); i++) {
    const fd = openSync(`artifacts/load/worker-${i}.log`, 'w');
    logs.push(fd);
    const child = spawn(process.execPath, ['--import', 'tsx', 'tools/sim/worker.ts'], {
      env,
      windowsHide: true,
      stdio: ['ignore', fd, fd, 'ipc'],
    });
    workers.push(child);
    readiness.push(
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Worker startup timed out')), 120000);
        child.on('message', (m: any) => {
          if (m.lags) committedLags.push(...m.lags);
          if (m.ready) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.on('exit', (code) => {
          clearTimeout(timer);
          reject(new Error('Worker exited ' + code));
        });
      }),
    );
  }
  await Promise.all(readiness);
  let measuring = true;
  const sampler = (async () => {
    let iteration = 0;
    while (measuring) {
      const isCommand = iteration++ % 4 === 0;
      const start = performance.now();
      try {
        const response = await fetch(
          origin + (isCommand ? `/api/villages/${villageId}/command` : '/api/state'),
          {
            method: isCommand ? 'POST' : 'GET',
            headers: {
              cookie,
              ...(isCommand
                ? { 'content-type': 'application/json', 'idempotency-key': randomUUID() }
                : {}),
            },
            body: isCommand
              ? JSON.stringify({ action: 'rename', name: 'Load capital ' + (iteration % 2) })
              : undefined,
            signal: AbortSignal.timeout(5000),
          },
        );
        await response.text();
        if (!response.ok) apiErrors++;
        const elapsed = performance.now() - start;
        apiTimes.push(elapsed);
        (isCommand ? commandTimes : readTimes).push(elapsed);
      } catch {
        apiErrors++;
      }
      await delay(250);
    }
  })();
  const start = Date.now() + 2000;
  for (let second = 0; second < seconds; second++) {
    const batch = Array.from({ length: rate }, (_, i) => {
      const n = second * rate + i,
        origin = (n % 1000) + 1,
        target = ((n * 37) % (villageCount - 1000)) + 1001,
        due = start + second * 1000 + Math.floor((i * 1000) / rate);
      return {
        village_id: target,
        due_at: new Date(due),
        payload: {
          kind: 'attack',
          origin,
          originName: 'Load origin',
          targetName: 'Load target',
          owner: origin,
          units: { axe: 20 },
          sent: due - 1000,
          travel: 1000,
          reserved: 20,
        },
      };
    });
    await db.pool.query(
      "INSERT INTO scheduled_events(world_id,village_id,kind,due_at,payload,config_version) SELECT 1,village_id,'movement',due_at,payload,1 FROM jsonb_to_recordset($1::jsonb) AS x(village_id bigint,due_at timestamptz,payload jsonb)",
      [JSON.stringify(batch)],
    );
    if (second % 10 === 0)
      console.log(
        JSON.stringify({
          produced: (second + 1) * rate,
          elapsed: Math.max(0, (Date.now() - start) / 1000),
        }),
      );
    await delay(Math.max(0, start + (second + 1) * 1000 - Date.now()));
  }
  const finishDeadline =
    Date.now() + Number(process.env.LOAD_DRAIN_SECONDS || (seconds < 600 ? 30 : 180)) * 1000;
  while (Date.now() < finishDeadline) {
    const n = Number(
      (await db.pool.query("SELECT count(*) AS n FROM scheduled_events WHERE status='pending'"))
        .rows[0].n,
    );
    if (!n) break;
    await delay(500);
  }
  measuring = false;
  await sampler;
  const stats = (
    await db.pool.query(
      "SELECT count(*)::int AS arrivals,count(*) FILTER(WHERE status='done')::int AS completed,percentile_cont(0.99) WITHIN GROUP(ORDER BY extract(epoch FROM applied_at-due_at)) FILTER(WHERE status='done') AS p99_lag_seconds,max(extract(epoch FROM applied_at-due_at)) AS max_lag_seconds FROM scheduled_events WHERE kind='movement'",
    )
  ).rows[0];
  committedLags.sort((a, b) => a - b);
  stats.precommit_p99_lag_seconds = stats.p99_lag_seconds;
  stats.p99_lag_seconds = committedLags[Math.floor(committedLags.length * 0.99)] ?? null;
  stats.commitObservations = committedLags.length;
  apiTimes.sort((a, b) => a - b);
  readTimes.sort((a, b) => a - b);
  commandTimes.sort((a, b) => a - b);
  const commandP95 = commandTimes[Math.floor(commandTimes.length * 0.95)] || 0;
  const readP95 = readTimes[Math.floor(readTimes.length * 0.95)] || 0;
  const apiP95 = apiTimes[Math.floor(apiTimes.length * 0.95)] || 0;
  const result = {
    at: new Date().toISOString(),
    seconds,
    rate,
    villageCount,
    workers: workers.length - 1,
    ...stats,
    apiP95Ms: apiP95,
    commandP95Ms: commandP95,
    readP95Ms: readP95,
    commandSamples: commandTimes.length,
    readSamples: readTimes.length,
    apiSamples: apiTimes.length,
    apiErrors,
    certified:
      committedLags.length === stats.completed &&
      seconds >= 600 &&
      rate >= 1000 &&
      stats.completed === seconds * rate &&
      stats.p99_lag_seconds < 2 &&
      apiP95 < 150 &&
      commandP95 < 150 &&
      commandTimes.length > 0 &&
      apiErrors === 0,
  };
  await writeFile('artifacts/load/result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (
    committedLags.length !== stats.completed ||
    stats.completed !== seconds * rate ||
    stats.p99_lag_seconds >= 2 ||
    apiP95 >= 150 ||
    commandP95 >= 150 ||
    !commandTimes.length ||
    apiErrors
  )
    process.exitCode = 1;
} finally {
  for (const worker of workers) worker.kill('SIGTERM');
  await delay(1000);
  for (const worker of workers) if (worker.exitCode === null) worker.kill('SIGKILL');
  for (const fd of logs) closeSync(fd);
  await db.pool.end();
}
