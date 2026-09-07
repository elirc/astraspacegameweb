import { test, expect } from '@playwright/test';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
test('administrator can preview rules and replay a completed event without changing the world', async ({
  page,
}) => {
  const suffix = Date.now().toString(36),
    email = `admin-ui-${suffix}@example.test`;
  const registered = await page.request.post('/api/auth/register', {
    data: { email, password: 'AdminTestCampaign2026!', name: 'Admin QA ' + suffix },
  });
  expect(registered.ok()).toBe(true);
  const pool = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgres://warband:warband_local@127.0.0.1:55432/warband',
  });
  try {
    await pool.query('UPDATE users SET is_admin=true WHERE email=$1', [email]);
    const state = await (await page.request.get('/api/state')).json(),
      village = state.villages[0];
    const trained = await page.request.post(`/api/villages/${village.id}/command`, {
      headers: { 'Idempotency-Key': randomUUID() },
      data: { action: 'recruit', unit: 'spear', count: 1 },
    });
    expect(trained.ok()).toBe(true);
    await page.goto('/?page=admin');
    await expect(page.getByRole('heading', { name: 'World administration' })).toBeVisible();
    await page
      .getByLabel('Reason for changes', { exact: true })
      .fill('Verify an administrator preview');
    await page.getByRole('button', { name: 'Validate configuration', exact: true }).click();
    await expect(page.locator('.admin-result')).toContainText('"valid": true');
    expect((await (await page.request.get('/api/admin/config')).json()).config.version).toBe(
      state.config.version,
    );
    await page.getByRole('button', { name: 'events', exact: true }).click();
    await page.getByLabel('Village ID', { exact: true }).fill(String(village.id));
    await expect(
      page.getByRole('button', { name: 'Replay event', exact: true }).first(),
    ).toBeEnabled({ timeout: 30000 });
    await page.getByRole('button', { name: 'Replay event', exact: true }).first().click();
    await expect(
      page.getByRole('heading', { name: 'Replay matches the recorded result' }),
    ).toBeVisible();
    const due = (
      await pool.query(
        'SELECT due_at FROM scheduled_events WHERE village_id=$1 AND status=$2 ORDER BY due_at,id LIMIT 1',
        [village.id, 'done'],
      )
    ).rows[0].due_at as Date;
    await page
      .getByLabel('From (UTC)', { exact: true })
      .fill(new Date(due.getTime() - 60000).toISOString().slice(0, 16));
    await page
      .getByLabel('To (UTC, exclusive)', { exact: true })
      .fill(new Date(due.getTime() + 120000).toISOString().slice(0, 16));
    await page.getByRole('button', { name: 'Replay time range', exact: true }).click();
    await expect(page.locator('.admin-result')).toContainText('"matches": true');
    await expect(page.locator('.admin-result')).toContainText('"verified": 1');
  } finally {
    await pool.query('UPDATE users SET is_admin=false WHERE email=$1', [email]);
    await pool.end();
  }
});
