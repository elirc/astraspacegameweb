import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: 'wait' });
});

async function join(page: Page) {
  const response = await page.request.post('/api/auth/guest', { data: {} });
  expect(response.ok()).toBe(true);
  return (await page.request.get('/api/state')).json();
}

test('unknown page opens the village and navigation exposes its current page', async ({ page }) => {
  await join(page);
  await page.goto('/?page=missing&renderer=canvas');
  await expect(page.getByRole('heading', { name: 'Ravenswood', exact: true })).toBeVisible();
  const menu = page.getByRole('button', {
    name: 'Open navigation',
    exact: true,
    includeHidden: true,
  });
  if (await menu.isVisible()) {
    await expect(page.getByRole('button', { name: 'Buildings', exact: true })).toBeHidden();
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Village overview', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('.profile')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Village overview', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeFocused();
    await menu.click();
  }
  await expect(page.getByRole('button', { name: 'Village overview', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('button', { name: 'Buildings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Buildings', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/renderer=canvas/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const section of ['reports', 'messages', 'rankings']) {
  test(`${section} shows a recoverable server error instead of an empty result`, async ({
    page,
  }) => {
    await join(page);
    let unavailable = true;
    await page.route(`**/api/${section}*`, async (route) => {
      if (unavailable)
        await route.fulfill({
          status: 503,
          contentType: 'text/html',
          body: '<h1>Unavailable</h1>',
        });
      else await route.continue();
    });
    await page.goto(`/?page=${section}`);
    await expect(page.getByRole('alert')).toContainText(`Could not load ${section}`);
    await expect(page.getByRole('alert')).not.toContainText('Unexpected token');
    unavailable = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    if (section === 'messages')
      await expect(page.getByRole('heading', { name: 'A quiet inbox' })).toBeVisible();
    else if (section === 'rankings')
      await expect(page.locator('.rankings-table tbody tr').first()).toBeVisible();
    else await expect(page.locator('.report-row').first()).toBeVisible();
  });
}

test('map initializes even when nearby search is unavailable', async ({ page }) => {
  await join(page);
  await page.route('**/api/map/search*', (route) =>
    route.fulfill({ status: 503, json: { error: 'Search temporarily unavailable' } }),
  );
  await page.goto('/?page=map&renderer=canvas');
  await expect(
    page.getByLabel('Interactive world map', { exact: true }).locator('canvas'),
  ).toBeVisible();
  await expect(
    page.getByText('Could not load strongholds. Please reconnect.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Center on your village', exact: true }).click();
  await expect(page.locator('.map-coordinate')).toContainText('Canvas');
});

test('switching villages updates the editable name and continent', async ({ page }) => {
  const state = await join(page);
  const second = {
    ...state.villages[0],
    id: state.villages[0].id + 1000000,
    name: 'Farwatch Keep',
    x: 712,
    y: 234,
  };
  state.villages.push(second);
  await page.route('**/api/state', (route) => route.fulfill({ json: state }));
  await page.goto('/?page=settings');
  const name = page.getByRole('textbox', { name: 'Village name', exact: true });
  await expect(name).toHaveValue('Ravenswood');
  await name.fill('Unsaved draft');
  await page
    .getByRole('combobox', { name: 'Current village', exact: true })
    .selectOption(String(second.id));
  await expect(name).toHaveValue('Farwatch Keep');
  await expect(page.locator('.village-switch')).toContainText('K27');
  await page
    .getByRole('combobox', { name: 'Current village', exact: true })
    .selectOption(String(state.villages[0].id));
  await expect(name).toHaveValue('Ravenswood');
});

test('failed sign out displays an error and retains the campaign', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await join(page);
  await page.route('**/api/auth/logout', (route) =>
    route.fulfill({ status: 503, json: { error: 'Sign out is temporarily unavailable' } }),
  );
  await page.goto('/?page=settings');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sign out is temporarily unavailable');
  await expect(page.getByRole('textbox', { name: 'Village name', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('report read failures are handled while the report stays readable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await join(page);
  await page.route('**/api/reports/*/read', (route) =>
    route.fulfill({ status: 503, json: { error: 'Read status could not be saved' } }),
  );
  await page.goto('/?page=reports');
  await page.locator('.report-row').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Read status could not be saved');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('defeated players see settlement errors and can retry', async ({ page }) => {
  const state = await join(page);
  state.villages = [];
  await page.route('**/api/state', (route) => route.fulfill({ json: state }));
  await page.route('**/api/restart', (route) =>
    route.fulfill({ status: 503, json: { error: 'Settlement temporarily unavailable' } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Settle a new village', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Settlement temporarily unavailable');
  await expect(
    page.getByRole('button', { name: 'Settle a new village', exact: true }),
  ).toBeEnabled();
});

test('mobile navigation unlocks the page after losing a village and resets after settlement', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await join(page);
  let defeated = false;
  await page.route('**/api/state', (route) =>
    route.fulfill({ json: defeated ? { ...state, villages: [] } : state }),
  );
  await page.route('**/api/restart', async (route) => {
    defeated = false;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/');
  const menu = page.getByRole('button', {
    name: 'Open navigation',
    exact: true,
    includeHidden: true,
  });
  await expect(menu).toBeVisible();
  const originalOverflow = await page
    .locator('body')
    .evaluate((body) => getComputedStyle(body).overflowY);
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('body')).toHaveCSS('overflow-y', 'hidden');

  // The next normal 10-second state poll removes the shell while its menu is open.
  defeated = true;
  await expect(
    page.getByRole('heading', { name: 'A new chapter awaits', exact: true }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('complementary', { name: 'Campaign navigation' })).toHaveCount(0);
  await expect(page.locator('body')).toHaveCSS('overflow-y', originalOverflow);
  await page.getByRole('button', { name: 'Settle a new village', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Ravenswood', exact: true })).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('body')).toHaveCSS('overflow-y', originalOverflow);
  await menu.click();
  await expect(page.getByRole('button', { name: 'Village overview', exact: true })).toBeFocused();
  await expect(page.locator('body')).toHaveCSS('overflow-y', 'hidden');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
  await expect(page.locator('body')).toHaveCSS('overflow-y', originalOverflow);
  expect(errors).toEqual([]);
});
