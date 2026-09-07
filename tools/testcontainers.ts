import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { spawn } from 'node:child_process';
import { GenericContainer } from 'testcontainers';
console.log('Starting an isolated PostgreSQL 16 Testcontainer...');
const postgres = await new PostgreSqlContainer('postgres:16-alpine')
  .withDatabase('warband_test')
  .withUsername('warband')
  .withPassword('isolated_test_only')
  .start();
const redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
try {
  const url = postgres.getConnectionUri();
  const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run'], {
    windowsHide: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
      TEST_REDIS: '1',
      TEST_DATABASE_URL: url,
      API_TEST_DATABASE_URL: url.replace(/\/[^/]+$/, '/warband_api_test'),
      NODE_ENV: 'test',
    },
  });
  process.exitCode = await new Promise<number>((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
} finally {
  await redis.stop();
  await postgres.stop();
}
