export {};
try {
  process.loadEnvFile();
} catch {}
const { initialize, pool } = await import('../packages/db');
await initialize();
console.log((await pool.query('SELECT name,applied_at FROM schema_migrations ORDER BY name')).rows);
await pool.end();
