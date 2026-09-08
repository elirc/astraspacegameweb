import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import pg from 'pg';

test.use({ serviceWorkers: 'block' });

test('configuration editing waits for a complete load and recovers without losing the draft', async ({
  page,
  context,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `admin-ready-${suffix}@example.test`;
  const registered = await page.request.post('/api/auth/register', {
    data: {
      email,
      password: 'AdminReadiness2026!',
      name: `Admin readiness ${suffix}`,
    },
  });
  expect(registered.ok()).toBe(true);
  const pool = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgres://warband:warband_local@127.0.0.1:55432/warband',
  });
  let releaseInitial!: () => void;
  let releaseRetry!: () => void;
  const initialGate = new Promise<void>((resolve) => {
    releaseInitial = resolve;
  });
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  let holdInitial = true;
  let failLoads = true;
  let configReads = 0;
  const submissions: { config: unknown; dryRun: boolean; reason: string }[] = [];
  let backgroundReads = 0;
  try {
    await pool.query('UPDATE users SET is_admin=true WHERE email=$1', [email]);
    const response = await page.request.get('/api/admin/config');
    expect(response.ok()).toBe(true);
    const current = await response.json();
    const expectedConfig = { ...current.config, version: current.config.version + 1 };
    await context.route('**/api/admin/config', async (route) => {
      if (route.request().method() === 'POST') {
        submissions.push(route.request().postDataJSON());
        await route.continue();
        return;
      }
      configReads++;
      if (holdInitial) await initialGate;
      if (failLoads) {
        await route.fulfill({
          status: 503,
          json: { error: 'Configuration temporarily unavailable' },
        });
        return;
      }
      await retryGate;
      await route.fulfill({ json: current });
      if (submissions.length) backgroundReads++;
    });

    await page.goto('/?page=admin');
    await expect(page.getByRole('heading', { name: 'World administration' })).toBeVisible();
    const admin = page.locator('.admin-panel');
    const editor = admin.getByRole('textbox', { name: 'World configuration JSON', exact: true });
    const validate = page.getByRole('button', { name: 'Validate configuration', exact: true });
    const apply = page.getByRole('button', { name: 'Apply validated configuration', exact: true });
    const reason = page.getByLabel('Reason for changes', { exact: true });
    await reason.fill('Verify loading and retry before validation');
    await expect.poll(() => configReads).toBeGreaterThan(0);
    await expect(admin.getByRole('status')).toHaveText('Loading world configuration…');
    await expect(editor).toBeDisabled();
    await expect(editor).toHaveValue('');
    await expect(validate).toBeDisabled();
    await expect(apply).toBeDisabled();
    expect(submissions).toHaveLength(0);

    holdInitial = false;
    releaseInitial();
    await expect(admin.getByRole('alert')).toContainText(
      'Could not load world configuration. Try again.',
    );
    await expect(editor).toBeDisabled();
    await expect(validate).toBeDisabled();
    await expect(apply).toBeDisabled();
    failLoads = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(admin.getByRole('status')).toHaveText('Loading world configuration…');
    await expect(editor).toBeDisabled();
    await expect(validate).toBeDisabled();
    expect(submissions).toHaveLength(0);

    releaseRetry();
    await expect(editor).toBeEnabled();
    await expect(editor).toHaveValue(JSON.stringify(expectedConfig, null, 2));
    await expect(reason).toHaveValue('Verify loading and retry before validation');
    const draft = JSON.stringify(expectedConfig, null, 2) + '\n';
    await editor.fill(draft);
    const [validated] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().endsWith('/api/admin/config') && res.request().method() === 'POST',
      ),
      validate.click(),
    ]);
    expect(validated.ok()).toBe(true);
    expect(submissions).toEqual([
      {
        config: expectedConfig,
        dryRun: true,
        reason: 'Verify loading and retry before validation',
      },
    ]);
    await expect(page.locator('.admin-result')).toContainText('"valid": true');
    await expect.poll(() => backgroundReads).toBeGreaterThan(0);
    await expect(editor).toHaveValue(draft);
    await expect(apply).toBeEnabled();
    await editor.fill('');
    await expect(editor).toHaveValue('');
    await expect(apply).toBeDisabled();
    expect((await (await page.request.get('/api/admin/config')).json()).config.version).toBe(
      current.config.version,
    );
  } finally {
    releaseInitial();
    releaseRetry();
    await context.unrouteAll({ behavior: 'wait' });
    await pool.query('UPDATE users SET is_admin=false WHERE email=$1', [email]);
    await pool.end();
  }
});
