import { expect, test, type WebSocketRoute } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('notification bursts retain completed state and fetch changes that arrive in flight', async ({
  page,
}) => {
  const joined = await page.request.post('/api/auth/guest', { data: {} });
  expect(joined.ok()).toBe(true);
  const state = await (await page.request.get('/api/state')).json();
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket('**/api/ws', (connection) => {
    socket = connection;
  });
  let refreshing = false;
  let requests = 0;
  let active = 0;
  let maxActive = 0;
  let releaseFirst!: () => void;
  let releaseTrailing!: () => void;
  const firstGate = new Promise<void>((resolve) => (releaseFirst = resolve));
  const trailingGate = new Promise<void>((resolve) => (releaseTrailing = resolve));
  await page.route('**/api/state', async (route) => {
    const response = structuredClone(state);
    if (refreshing) {
      const request = ++requests;
      active++;
      maxActive = Math.max(maxActive, active);
      response.villages[0].state.units.spear = request === 1 ? 37 : 39;
      try {
        await (request === 1 ? firstGate : trailingGate);
        await route.fulfill({ json: response });
      } finally {
        active--;
      }
    } else {
      response.villages[0].state.units.spear = 35;
      await route.fulfill({ json: response });
    }
  });
  try {
    await page.goto('/?page=barracks');
    const spearmen = page
      .locator('.recruit-card')
      .filter({ has: page.getByRole('heading', { name: 'Spearman', exact: true }) });
    await expect(spearmen.getByText('35 at home', { exact: true })).toBeVisible();
    await expect.poll(() => Boolean(socket)).toBe(true);
    refreshing = true;
    socket!.send(JSON.stringify({ type: 'village_changed' }));
    await expect.poll(() => requests).toBe(1);
    for (let i = 0; i < 20; i++) socket!.send(JSON.stringify({ type: 'recruit_done' }));
    // Let queued notifications run while the response is held. No assertion
    // deadline or successful-response deadline is extended.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    releaseFirst();
    await expect(spearmen.getByText('37 at home', { exact: true })).toBeVisible();
    await expect.poll(() => requests).toBeGreaterThanOrEqual(2);
    expect(maxActive).toBe(1);
    releaseTrailing();
    await expect(spearmen.getByText('39 at home', { exact: true })).toBeVisible();
  } finally {
    releaseFirst();
    releaseTrailing();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('a failed initial state can be retried without creating another guest', async ({ page }) => {
  const joined = await page.request.post('/api/auth/guest', { data: {} });
  expect(joined.ok()).toBe(true);
  let unavailable = true;
  let guestRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/auth/guest') guestRequests++;
  });
  await page.route('**/api/state', (route) =>
    unavailable
      ? route.fulfill({ status: 503, json: { error: 'World temporarily unavailable' } })
      : route.continue(),
  );
  try {
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('Could not load your world');
    await expect(
      page.getByRole('button', { name: 'Enter the Crownlands', exact: true }),
    ).toBeDisabled();
    unavailable = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ravenswood', exact: true })).toBeVisible();
    expect(guestRequests).toBe(0);
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
  }
});
