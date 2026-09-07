import pg from 'pg';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { openSync, closeSync } from 'node:fs';
import { defaultConfig, freshVillage, points } from '../../packages/shared/game';
const run = promisify(execFile),
  url = 'postgres://warband:drill_only@127.0.0.1:55433/warband_drill_test';
process.env.DATABASE_URL = url;
const db = await import('../../packages/db'),
  engine = await import('../../apps/server/src/engine');
await db.initialize();
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  at = Date.UTC(2026, 0, 1);
async function seed() {
  await db.pool.query('TRUNCATE worlds RESTART IDENTITY CASCADE');
  await db.pool.query('INSERT INTO worlds(id,name,config) VALUES(1,$1,$2)', [
    defaultConfig.name,
    JSON.stringify(defaultConfig),
  ]);
  await db.pool.query('INSERT INTO config_versions(world_id,version,config) VALUES(1,$1,$2)', [
    defaultConfig.version,
    JSON.stringify(defaultConfig),
  ]);
  await db.pool.query("INSERT INTO players(world_id,name) VALUES(1,'Attacker'),(1,'Defender')");
  const state = freshVillage(at);
  state.units = { spear: 10000, sword: 10000 };
  state.reservedPopulation = 1000000;
  for (let i = 1; i <= 2; i++)
    await db.pool.query(
      'INSERT INTO villages(world_id,player_id,x,y,name,state,points) VALUES(1,$1::bigint,$1::smallint,500,$2,$3,$4)',
      [i, 'Village ' + i, JSON.stringify(state), points(state.buildings)],
    );
  const rows = Array.from({ length: 500 }, (_, i) => ({
    village_id: 2,
    due_at: new Date(at + Math.floor(i / 5) * 10),
    payload: {
      kind: 'attack',
      origin: 1,
      originName: 'Village 1',
      targetName: 'Village 2',
      owner: 1,
      units: { axe: 20 + (i % 3) },
      travel: 1000,
      reserved: 22,
      sent: at - 1000,
    },
  }));
  await db.pool.query(
    "INSERT INTO scheduled_events(world_id,village_id,kind,due_at,payload,config_version) SELECT 1,village_id,'movement',due_at,payload,1 FROM jsonb_to_recordset($1::jsonb) AS x(village_id bigint,due_at timestamptz,payload jsonb)",
    [JSON.stringify(rows)],
  );
}
async function snapshot() {
  return {
    villages: (await db.pool.query('SELECT id,player_id,state,points FROM villages ORDER BY id'))
      .rows,
    reports: (
      await db.pool.query(
        'SELECT player_id,kind,subject,payload,created_at FROM reports ORDER BY id',
      )
    ).rows,
    events: (
      await db.pool.query(
        "SELECT CASE WHEN kind='movement' THEN id ELSE 0 END AS original_id,village_id,kind,status,due_at,payload FROM scheduled_events ORDER BY kind,village_id,due_at,payload::text,id",
      )
    ).rows,
  };
}
await seed();
await db.transaction(async (tx) => {
  await db.worldLock(tx);
  await engine.drain(tx, at + 100000);
});
const reference = await snapshot();
await seed();
await mkdir('artifacts/chaos', { recursive: true });
const logs: number[] = [];
const children: ReturnType<typeof spawn>[] = [];
const paused: { child: ReturnType<typeof spawn>; backendPid: number }[] = [];
function worker(hold = true) {
  const log = openSync(`artifacts/chaos/worker-${children.length}.log`, 'w');
  logs.push(log);
  const child = spawn(process.execPath, ['--import', 'tsx', 'tools/sim/worker.ts'], {
    env: { ...process.env, DATABASE_URL: url, CHAOS_HOLD_COMMIT: hold ? '1' : '0' },
    windowsHide: true,
    stdio: ['ignore', log, log, 'ipc'],
  });
  child.on('message', (message: any) => {
    if (message?.beforeCommit) paused.push({ child, backendPid: message.backendPid });
  });
  children.push(child);
  return child;
}
async function nextPaused() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const entry = paused.shift();
    if (entry && entry.child.exitCode === null && entry.child.signalCode === null) return entry;
    await delay(50);
  }
  throw new Error('No resolver reached an uncommitted event batch');
}
for (let i = 0; i < 8; i++) worker();
try {
  const first = await nextPaused();
  console.log('First resolver reached an uncommitted event batch');
  first.child.kill('SIGKILL');
  const second = await nextPaused();
  console.log('Second resolver reached an uncommitted event batch');
  if (
    !(await db.pool.query('SELECT pg_terminate_backend($1) AS killed', [second.backendPid])).rows[0]
      .killed
  )
    throw new Error('Could not terminate the resolver backend');
  second.child.kill('SIGKILL');
  // Restart PostgreSQL while a third resolver has actual event writes in flight.
  await nextPaused();
  console.log('Restarting PostgreSQL with a third event batch uncommitted');
  await run('docker', ['compose', '-f', 'infra/chaos/compose.yaml', 'restart', 'postgres'], {
    windowsHide: true,
  });
  await run(
    'docker',
    ['compose', '-f', 'infra/chaos/compose.yaml', 'exec', '-T', 'redis', 'redis-cli', 'FLUSHALL'],
    { windowsHide: true },
  );
  for (const child of children) if (child.connected) child.send('resume', () => {});
  worker(false);
  worker(false);
  let pending = 1;
  for (let i = 0; i < 240; i++) {
    try {
      pending = Number(
        (await db.pool.query("SELECT count(*) AS n FROM scheduled_events WHERE status='pending'"))
          .rows[0].n,
      );
      if (!pending) break;
    } catch {}
    await delay(500);
  }
  if (pending) throw new Error('Events remained pending after chaos recovery');
  if (
    children
      .filter((child) => child !== first.child && child !== second.child)
      .some((child) => child.exitCode !== null || child.signalCode !== null)
  )
    throw new Error(
      'A surviving resolver exited during database recovery: ' +
        JSON.stringify(
          children.map((child, index) => ({
            index,
            exit: child.exitCode,
            signal: child.signalCode,
            expectedKill: child === first.child || child === second.child,
          })),
        ),
    );
  const actual = await snapshot();
  if (JSON.stringify(reference) !== JSON.stringify(actual))
    throw new Error('World or reports diverged after crashes');
  await mkdir('artifacts/chaos', { recursive: true });
  const result = {
    at: new Date().toISOString(),
    attacks: 500,
    workers: 8,
    killedWorkers: 2,
    heldUncommittedEventBatches: 3,
    survivingResolversStayedRunning: true,
    killedBackend: true,
    postgresRestart: true,
    redisFlushed: true,
    identical: true,
    sha256: createHash('sha256').update(JSON.stringify(actual)).digest('hex'),
  };
  await writeFile('artifacts/chaos/simulation.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  for (const child of children) {
    if (child.connected) child.send('resume', () => {});
    child.kill('SIGTERM');
  }
  await delay(1000);
  for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
  for (const log of logs) closeSync(log);
  await db.pool.end();
}
