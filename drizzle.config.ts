import { defineConfig } from 'drizzle-kit';
try {
  process.loadEnvFile();
} catch {}
export default defineConfig({
  schema: './packages/db/schema.ts',
  out: './packages/db/generated',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://warband:warband_local@127.0.0.1:55432/warband',
  },
  strict: true,
  verbose: true,
});
