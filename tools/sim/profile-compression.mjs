import pg from 'pg';
import {writeFileSync} from 'node:fs';
const pool=new pg.Pool({connectionString:'postgres://warband:drill_only@127.0.0.1:55433/warband_load_test'});
const tx=await pool.connect();
try {
 await tx.query('BEGIN;SET LOCAL jit=off;CREATE TEMP TABLE compression_probe (LIKE event_journal INCLUDING ALL) ON COMMIT DROP');
 const rows=(await tx.query('SELECT event_id,village_id,before_state,after_state,before_owner,after_owner,context FROM event_journal ORDER BY event_id LIMIT 2000')).rows;
 const data=JSON.stringify(rows),results=[];
 for(let repeat=0;repeat<3;repeat++)for(const method of ['pglz','lz4']){
  await tx.query(`TRUNCATE compression_probe;ALTER TABLE compression_probe ALTER COLUMN context SET COMPRESSION ${method};ALTER TABLE compression_probe ALTER COLUMN before_state SET COMPRESSION ${method};ALTER TABLE compression_probe ALTER COLUMN after_state SET COMPRESSION ${method}`);
  const start=performance.now();
  await tx.query('INSERT INTO compression_probe(event_id,village_id,before_state,after_state,before_owner,after_owner,context) SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(event_id bigint,village_id bigint,before_state jsonb,after_state jsonb,before_owner bigint,after_owner bigint,context jsonb)',[data]);
  results.push({method,repeat,rows:rows.length,ms:performance.now()-start,bytes:Number((await tx.query("SELECT pg_total_relation_size('compression_probe') AS n")).rows[0].n)});
 }
 console.log(results);writeFileSync('artifacts/load/compression-probe.json',JSON.stringify(results,null,2));
}finally{await tx.query('ROLLBACK');tx.release();await pool.end()}
