import pg, { type PoolClient } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import {
  defaultConfig,
  freshVillage,
  points,
  seededRandom,
  worldSchema,
  type WorldConfig,
} from '../shared/game';
pg.types.setTypeParser(20, (v) => Number(v));
export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://warband:warband_local@127.0.0.1:55432/warband',
  max: 16,
});
pool.on('error', (error) => console.error('Idle database connection lost:', error.message));
export type Tx = PoolClient;
const transactionContext = new AsyncLocalStorage<Tx>();
const committed = new WeakMap<Tx, (() => void)[]>();
const transactionTokens = new WeakMap<Tx, symbol>();
export function transactionToken(tx: Tx) {
  return transactionTokens.get(tx);
}
export function afterCommit(tx: Tx, fn: () => void) {
  const callbacks = committed.get(tx) || [];
  callbacks.push(fn);
  committed.set(tx, callbacks);
}
export const dbCounters = { retries: 0, exhausted: 0 };
export const orm = () => drizzle(transactionContext.getStore() || pool, { schema });
export const database = {
  query: ((...args: any[]) =>
    (transactionContext.getStore() || pool).query(...(args as [any]))) as typeof pool.query,
};
import type { Village } from '../shared/village';
export type { Village } from '../shared/village';
export async function transaction<T>(fn: (tx: Tx) => Promise<T>, maxAttempts = 5): Promise<T> {
  const current = transactionContext.getStore();
  if (current) return fn(current);
  for (let attempt = 0; ; attempt++) {
    const tx = await pool.connect();
    // A checked-out client can disconnect while application code awaits non-SQL
    // work. Keep that driver event from crashing the process; never commit it.
    let connectionError: Error | undefined;
    const onConnectionError = (error: Error) => {
      connectionError = error;
    };
    tx.on('error', onConnectionError);
    transactionTokens.set(tx, Symbol());
    try {
      await tx.query(
        "BEGIN; SET LOCAL lock_timeout = '5s'; SET LOCAL jit = off; SET LOCAL max_parallel_workers_per_gather = 0",
      );
      const result = await transactionContext.run(tx, () => fn(tx));
      if (connectionError) throw connectionError;
      await tx.query('COMMIT');
      for (const callback of committed.get(tx) || [])
        try {
          callback();
        } catch (error) {
          console.error('Post-commit observer failed', error);
        }
      committed.delete(tx);
      transactionTokens.delete(tx);
      return result;
    } catch (e: any) {
      // A lost connection cannot roll back again; preserve the original failure.
      await tx.query('ROLLBACK').catch(() => {});
      if (['40001', '40P01', '55P03', 'WB_BUSY'].includes(e.code) && attempt < maxAttempts - 1) {
        dbCounters.retries++;
        await new Promise((r) => setTimeout(r, 15 + Math.random() * 40));
        continue;
      }
      if (['40001', '40P01', '55P03'].includes(e.code) || (e.code === 'WB_BUSY' && maxAttempts > 1))
        dbCounters.exhausted++;
      throw e;
    } finally {
      committed.delete(tx);
      transactionTokens.delete(tx);
      tx.off('error', onConnectionError);
      tx.release();
    }
  }
}
// Exclusive gate is reserved for migrations, admin changes and serial reference tests.
// Normal simulation uses shared world access and ordered causal component locks.
export async function worldLock(tx: Tx, wait = true) {
  const result = await tx.query(
    wait
      ? 'SELECT pg_advisory_xact_lock(7139,1)'
      : 'SELECT pg_try_advisory_xact_lock(7139,1) AS acquired',
  );
  return wait || result.rows[0].acquired;
}
export async function withVillageLock(tx: Tx, id: number) {
  await tx.query('SELECT pg_advisory_xact_lock(1,$1)', [id]);
  const result = await tx.query<Village>('SELECT * FROM villages WHERE id=$1 FOR UPDATE', [id]);
  if (!result.rows[0]) throw Object.assign(new Error('Village not found'), { statusCode: 404 });
  return result.rows[0];
}
export async function withVillageLocks(tx: Tx, ids: number[]) {
  if (!ids.length) return [];
  return (
    await tx.query<Village>(
      'SELECT v.*,pg_advisory_xact_lock(1,v.id::int) FROM villages v WHERE v.id=ANY($1::bigint[]) ORDER BY v.id FOR UPDATE',
      [ids],
    )
  ).rows;
}
export async function saveVillage(tx: Tx, v: Village, checkpoint = true) {
  await tx.query(
    `WITH saved AS (UPDATE villages SET state=$2,player_id=$3,name=$4,points=$5 WHERE id=$1 RETURNING *)
     INSERT INTO village_snapshots(village_id,event_id,at,state,player_id,name,config)
     SELECT v.id,(SELECT e.id FROM scheduled_events e JOIN event_journal j ON j.event_id=e.id WHERE e.village_id=v.id ORDER BY e.due_at DESC,e.id DESC LIMIT 1),
       to_timestamp((v.state->>'updatedAt')::double precision/1000),v.state,v.player_id,v.name,w.config
     FROM saved v JOIN worlds w ON w.id=v.world_id WHERE $6`,
    [v.id, JSON.stringify(v.state), v.player_id, v.name, points(v.state.buildings), checkpoint],
  );
}
export async function config(tx: Tx): Promise<WorldConfig> {
  return worldSchema.parse((await tx.query('SELECT config FROM worlds WHERE id=1')).rows[0].config);
}
export async function dbNow(tx: Tx) {
  return Number(
    (await tx.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms'))
      .rows[0].ms,
  );
}
export async function initialize() {
  await transaction(async (tx) => {
    await worldLock(tx);
    await tx.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const name of (await readdir(new URL('./migrations/', import.meta.url)))
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      const sql = await readFile(new URL('./migrations/' + name, import.meta.url), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prior = (await tx.query('SELECT checksum FROM schema_migrations WHERE name=$1', [name]))
        .rows[0];
      if (prior) {
        if (prior.checksum !== checksum) throw new Error('Applied migration was modified: ' + name);
        continue;
      }
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [
        name,
        checksum,
      ]);
    }
    if ((await tx.query('SELECT id FROM worlds WHERE id=1')).rowCount) return;
    const speed = Number(process.env.WORLD_SPEED || 180);
    const cfg = worldSchema.parse({ ...defaultConfig, speed, unitSpeed: speed });
    await tx.query('INSERT INTO worlds(id,name,config) VALUES(1,$1,$2)', [
      cfg.name,
      JSON.stringify(cfg),
    ]);
    await tx.query('INSERT INTO config_versions(world_id,version,config) VALUES(1,$1,$2)', [
      cfg.version,
      JSON.stringify(cfg),
    ]);
    const now = await dbNow(tx),
      rng = seededRandom(42);
    const names = [
      'Aldric the Bold',
      'Lady Rowan',
      'Oswin Blackthorn',
      'The Green Knight',
      'Elara of Ashford',
      'Lord Fenwick',
    ];
    await tx.query(
      "INSERT INTO tribes(world_id,name,tag,description) VALUES(1,'The Iron Covenant','IRON','United by honor. Bound by iron. A home for the builders, defenders and conquerors of the Crownlands.'),(1,'Wardens of the North','NORTH','Keepers of the old forests and guardians of the northern frontier.'),(1,'The Golden Company','GOLD','Fortune favors those who stand together.')",
    );
    for (let i = 0; i < names.length; i++)
      await tx.query('INSERT INTO players(world_id,name,tribe_id) VALUES(1,$1,$2)', [
        names[i],
        (i % 3) + 1,
      ]);
    const used = new Set<string>(['500,500']);
    for (let i = 0; i < 180; i++) {
      let x: number, y: number;
      do {
        x = 480 + Math.floor(rng() * 41);
        y = 480 + Math.floor(rng() * 41);
      } while (used.has(`${x},${y}`));
      used.add(`${x},${y}`);
      const owner = i < 30 ? (i % 6) + 1 : null;
      const state = freshVillage(now);
      state.units = {
        spear: owner ? 15 + Math.floor(rng() * 50) : Math.floor(rng() * 8),
        sword: owner ? 20 : 0,
        scout: owner ? 3 : 0,
      };
      state.buildings.wall = owner ? 2 : 0;
      state.resources = { wood: 800, clay: 700, iron: 600 };
      await tx.query(
        'INSERT INTO villages(world_id,player_id,x,y,name,state,points) VALUES(1,$1,$2,$3,$4,$5,$6)',
        [
          owner,
          x,
          y,
          owner
            ? ['Ravenwatch', 'Oakridge', 'Winterhold', 'Ashford', 'Stonehaven', 'Highgarden'][
                i % 6
              ] + (i >= 6 ? ' ' + (Math.floor(i / 6) + 1) : '')
            : 'Abandoned village',
          JSON.stringify(state),
          points(state.buildings),
        ],
      );
    }
    await tx.query(
      "INSERT INTO villages(world_id,x,y,name,state,points) VALUES(1,501,500,'Mossfield', $1,100)",
      [
        JSON.stringify({
          ...freshVillage(now),
          units: { spear: 3 },
          buildings: { ...freshVillage(now).buildings, wall: 0 },
        }),
      ],
    );
  });
}
