import { spawn } from 'node:child_process';
const proxy = spawn(process.execPath, ['tools/sim/browser-proxy.mjs'], {
  stdio: ['ignore', 'pipe', 'inherit'],
});
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Browser loopback proxy did not start')),
      15000,
    );
    proxy.stdout.on('data', (data) => {
      if (String(data).includes('ready')) {
        clearTimeout(timer);
        resolve();
      }
    });
    proxy.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    proxy.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('Browser proxy exited: ' + code));
    });
  });
  const child = spawn(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      'tests/e2e/production.spec.ts',
      '--project=mobile-webkit',
      '--output=artifacts/linux-webkit-results',
      '--reporter=list',
    ],
    { stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:3001' } },
  );
  process.exitCode = await new Promise((resolve) => {
    child.once('exit', (code) => resolve(code ?? 1));
    child.once('error', () => resolve(1));
  });
} finally {
  proxy.kill('SIGTERM');
  const timer = setTimeout(() => proxy.kill('SIGKILL'), 2000);
  timer.unref();
}
