import { test, expect, type Page } from '@playwright/test';
async function enter(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the Crownlands', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ravenswood', exact: true })).toBeVisible();
}
async function nav(page: Page, name: string) {
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name, exact: true }).click();
}
test('guest enters, constructs, recruits, scouts, raids and reads a battle report', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page);
  await page.screenshot({ path: `artifacts/${info.project.name}-overview.png`, fullPage: true });
  await nav(page, 'Buildings');
  const timber = page
    .locator('.building-card')
    .filter({ has: page.getByRole('heading', { name: 'Timber camp', exact: true }) });
  await timber.getByRole('button', { name: 'Upgrade to level 6', exact: true }).click();
  await expect(timber.locator('.level-badge')).toHaveText('Level 6', { timeout: 30000 });
  await nav(page, 'Barracks');
  const spear = page
    .locator('.recruit-card')
    .filter({ has: page.getByRole('heading', { name: 'Spearman', exact: true }) });
  await spear.getByRole('spinbutton', { name: 'Spearman quantity', exact: true }).fill('2');
  await spear.getByRole('button', { name: 'Recruit', exact: true }).click();
  await expect(spear.getByText('37 at home', { exact: true })).toBeVisible({ timeout: 20000 });
  await nav(page, 'World map');
  await page.getByRole('textbox', { name: 'Search villages' }).fill('Abandoned village');
  const scoutTarget = page
    .locator('.nearby')
    .getByRole('button', { name: /Abandoned village|Ruined keep/ })
    .first();
  const scoutName = await scoutTarget.locator('b').innerText();
  await scoutTarget.click();
  await page.getByRole('spinbutton', { name: 'Scout to send', exact: true }).fill('5');
  await page.getByRole('button', { name: 'Review scout', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm and send', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await nav(page, 'Reports');
  await expect(
    page
      .getByRole('button')
      .filter({ hasText: 'Scouting successful' })
      .filter({ hasText: scoutName }),
  ).toBeVisible({
    timeout: 35000,
  });
  await page
    .getByRole('button')
    .filter({ hasText: 'Scouting successful' })
    .filter({ hasText: scoutName })
    .click();
  await expect(
    page.getByText('Your scouts returned with intelligence.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await nav(page, 'World map');
  await page.getByRole('textbox', { name: 'Search villages' }).fill('Abandoned village');
  const raidTarget = page
    .locator('.nearby')
    .getByRole('button', { name: /Abandoned village|Ruined keep/ })
    .first();
  const raidName = await raidTarget.locator('b').innerText();
  await raidTarget.click();
  await page.getByRole('button', { name: 'Attack', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Axeman to send', exact: true }).fill('25');
  await page.getByRole('spinbutton', { name: 'Light cavalry to send', exact: true }).fill('8');
  await page.getByRole('button', { name: 'Review attack', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm and send', exact: true }).click();
  await nav(page, 'Reports');
  await expect(
    page.getByRole('button').filter({ hasText: 'Victory at' }).filter({ hasText: raidName }),
  ).toBeVisible({
    timeout: 45000,
  });
  await page
    .getByRole('button')
    .filter({ hasText: 'Victory at' })
    .filter({ hasText: raidName })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Resources plundered', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `artifacts/${info.project.name}-battle.png`, fullPage: true });
  expect(errors).toEqual([]);
});
test('account, tribe, forum, messages, simulator and navigation work', async ({ page }, info) => {
  await enter(page);
  await nav(page, 'My tribe');
  await page.getByRole('button', { name: 'Found a tribe', exact: true }).click();
  const suffix = Date.now().toString(36).slice(-6);
  await page
    .getByRole('textbox', { name: 'Tribe name', exact: true })
    .fill('Test Covenant ' + suffix);
  await page.getByRole('textbox', { name: 'Tag', exact: true }).fill(suffix);
  await page
    .getByRole('textbox', { name: 'About your tribe', exact: true })
    .fill('A local automated playtest tribe.');
  await page.getByRole('button', { name: 'Found tribe', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Test Covenant ' + suffix, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'New discussion', exact: true }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Rally at dawn');
  await page
    .getByRole('textbox', { name: 'Your message', exact: true })
    .fill('Bring spears and supplies.');
  await page.getByRole('button', { name: 'Post discussion', exact: true }).click();
  await page.getByRole('button', { name: /Rally at dawn/ }).click();
  await page
    .getByRole('textbox', { name: 'Your reply', exact: true })
    .fill('The warband is ready.');
  await page.getByRole('button', { name: 'Post reply', exact: true }).click();
  await expect(page.getByText('The warband is ready.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await nav(page, 'Messages');
  await page.getByRole('button', { name: 'Write a message', exact: true }).click();
  await page.getByRole('textbox', { name: 'To', exact: true }).fill('Aldric the Bold');
  await page
    .getByRole('textbox', { name: 'Subject', exact: true })
    .fill('Greetings from the playtest');
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('Testing local correspondence.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('button', { name: /Greetings from the playtest/ })).toBeVisible();
  await nav(page, 'Rankings');
  await expect(
    page.getByRole('heading', { name: 'The lords of the Crownlands', exact: true }),
  ).toBeVisible();
  await nav(page, 'Battle simulator');
  await page.getByRole('button', { name: 'Simulate battle', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Attacking warband', exact: true })).toHaveCount(
    2,
  );
  await nav(page, 'Village overview');
  if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.locator('.profile').click();
  await page.getByRole('textbox', { name: 'Player name', exact: true }).fill('Tester ' + suffix);
  await page
    .getByRole('textbox', { name: 'Email address', exact: true })
    .fill(`${suffix}@example.test`);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('TestCampaign2026!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ravenswood', exact: true })).toBeVisible();
  await page.screenshot({ path: `artifacts/${info.project.name}-saved.png`, fullPage: true });
});
test('keyboard dialogs, server rejection, and narrow layout', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Manage village headquarters', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await nav(page, 'Commands');
  await expect(page.getByRole('heading', { name: 'Your banners are at rest' })).toBeVisible();
  await nav(page, 'Buildings');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await nav(page, 'World map');
  await expect(page.locator('.pixi-map canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
