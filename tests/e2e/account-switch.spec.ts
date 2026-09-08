import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: 'wait' });
});

async function navigate(page: Page, name: string) {
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name, exact: true }).click();
}

test('signing in from a guest profile clears the previous campaign and private inbox caches', async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `switch-${suffix}@example.test`;
  const password = 'AccountSwitch2026!';
  const accountName = `Returning ${suffix}`;
  const accountVillageName = `Account Keep ${suffix}`;
  // The request fixture has its own cookie jar; creating the saved account must
  // not authenticate the browser that will begin as a different guest player.
  const registered = await request.post('/api/auth/register', {
    data: { email, password, name: accountName },
  });
  expect(registered.ok()).toBe(true);
  const accountStateResponse = await request.get('/api/state');
  expect(accountStateResponse.ok()).toBe(true);
  const account = await accountStateResponse.json();
  const accountVillage = account.villages[0];
  const renamed = await request.post(`/api/villages/${accountVillage.id}/command`, {
    headers: { 'Idempotency-Key': randomUUID() },
    data: { action: 'rename', name: accountVillageName },
  });
  expect(renamed.ok()).toBe(true);
  const accountReports = await (await request.get('/api/reports')).json();

  const joined = await page.request.post('/api/auth/guest', { data: {} });
  expect(joined.ok()).toBe(true);
  const guestStateResponse = await page.request.get('/api/state');
  expect(guestStateResponse.ok()).toBe(true);
  const guest = await guestStateResponse.json();
  const guestReports = await (await page.request.get('/api/reports')).json();
  expect(guest.player.id).not.toBe(account.player.id);
  expect(guestReports.reports.length).toBeGreaterThan(0);
  expect(accountReports.reports.length).toBeGreaterThan(0);

  const fixtures = new Map([
    [
      guest.player.id,
      {
        report: {
          ...guestReports.reports[0],
          subject: `Guest private report ${suffix}`,
          payload: { text: `Guest report details ${suffix}` },
        },
        message: {
          id: 9000201,
          sender_id: guest.player.id,
          recipient_id: -1,
          sender: guest.player.name,
          recipient: 'Test correspondent',
          subject: `Guest private message ${suffix}`,
          body: `Guest message details ${suffix}`,
          created_at: new Date().toISOString(),
        },
      },
    ],
    [
      account.player.id,
      {
        report: {
          ...accountReports.reports[0],
          subject: `Account private report ${suffix}`,
          payload: { text: `Account report details ${suffix}` },
        },
        message: {
          id: 9000202,
          sender_id: account.player.id,
          recipient_id: -1,
          sender: account.player.name,
          recipient: 'Test correspondent',
          subject: `Account private message ${suffix}`,
          body: `Account message details ${suffix}`,
          created_at: new Date().toISOString(),
        },
      },
    ],
  ]);
  const held = new Set<string>();
  let releaseReports!: () => void;
  let releaseMessages!: () => void;
  const reportGate = new Promise<void>((resolve) => {
    releaseReports = resolve;
  });
  const messageGate = new Promise<void>((resolve) => {
    releaseMessages = resolve;
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Only private list content is fixed. Resolve the identity from the real
  // server with each original request's cookies, including requests in flight
  // during login. A test-side login flag must not assign them to the wrong user.
  for (const kind of ['reports', 'messages'] as const) {
    await page.context().route(`**/api/${kind}?*`, async (route) => {
      const identity = await route.fetch({
        url: new URL('/api/state', route.request().url()).toString(),
      });
      expect(identity.ok()).toBe(true);
      const playerId = (await identity.json()).player.id;
      const fixture = fixtures.get(playerId);
      expect(fixture).toBeDefined();
      if (playerId === account.player.id) {
        held.add(kind);
        await (kind === 'reports' ? reportGate : messageGate);
      }
      await route.fulfill({
        json: {
          [kind]: [kind === 'reports' ? fixture!.report : fixture!.message],
          next_cursor: null,
        },
      });
    });
  }

  try {
    await page.goto('/?page=reports');
    await expect(page.getByRole('combobox', { name: 'Current village' })).toHaveValue(
      String(guest.villages[0].id),
    );
    await page.getByRole('button', { name: new RegExp(`Guest private report ${suffix}`) }).click();
    await expect(page.getByText(`Guest report details ${suffix}`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await navigate(page, 'Messages');
    await page.getByRole('button', { name: new RegExp(`Guest private message ${suffix}`) }).click();
    await expect(page.getByText(`Guest message details ${suffix}`, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await navigate(page, 'Reports');
    await expect(page.getByText(`Guest private report ${suffix}`, { exact: true })).toBeVisible();

    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.locator('.profile').click();
    await expect(
      page.getByRole('dialog', { name: 'Begin your legacy', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Already have an account? Sign in', exact: true })
      .click();
    const signIn = page.getByRole('dialog', { name: 'Welcome back', exact: true });
    await signIn.getByRole('textbox', { name: 'Email address', exact: true }).fill(email);
    await signIn.getByLabel('Password', { exact: true }).fill(password);
    const [login] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().endsWith('/api/auth/login') && res.request().method() === 'POST',
      ),
      signIn.getByRole('button', { name: 'Sign in', exact: true }).click(),
    ]);
    expect(login.ok()).toBe(true);
    expect((await login.json()).playerId).toBe(account.player.id);
    const village = page.getByRole('combobox', { name: 'Current village' });
    await expect(village).toHaveValue(String(accountVillage.id));
    await expect(village.locator('option')).toHaveText([accountVillageName]);
    await expect(page.locator('.profile b')).toHaveText(accountName);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Hold fresh private data just long enough to inspect the pending screen.
    // Eventual replacement alone would miss disclosure of the previous cache.
    await expect.poll(() => held.has('reports')).toBe(true);
    await expect(page.getByText('Loading reports…', { exact: true })).toBeVisible();
    expect(await page.getByText(`Guest private report ${suffix}`, { exact: true }).count()).toBe(0);
    releaseReports();
    await expect(page.getByText(`Account private report ${suffix}`, { exact: true })).toBeVisible();

    await navigate(page, 'Messages');
    await expect.poll(() => held.has('messages')).toBe(true);
    await expect(page.getByText('Loading messages…', { exact: true })).toBeVisible();
    expect(await page.getByText(`Guest private message ${suffix}`, { exact: true }).count()).toBe(
      0,
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
    releaseMessages();
    await page
      .getByRole('button', { name: new RegExp(`Account private message ${suffix}`) })
      .click();
    await expect(
      page.getByText(`Account message details ${suffix}`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(`Guest message details ${suffix}`, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await navigate(page, 'Reports');
    await page
      .getByRole('button', { name: new RegExp(`Account private report ${suffix}`) })
      .click();
    await expect(page.getByText(`Account report details ${suffix}`, { exact: true })).toBeVisible();
    await expect(page.getByText(`Guest report details ${suffix}`, { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    releaseReports();
    releaseMessages();
  }
});
