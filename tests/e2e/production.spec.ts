import { test, expect } from '@playwright/test';
import { offlineOrigin } from './offline-proxy';

const builtOrigin = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3001';
test.use({ baseURL: builtOrigin });

test('built application supports account login and an offline PWA shell', async ({
  page,
  context,
  browserName,
}) => {
  const origin = await offlineOrigin(builtOrigin);
  try {
    await page.goto(origin.url);
    await expect(page).toHaveTitle('Warband — A world worth conquering');
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();
    const suffix = Date.now().toString(36);
    await page.getByRole('textbox', { name: 'Player name', exact: true }).fill('Built ' + suffix);
    await page
      .getByRole('textbox', { name: 'Email address', exact: true })
      .fill(`${suffix}@example.test`);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill('BuiltCampaign2026!');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ravenswood', exact: true })).toBeVisible();
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.locator('.profile').click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Email address', exact: true })
      .fill(`${suffix}@example.test`);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill('BuiltCampaign2026!');
    await page.getByRole('dialog').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ravenswood', exact: true })).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(async () => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    // WebKit's offline emulation prevents even a minimal worker from navigating.
    // Cut the actual origin's TCP connections instead; no app requests can succeed.
    origin.setOffline(true);
    if (browserName !== 'webkit') await context.setOffline(true);
    // Reload through the real cached shell while its origin is unavailable.
    await Promise.all([
      page.waitForEvent('domcontentloaded'),
      page.evaluate(() => location.reload()),
    ]);
    await expect(page).toHaveTitle('Warband — A world worth conquering');
    await expect(
      page.getByText('Could not load your world. Try again.', {
        exact: true,
      }),
    ).toBeVisible();
    origin.setOffline(false);
    await context.setOffline(false);
    // Reload through the real cached shell while its origin is unavailable.
    await Promise.all([
      page.waitForEvent('domcontentloaded'),
      page.evaluate(() => location.reload()),
    ]);
    await expect(page.getByRole('heading', { name: 'Ravenswood', exact: true })).toBeVisible();
  } finally {
    await context.setOffline(false).catch(() => {});
    await page.close();
    await origin.close();
  }
});
