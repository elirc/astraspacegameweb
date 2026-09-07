export {};
try {
  process.loadEnvFile();
} catch {}
const { pool, initialize } = await import('../packages/db');
await initialize();
const [action, email] = process.argv.slice(2);
if (!action || !['grant', 'revoke'].includes(action) || !email)
  throw new Error('Usage: npm run admin -- grant|revoke exact-email');
const row = await pool.query(
  'UPDATE users SET is_admin=$1 WHERE email=$2 RETURNING id,email,is_admin',
  [action === 'grant', email.toLowerCase()],
);
if (!row.rowCount) throw new Error('Account does not exist. Register it in the game first.');
console.log(row.rows[0]);
await pool.end();
