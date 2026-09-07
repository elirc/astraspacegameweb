import pg from 'pg';
import { writeFileSync } from 'node:fs';
const pool = new pg.Pool({
  connectionString: 'postgres://warband:drill_only@127.0.0.1:55433/warband_load_test',
});
const tx = await pool.connect();
try {
  await tx.query('BEGIN;SET LOCAL jit=off');
  await tx.query(
    'CREATE TEMP TABLE profile_journal (LIKE event_journal INCLUDING ALL) ON COMMIT DROP',
  );
  const rows = (
    await tx.query(
      'SELECT event_id,village_id,before_state,after_state,before_owner,after_owner,context FROM event_journal ORDER BY event_id LIMIT 1000',
    )
  ).rows;
  const cols = Object.keys(rows[0]);
  const types = ['bigint', 'bigint', 'jsonb', 'jsonb', 'bigint', 'bigint', 'jsonb'];
  const out = [];
  for (let repeat = 0; repeat < 3; repeat++)
    for (const variant of ['jsonb', 'json', 'arrays']) {
      await tx.query('TRUNCATE profile_journal');
      const start = performance.now();
      const args =
        variant === 'arrays'
          ? cols.map((c) =>
              rows.map((r) =>
                typeof r[c] === 'object' && r[c] !== null ? JSON.stringify(r[c]) : r[c],
              ),
            )
          : [JSON.stringify(rows)];
      const from =
        variant === 'arrays'
          ? 'unnest(' + types.map((t, i) => '$' + (i + 1) + '::' + t + '[]').join(',') + ')'
          : 'json' +
            (variant === 'jsonb' ? 'b' : '') +
            '_to_recordset($1::' +
            variant +
            ') AS x(' +
            cols.map((c, i) => c + ' ' + types[i]).join(',') +
            ')';
      await tx.query(
        'INSERT INTO profile_journal(' + cols.join(',') + ') SELECT * FROM ' + from,
        args,
      );
      out.push({ repeat, variant, ms: performance.now() - start });
    }
  writeFileSync('artifacts/load/bulk-write-profile.json', JSON.stringify(out, null, 2));
  console.log(out);
} finally {
  await tx.query('ROLLBACK');
  tx.release();
  await pool.end();
}
