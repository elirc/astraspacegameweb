// Training load injector: seeds an isolated *_test world and schedules battle
// arrivals at a fixed rate, so resolver roles you start yourself have real work
// and Prometheus/Grafana have something to show. Adapted from tools/sim/load.ts,
// minus the certification logic and minus the spawned workers (you run the roles).
//
//   DATABASE_URL=postgres://warband:warband_local@127.0.0.1:55432/warband_ops_test \
//   INJECT_RATE=300 INJECT_SECONDS=120 INJECT_SEED=1 npx tsx training/ops/inject.ts
//
// INJECT_SEED=1 truncates and reseeds the world (only allowed on a *_test database).
import pg from 'pg';
import { defaultConfig, freshVillage, points } from '../../packages/shared/game';

const url =
  process.env.DATABASE_URL || 'postgres://warband:warband_local@127.0.0.1:55432/warband_ops_test';
const name = new URL(url).pathname.slice(1);
if (!/^[a-z_]+_test$/.test(name)) throw new Error('Refusing: use a dedicated *_test database');
const rate = Number(process.env.INJECT_RATE || 300),
  seconds = Number(process.env.INJECT_SECONDS || 120),
  villageCount = Number(process.env.INJECT_VILLAGES || 20000);

const admin = new pg.Pool({ connectionString: url.replace(/\/[^/]+$/, '/postgres') });
if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
  await admin.query(`CREATE DATABASE "${name}"`);
await admin.end();
process.env.DATABASE_URL = url;
const db = await import('../../packages/db');
await db.initialize();

if (process.env.INJECT_SEED === '1') {
  console.log(`Seeding ${villageCount} villages...`);
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
    "INSERT INTO players(id,world_id,name) SELECT i,1,'Ops player '||i FROM generate_series(1,2000) i",
  );
  const state = freshVillage(Date.now());
  state.units = { spear: 5 };
  state.buildings.wall = 0;
  state.reservedPopulation = 1000000;
  await db.pool.query(
    "INSERT INTO villages(id,world_id,player_id,x,y,name,state,points) SELECT i,1,((i-1)%2000)+1,i%1000,floor(i/1000.0),'Ops village '||i,$1::jsonb,$2 FROM generate_series(1,$3::int) i",
    [JSON.stringify(state), points(state.buildings), villageCount],
  );
  await db.pool.query(
    "SELECT setval('players_id_seq',(SELECT max(id) FROM players)),setval('villages_id_seq',(SELECT max(id) FROM villages))",
  );
  await db.pool.query('ANALYZE villages; ANALYZE player_scores; ANALYZE scheduled_events');
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const start = Date.now() + 1000;
console.log(`Injecting ${rate} arrivals/s for ${seconds}s into ${name}`);
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
        originName: 'Ops origin',
        targetName: 'Ops target',
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
  if (second % 10 === 0) {
    const { pending, oldest } = (
      await db.pool.query(
        "SELECT count(*) FILTER (WHERE due_at<=now())::int AS pending, coalesce(extract(epoch FROM now()-min(due_at)),0)::float AS oldest FROM scheduled_events WHERE status='pending'",
      )
    ).rows[0];
    console.log(JSON.stringify({ second, injected: (second + 1) * rate, duePending: pending, oldestSeconds: Math.max(0, oldest) }));
  }
  await delay(Math.max(0, start + (second + 1) * 1000 - Date.now()));
}
await db.pool.end();
