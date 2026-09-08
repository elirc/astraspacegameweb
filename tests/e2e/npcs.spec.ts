import { test, expect } from '@playwright/test';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

test('developer creates NPC residents, observes automatic building, edits pace and pauses play', async ({
  page,
}, info) => {
  const email = `npc-admin-${randomUUID()}@example.test`;
  const account = await page.request.post('/api/auth/register', {
    data: { email, password: 'NpcDeveloperTest2026!', name: 'NPC Dev ' + randomUUID().slice(0, 8) },
  });
  expect(account.ok()).toBe(true);
  const pool = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgres://warband:warband_local@127.0.0.1:55432/warband',
  });
  const player = (await account.json()).playerId;
  try {
    expect((await page.request.get('/api/admin/npcs')).status()).toBe(403);
    await pool.query('UPDATE users SET is_admin=true WHERE email=$1', [email]);
    await page.goto('/?page=admin');
    await expect(
      page.getByRole('heading', { name: 'World administration', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'npcs', exact: true }).click();
    await page
      .getByLabel('Reason for changes', { exact: true })
      .fill('Verify developer-controlled NPC population');
    await page.getByLabel('Accounts to create', { exact: true }).fill('2');
    await page.getByRole('combobox', { name: 'Play style', exact: true }).selectOption('builder');
    await page.getByLabel('Minimum action interval (seconds)', { exact: true }).fill('5');
    await page.getByLabel('Maximum action interval (seconds)', { exact: true }).fill('5');
    // A creation request can commit after its client deadline. Keep those actors
    // paused until this test has acknowledged and identified its own accounts.
    await page.getByLabel('Enable autonomous play', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Create NPC accounts', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Created 2 NPC accounts:' }),
    ).toBeVisible();
    const records = (
      await pool.query(
        'SELECT p.name,n.player_id FROM npc_players n JOIN players p ON p.id=n.player_id WHERE n.created_by=$1 ORDER BY n.player_id',
        [player],
      )
    ).rows;
    expect(records).toHaveLength(2);
    for (const record of records) expect(record.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    const card = page
      .locator('.npc-card')
      .filter({ has: page.getByRole('heading', { name: records[0].name, exact: true }) });
    await expect(card.locator('.npc-status')).toHaveText('Paused');
    await card.getByRole('button', { name: 'Resume NPC', exact: true }).click();
    await expect(card.locator('.npc-status')).toHaveText('Playing');
    await expect
      .poll(
        async () =>
          Number(
            (
              await pool.query(
                "SELECT count(*) AS n FROM audit_log WHERE actor=ANY($1::bigint[]) AND action='build'",
                [records.map((r) => r.player_id)],
              )
            ).rows[0].n,
          ),
        { timeout: 45000 },
      )
      .toBeGreaterThan(0);
    await card.getByRole('button', { name: 'Edit settings', exact: true }).click();
    await page.getByLabel('Minimum action interval (seconds)', { exact: true }).fill('60');
    await page.getByLabel('Maximum action interval (seconds)', { exact: true }).fill('180');
    await page.getByLabel('Automatically upgrade buildings', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Apply settings to selected (1)', exact: true }).click();
    await expect(card).toContainText('Building paused');
    await expect(card).toContainText('60–180s between turns');
    await expect(page.getByRole('combobox', { name: 'Development pace', exact: true })).toHaveValue(
      'custom',
    );
    await card.getByRole('button', { name: 'Pause NPC', exact: true }).click();
    await expect(card.locator('.npc-status')).toHaveText('Paused');
    await card.getByRole('button', { name: 'Resume NPC', exact: true }).click();
    await expect(card.locator('.npc-status')).toHaveText('Playing');
    await page.getByRole('button', { name: 'Pause all NPCs', exact: true }).click();
    await expect(card.locator('.npc-status')).toHaveText('Paused');
    const frozen = (
      await pool.query('SELECT turn FROM npc_players WHERE player_id=$1', [records[0].player_id])
    ).rows[0].turn;
    await page.waitForTimeout(1500);
    expect(
      (await pool.query('SELECT turn FROM npc_players WHERE player_id=$1', [records[0].player_id]))
        .rows[0].turn,
    ).toBe(frozen);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `artifacts/${info.project.name}-npc-admin.png`, fullPage: true });
    await pool.query('UPDATE users SET is_admin=false WHERE email=$1', [email]);
    expect(
      (
        await page.request.post('/api/admin/npcs/pause', {
          headers: { 'Idempotency-Key': randomUUID() },
          data: { reason: 'A demoted account cannot control NPCs' },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await pool.query('UPDATE npc_players SET enabled=false WHERE created_by=$1', [player]);
    await pool.query('UPDATE users SET is_admin=false WHERE email=$1', [email]);
    await pool.end();
  }
});
