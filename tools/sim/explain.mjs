import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
const pool = new pg.Pool({
  connectionString: 'postgres://warband:drill_only@127.0.0.1:55433/warband_load_test',
});
const sql = readFileSync('packages/db/causality.ts', 'utf8').match(
  /const sql\s*=\s*`([\s\S]*?)`;/,
)[1];
const first = (
  await pool.query(
    "SELECT village_id,due_at FROM scheduled_events WHERE status='pending' ORDER BY due_at,id LIMIT 300",
  )
).rows;
if (!first.length) {
  await pool.end();
  throw new Error('No pending fixture events to explain');
}
await pool.query("SET statement_timeout='5s';SET jit=off");
const result = await pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + sql, [
  first.map((e) => e.village_id),
  first.at(-1).due_at,
  null,
]);
writeFileSync('artifacts/load/explain.json', JSON.stringify(result.rows, null, 2));
console.log(JSON.stringify(result.rows[0]['QUERY PLAN'][0].Plan['Total Cost']));
await pool.end();
