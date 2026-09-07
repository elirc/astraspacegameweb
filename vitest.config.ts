import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 240000,
    // Fresh-container migration and cold Fastify compilation are setup, not request latency.
    hookTimeout: 180000,
    fileParallelism: false,
  },
});
