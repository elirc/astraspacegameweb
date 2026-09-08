import { expect, test, type Locator } from '@playwright/test';

test.use({ serviceWorkers: 'block', deviceScaleFactor: 2 });

test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: 'wait' });
});

async function settleCanvas(canvas: Locator) {
  await canvas.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function backingStore(canvas: Locator) {
  return canvas.evaluate((element) => {
    const surface = element as HTMLCanvasElement;
    const host = surface.parentElement!;
    const transform = surface.getContext('2d')!.getTransform();
    return {
      width: surface.width,
      height: surface.height,
      matchesViewport:
        surface.width === host.clientWidth * 2 && surface.height === host.clientHeight * 2,
      transform: [transform.a, transform.b, transform.c, transform.d, transform.e, transform.f],
    };
  });
}

async function pixels(canvas: Locator) {
  await settleCanvas(canvas);
  return canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
}

test('Canvas preserves pixels after pan, zoom and resize round trips at double density', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const guest = await page.request.post('/api/auth/guest', { data: {} });
  expect(guest.ok()).toBe(true);
  const response = await page.request.get('/api/state');
  expect(response.ok()).toBe(true);
  const state = await response.json();
  const own = state.villages[0];
  const tileSize = state.config.map.tileSize;
  const home = {
    id: own.id,
    x: own.x,
    y: own.y,
    name: own.name,
    points: own.points,
    player_id: own.player_id,
    player_name: state.player.name,
  };
  // Keep all artwork fixtures in the home tile, including frontier starts near
  // a tile edge. Only public map data is fixed; authentication and state are real.
  const dx = own.x % tileSize < tileSize - 2 ? 1 : -1;
  const dy = own.y % tileSize < tileSize - 2 ? 1 : -1;
  const keeps = [
    home,
    {
      ...home,
      id: 9000101,
      x: own.x + dx * 2,
      y: own.y + dy,
      name: 'Canvas Watchtower',
      points: 1800,
      player_id: -1,
      player_name: 'Canvas fixture lord',
    },
    {
      ...home,
      id: 9000102,
      x: own.x + dx,
      y: own.y + dy * 2,
      name: 'Canvas Ruins',
      points: 600,
      player_id: null,
      player_name: null,
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
  await page
    .context()
    .route('**/api/map/search?*', (route) => route.fulfill({ json: { villages: keeps } }));
  const [homeTile] = await Promise.all([
    page.waitForResponse((res) => {
      const url = new URL(res.url());
      return (
        url.pathname === '/api/map/tiles' &&
        Number(url.searchParams.get('x')) === Math.floor(own.x / tileSize) &&
        Number(url.searchParams.get('y')) === Math.floor(own.y / tileSize)
      );
    }),
    page.goto('/?page=map&renderer=canvas'),
  ]);
  await homeTile.finished();
  const map = page.getByLabel('Interactive world map', { exact: true });
  const canvas = map.locator('canvas');
  const coordinate = page.locator('.map-coordinate');
  await expect(map).toBeVisible();
  await expect(canvas).toBeVisible();
  await expect(coordinate).toContainText('Canvas');
  expect(await page.evaluate(() => devicePixelRatio)).toBe(2);

  // Selecting a rendered keep confirms that the tile has reached the renderer,
  // rather than taking the reference image from a still-empty loading frame.
  await settleCanvas(canvas);
  const bounds = await map.boundingBox();
  expect(bounds).not.toBeNull();
  await map.click({
    position: { x: bounds!.width / 2 + dx * 84, y: bounds!.height / 2 + dy * 42 - 6.3 },
  });
  await expect(page.getByRole('dialog', { name: 'Canvas Watchtower', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const initialPixels = await pixels(canvas);
  const initialSize = await backingStore(canvas);
  expect(initialSize.matchesViewport).toBe(true);
  expect(initialSize.transform).toEqual([2, 0, 0, 2, 0, 0]);
  expect((await pixels(canvas)) === initialPixels).toBe(true);

  await map.press('ArrowRight');
  await expect(coordinate).toContainText(`${own.x + 5} | ${own.y}`);
  await expect.poll(async () => (await pixels(canvas)) === initialPixels).toBe(false);
  await map.press('ArrowLeft');
  await expect(coordinate).toContainText(`${own.x} | ${own.y}`);
  await expect.poll(async () => (await pixels(canvas)) === initialPixels).toBe(true);

  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(async () => (await pixels(canvas)) === initialPixels).toBe(false);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect.poll(async () => (await pixels(canvas)) === initialPixels).toBe(true);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  await page.setViewportSize({ width: viewport!.width + 80, height: viewport!.height + 60 });
  await expect
    .poll(async () => {
      const size = await backingStore(canvas);
      return size.matchesViewport && size.width !== initialSize.width;
    })
    .toBe(true);
  expect((await pixels(canvas)) === initialPixels).toBe(false);
  await page.setViewportSize(viewport!);
  await expect.poll(() => backingStore(canvas)).toEqual(initialSize);
  await expect.poll(async () => (await pixels(canvas)) === initialPixels).toBe(true);
  await expect(canvas).toHaveCount(1);
  expect(errors).toEqual([]);
});
