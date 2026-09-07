import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
const pool = new pg.Pool({
  connectionString: 'postgres://warband:drill_only@127.0.0.1:55433/warband_load_test',
});
try {
  await pool.query('SET jit=off;SET max_parallel_workers_per_gather=0');
  const v = (
    await pool.query(
      'SELECT id,player_id FROM villages WHERE player_id IS NOT NULL ORDER BY id DESC LIMIT 1',
    )
  ).rows[0];
  const sql = readFileSync('packages/db/causality.ts', 'utf8').match(/`(WITH owners[\s\S]*?)`/)[1];
  const result = await pool.query('EXPLAIN (ANALYZE,BUFFERS) ' + sql, [
    [v.id],
    v.player_id,
    new Date(),
  ]);
  const out = result.rows.map((r) => r['QUERY PLAN']).join('\n');
  writeFileSync('artifacts/load/command-query-plan.txt', out);
  console.log(out);
} finally {
  await pool.end();
}
