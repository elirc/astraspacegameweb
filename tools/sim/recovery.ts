import pg from 'pg';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
const run = promisify(execFile),
  file = 'infra/chaos/compose.yaml';
async function docker(...args: string[]) {
  const r = await run('docker', ['compose', '-f', file, ...args], {
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  return r.stdout;
}
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const primary = new pg.Pool({
  connectionString: 'postgres://warband:drill_only@127.0.0.1:55433/warband_drill_test',
});
const restored = new pg.Pool({
  connectionString: 'postgres://warband:drill_only@127.0.0.1:55434/warband_drill_test',
});
primary.on('error', () => {});
restored.on('error', () => {});
const backrest = (...args: string[]) =>
  docker(
    'exec',
    '-T',
    '--user',
    'postgres',
    'postgres',
    'pgbackrest',
    '--stanza=warband',
    '--pg1-user=warband',
    ...args,
  );
async function ready(pool: pg.Pool) {
  for (let i = 0; i < 120; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch {}
    await delay(500);
  }
  throw new Error('Database did not become ready');
}
await docker('up', '-d', 'postgres', 'redis');
await ready(primary);
try {
  await primary.query(
    'CREATE TABLE IF NOT EXISTS recovery_probe(id int PRIMARY KEY,label text NOT NULL)',
  );
  await primary.query('TRUNCATE recovery_probe');
  await primary.query("INSERT INTO recovery_probe VALUES(1,'base backup')");
  console.log('Creating an isolated base backup with WAL archiving.');
  await backrest('stanza-create');
  await backrest('--archive-timeout=300', '--type=full', 'backup');
  await primary.query("INSERT INTO recovery_probe VALUES(2,'must survive PITR')");
  const target = (await primary.query('SELECT clock_timestamp()::text AS at')).rows[0].at;
  await delay(1100);
  await primary.query("INSERT INTO recovery_probe VALUES(3,'must not survive PITR')");
  await primary.query('SELECT pg_switch_wal()');
  await backrest('check');
  await docker('--profile', 'restore', 'stop', 'restore');
  await docker(
    '--profile',
    'restore',
    'run',
    '--rm',
    '--no-deps',
    '--user',
    'postgres',
    'restore',
    'pgbackrest',
    '--stanza=warband',
    '--delta',
    '--type=time',
    '--target=' + target,
    '--target-action=promote',
    'restore',
  );
  await docker('--profile', 'restore', 'up', '-d', 'restore');
  await ready(restored);
  const pitr = (await restored.query('SELECT * FROM recovery_probe ORDER BY id')).rows;
  if (JSON.stringify(pitr.map((r) => r.id)) !== '[1,2]')
    throw new Error('PITR restored the wrong point: ' + JSON.stringify(pitr));
  console.log('PITR retained the committed pre-target records and excluded the later write.');
  await docker('--profile', 'restore', 'stop', 'restore');
  await docker(
    'exec',
    '-T',
    '--user',
    'postgres',
    'postgres',
    'sh',
    '-c',
    "printf '\nhost replication warband all scram-sha-256\n' >> /var/lib/postgresql/data/pg_hba.conf",
  );
  await primary.query('SELECT pg_reload_conf()');
  await docker(
    '--profile',
    'restore',
    'run',
    '--rm',
    '--no-deps',
    '--user',
    'postgres',
    'restore',
    'pgbackrest',
    '--stanza=warband',
    '--delta',
    '--type=standby',
    '--recovery-option=primary_conninfo=host=postgres user=warband password=drill_only application_name=warband_drill',
    'restore',
  );
  await docker('--profile', 'restore', 'up', '-d', 'restore');
  await ready(restored);
  let streaming = false;
  for (let i = 0; i < 120; i++) {
    if (
      (
        await primary.query(
          "SELECT 1 FROM pg_stat_replication WHERE application_name='warband_drill' AND state='streaming'",
        )
      ).rowCount
    ) {
      streaming = true;
      break;
    }
    await delay(500);
  }
  if (!streaming) throw new Error('Standby did not enter streaming replication');
  await primary.query("ALTER SYSTEM SET synchronous_standby_names='warband_drill'");
  await primary.query('SELECT pg_reload_conf()');
  await primary.query("SET synchronous_commit='remote_apply'");
  await primary.query("INSERT INTO recovery_probe VALUES(4,'synchronously replicated commit')");
  await docker('kill', '-s', 'SIGKILL', 'postgres');
  await docker(
    '--profile',
    'restore',
    'exec',
    '-T',
    '--user',
    'postgres',
    'restore',
    'pg_ctl',
    '-D',
    '/var/lib/postgresql/data',
    'promote',
  );
  for (let i = 0; i < 120; i++) {
    if (!(await restored.query('SELECT pg_is_in_recovery() AS recovering')).rows[0].recovering)
      break;
    await delay(250);
  }
  const failover = (await restored.query('SELECT * FROM recovery_probe ORDER BY id')).rows;
  if (!failover.some((r) => r.id === 4))
    throw new Error('Acknowledged commit was lost during failover');
  await mkdir('artifacts/chaos', { recursive: true });
  const result = {
    at: new Date().toISOString(),
    pitr: { target, records: pitr, passed: true },
    failover: { records: failover, passed: true, synchronousCommit: 'remote_apply' },
  };
  await writeFile('artifacts/chaos/recovery.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await docker('start', 'postgres');
  await ready(primary);
  await primary.query("ALTER SYSTEM SET synchronous_standby_names=''");
  await primary.query('SELECT pg_reload_conf()');
  await docker('--profile', 'restore', 'stop', 'restore');
  await primary.end();
  await restored.end();
}
