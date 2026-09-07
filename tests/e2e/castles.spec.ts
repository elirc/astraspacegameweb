import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: 'wait' });
});

async function settleMap(page: Page) {
  // Camera drawing is deliberately scheduled on demand. Let its next frame
  // finish before taking a screenshot or clicking the rendered silhouette.
  await page
    .getByLabel('Interactive world map', { exact: true })
    .evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
}

async function inspectCastles(page: Page, project: string, mode: 'Default' | 'Canvas') {
  const map = page.getByLabel('Interactive world map', { exact: true });
  await expect(map).toBeVisible();
  await expect(map.locator('canvas')).toBeVisible();
  await expect(page.locator('.map-coordinate')).toContainText(
    mode === 'Canvas' ? 'Canvas' : /WebGL|Canvas/,
  );
  const actualRenderer = (await page.locator('.map-coordinate').innerText()).includes('WebGL')
    ? 'WebGL'
    : 'Canvas';
  // Desktop Chromium provides a supported GPU path in this browser matrix;
  // exercise it explicitly while allowing the real watchdog on other devices.
  if (mode === 'Default' && project === 'desktop-chromium') expect(actualRenderer).toBe('WebGL');
  await test.info().attach('castle-renderer', {
    body: JSON.stringify({ requested: mode, actual: actualRenderer }),
    contentType: 'application/json',
  });
  await expect(
    page.getByRole('heading', { name: 'Strongholds nearby', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.village-list').getByRole('button', { name: /Ironwatch Citadel/ }),
  ).toBeVisible();
  await expect(page.getByText('Your keeps', { exact: true })).toBeVisible();
  await expect(page.getByText('Other lords', { exact: true })).toBeVisible();
  await expect(page.getByText('Ruined keeps', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Center on your village', exact: true }).click();
  await settleMap(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `artifacts/${project}-castles-${mode.toLowerCase()}-${actualRenderer.toLowerCase()}.png`,
    fullPage: true,
  });

  // Five 1.25x zoom steps reach the public control's 3x limit. The citadel is
  // one field south of home; click its upper keep, well outside the old fixed
  // 21-screen-pixel target, while staying clear of the neighboring home castle.
  for (let i = 0; i < 5; i++)
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await settleMap(page);
  let bounds = await map.boundingBox();
  expect(bounds).not.toBeNull();
  await map.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 + 42 * 3 * 0.55 } });
  await expect(page.getByRole('dialog', { name: 'Ironwatch Citadel', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Adjacent keep centers are only 10.5px apart at minimum zoom. The western
  // keep occurs first in the public response and in spatial iteration, but a
  // click on the eastern keep must select that nearer keep on either renderer.
  await page.getByRole('button', { name: 'Center on your village', exact: true }).click();
  for (let i = 0; i < 7; i++)
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await settleMap(page);
  bounds = await map.boundingBox();
  expect(bounds).not.toBeNull();
  await map.click({
    position: { x: bounds!.width / 2 + 0.1 * 42 * 0.25, y: bounds!.height / 2 - 4.15 * 42 * 0.25 },
  });
  await expect(page.getByRole('dialog', { name: 'Eastmere Keep', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const backend of ['Default', 'Canvas'] as const) {
  test(`fortress map selects castle silhouettes and adjacent keeps in ${backend}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Navigation preserves renderer query parameters. Each renderer therefore
    // uses one ordinary page from guest entry through every interaction, without
    // creating another tab or replacing a document with polling requests in flight.
    await page.goto(backend === 'Canvas' ? '/?renderer=canvas' : '/');
    const [joined] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/auth/guest') && response.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Enter the Crownlands', exact: true }).click(),
    ]);
    expect(joined.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Ravenswood', exact: true })).toBeVisible();
    const state = await (await page.request.get('/api/state')).json();
    const own = state.villages[0];
    const tileSize = state.config.map.tileSize;
    const publicHome = {
      id: own.id,
      x: own.x,
      y: own.y,
      name: own.name,
      points: own.points,
      player_id: own.player_id,
      player_name: state.player.name,
    };
    // Only public map responses are fixtures. The guest session, authenticated
    // state, game rules, controls, renderer and target dialogs remain real.
    const keeps = [
      {
        ...publicHome,
        id: 9000001,
        x: own.x - 1,
        y: own.y - 4,
        name: 'Westmere Keep',
        points: 600,
        player_id: null,
        player_name: null,
      },
      {
        ...publicHome,
        id: 9000002,
        y: own.y - 4,
        name: 'Eastmere Keep',
        points: 600,
        player_id: -1,
        player_name: 'Mara Voss',
      },
      publicHome,
      {
        ...publicHome,
        id: 9000003,
        y: own.y + 1,
        name: 'Ironwatch Citadel',
        points: 1800,
        player_id: -2,
        player_name: 'Gareth Hale',
      },
      {
        ...publicHome,
        id: 9000004,
        x: own.x - 2,
        y: own.y + 2,
        name: 'Greyfall Ruins',
        points: 200,
        player_id: null,
        player_name: null,
      },
      {
        ...publicHome,
        id: 9000005,
        x: own.x + 2,
        y: own.y - 2,
        name: 'Goldspire Castle',
        points: 900,
      },
    ];
    await page.context().route('**/api/map/tiles?*', async (route) => {
      const url = new URL(route.request().url());
      const x = Number(url.searchParams.get('x'));
      const y = Number(url.searchParams.get('y'));
      await route.fulfill({
        json: {
          villages: keeps.filter(
            (keep) => Math.floor(keep.x / tileSize) === x && Math.floor(keep.y / tileSize) === y,
          ),
          tile: { x, y },
          tileSize,
        },
      });
    });
    await page.context().route('**/api/map/search?*', async (route) => {
      const query = new URL(route.request().url()).searchParams.get('q')?.toLowerCase() || '';
      await route.fulfill({
        json: {
          villages: keeps.filter((keep) =>
            `${keep.name} ${keep.player_name || ''}`.toLowerCase().includes(query),
          ),
        },
      });
    });
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole('button', { name: 'World map', exact: true }).click();
    await inspectCastles(page, info.project.name, backend);
    expect(errors).toEqual([]);
  });
}

test('map watchdog keeps Canvas and releases a late WebGL renderer', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const lifecycle = { created: 0, lost: 0 };
    (window as any).__castleGpuLifecycle = lifecycle;
    const seen = new WeakSet<object>();
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: any[]
    ) {
      const context = (original as any).call(this, kind, ...args);
      if (/^(webgl2?|experimental-webgl)$/.test(kind) && context && !seen.has(context)) {
        seen.add(context);
        lifecycle.created++;
        this.addEventListener('webglcontextlost', () => lifecycle.lost++);
      }
      return context;
    } as typeof original;
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted = false;
  await page.context().route(/\/WebGLRenderer-[^/]+\.js(?:\?.*)?$/, async (route) => {
    intercepted = true;
    await held;
    await route.continue();
  });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Enter the Crownlands', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ravenswood', exact: true })).toBeVisible();
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole('button', { name: 'World map', exact: true }).click();
    await expect.poll(() => intercepted).toBe(true);
    const map = page.getByLabel('Interactive world map', { exact: true });
    await expect(page.locator('.map-coordinate')).toContainText('Canvas');
    await expect(map.locator('canvas')).toBeVisible();
    await map
      .locator('canvas')
      .evaluate((canvas) => canvas.setAttribute('data-retained-fallback', 'true'));
    const before = await page.evaluate(() => ({ ...(window as any).__castleGpuLifecycle }));
    release();
    // The support probe ran before the held import. A new context after release
    // proves that late initialization actually completed; its lost event proves
    // the abandoned candidate was destroyed rather than left allocating GPU memory.
    await expect
      .poll(async () => page.evaluate(() => (window as any).__castleGpuLifecycle.created))
      .toBeGreaterThan(before.created);
    await expect
      .poll(async () => page.evaluate(() => (window as any).__castleGpuLifecycle.lost))
      .toBeGreaterThan(before.lost);
    await expect(map.locator('canvas')).toHaveCount(1);
    await expect(map.locator('canvas[data-retained-fallback="true"]')).toHaveCount(1);
    await expect(page.locator('.map-coordinate')).toContainText('Canvas');
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await settleMap(page);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});
