import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { exportTimeline, replayTimeline } from '../../apps/server/src/application/replay';
try {
  process.loadEnvFile();
} catch {}
const { values } = parseArgs({
  options: {
    village: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    out: { type: 'string' },
  },
});
if (!values.village || !values.from || !values.to)
  throw new Error(
    'Usage: pnpm replay --village 123 --from 2026-09-01T00:00:00Z --to 2026-09-02T00:00:00Z [--out artifacts/replay.json]',
  );
const sourceUrl =
  process.env.DATABASE_URL || 'postgres://warband:warband_local@127.0.0.1:55432/warband';
const source = new pg.Pool({ connectionString: sourceUrl });
const adminUrl = new URL(process.env.REPLAY_ADMIN_DATABASE_URL || sourceUrl);
adminUrl.pathname = '/postgres';
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const name = 'warband_replay_' + randomBytes(8).toString('hex');
let scratch: pg.Pool | undefined,
  created = false;
try {
  const bundle = await exportTimeline(source, {
    villageId: Number(values.village),
    from: Date.parse(values.from),
    to: Date.parse(values.to),
  });
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  const scratchUrl = new URL(adminUrl);
  scratchUrl.pathname = '/' + name;
  scratch = new pg.Pool({ connectionString: scratchUrl.toString() });
  const result = await replayTimeline(bundle, scratch);
  const out = values.out || `artifacts/replay-${values.village}.json`;
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      matches: result.matches,
      verified: result.verified,
      events: result.events,
      missing: result.missing,
      output: out,
    }),
  );
  if (!result.matches) process.exitCode = 1;
} finally {
  await scratch?.end();
  if (created) await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
  await source.end();
}
