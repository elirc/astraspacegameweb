import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// Interception must reach the fixture rather than bypass it through the PWA worker.
// Continuous trace screenshots distort animation-frame measurements.
test.use({ serviceWorkers: 'block', trace: 'off' });
test.afterEach(async ({ context }) => {
  await context.unrouteAll({ behavior: 'wait' });
});

test('map streams 50,000 public villages, renders, pans and survives Canvas fallback', async ({
  page,
}, info) => {
  const villages = Array.from({ length: 50000 }, (_, i) => ({
    id: 100000 + i,
    x: 375 + (i % 250),
    y: 400 + Math.floor(i / 250),
    name: 'Benchmark ' + i,
    points: 100,
    player_id: i % 7 ? (i % 2000) + 1 : null,
    player_name: 'Benchmark lord',
  }));
  const tiles = new Map<string, typeof villages>();
  for (const village of villages) {
    const key = Math.floor(village.x / 100) + ':' + Math.floor(village.y / 100),
      rows = tiles.get(key) || [];
    rows.push(village);
    tiles.set(key, rows);
  }
  let requests = 0;
  const requestedTiles = new Set<string>();
  const servedVillages = new Set<number>();
  await page.context().route('**/api/map/tiles?*', async (route) => {
    requests++;
    const url = new URL(route.request().url());
    requestedTiles.add(url.searchParams.get('x') + ':' + url.searchParams.get('y'));
    const rows = tiles.get(url.searchParams.get('x') + ':' + url.searchParams.get('y')) || [];
    for (const village of rows) servedVillages.add(village.id);
    await route.fulfill({
      json: {
        villages: rows,
        server_now: Date.now(),
      },
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const [joined] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/api/auth/guest') && r.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Enter the Crownlands', exact: true }).click(),
  ]);
  expect(joined.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Ravenswood', exact: true })).toBeVisible();
  const state = await (await page.request.get('/api/state')).json();
  const own = state.villages[0];
  const anchor = { x: Math.round(own.x / 100) * 100, y: Math.round(own.y / 100) * 100 };
  tiles.clear();
  for (const village of villages) {
    village.x += anchor.x - 500;
    village.y += anchor.y - 500;
    const key = Math.floor(village.x / 100) + ':' + Math.floor(village.y / 100);
    const rows = tiles.get(key) || [];
    rows.push(village);
    tiles.set(key, rows);
  }
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'World map', exact: true }).click();
  await expect(page.getByLabel('Interactive world map', { exact: true })).toBeVisible();
  await expect(page.locator('.pixi-map canvas')).toBeVisible();
  await expect(page.locator('.map-coordinate')).not.toContainText('loading');
  // Use the real camera controls. Align near a tile boundary so every browser's
  // viewport prefetches the entire fixture, without intercepting authenticated state.
  await page.locator('.pixi-map').evaluate(
    (element, { own, anchor }) => {
      for (const axis of ['x', 'y'] as const) {
        const steps = Math.round((anchor[axis] - own[axis]) / 5);
        const key =
          axis === 'x'
            ? steps < 0
              ? 'ArrowLeft'
              : 'ArrowRight'
            : steps < 0
              ? 'ArrowUp'
              : 'ArrowDown';
        for (let i = 0; i < Math.abs(steps); i++)
          element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      }
    },
    { own: { x: own.x, y: own.y }, anchor },
  );
  await expect.poll(() => servedVillages.size).toBe(50000);
  const profiler =
    process.env.PROFILE_MAP === '1' && info.project.name === 'desktop-chromium'
      ? await page.context().newCDPSession(page)
      : undefined;
  await profiler?.send('Profiler.enable');
  await profiler?.send('Profiler.start');
  const warmupFrames = process.env.CERTIFY_MAP_FPS === '1' ? 120 : 60;
  const measuredFrames = process.env.CERTIFY_MAP_FPS === '1' ? 600 : 300;
  const frames = await page.locator('.pixi-map').evaluate(
    async (element, { warmupFrames, measuredFrames }) => {
      const deltas: number[] = [];
      let previous = performance.now();
      for (let i = 0; i < warmupFrames + measuredFrames; i++) {
        // RAF timestamps measure frame intervals without microtask scheduling jitter.
        // Warm-up excludes tile decoding and renderer initialization.
        const now = await new Promise<number>((r) => requestAnimationFrame(r));
        deltas.push(now - previous);
        previous = now;
        element.dispatchEvent(
          new KeyboardEvent('keydown', { key: i % 2 ? 'ArrowLeft' : 'ArrowRight', bubbles: true }),
        );
      }
      return deltas.slice(warmupFrames).sort((a, b) => a - b);
    },
    { warmupFrames, measuredFrames },
  );
  if (profiler) {
    const result = await profiler.send('Profiler.stop');
    await writeFile('artifacts/map-cpu-profile.json', JSON.stringify(result));
    await profiler.detach();
  }
  const gpu = await page.locator('.pixi-map canvas').evaluate((element) => {
    const gl =
      (element as HTMLCanvasElement).getContext('webgl2') ||
      (element as HTMLCanvasElement).getContext('webgl');
    if (!gl) return 'unavailable';
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  });
  const measurement = {
    gpu,
    run: info.repeatEachIndex,
    profiled: !!profiler,
    villages: 50000,
    warmupFrames,
    measuredFrames: frames.length,
    tileRequests: requests,
    servedVillages: servedVillages.size,
    uniqueTiles: [...requestedTiles],
    renderer: await page.locator('.map-coordinate').innerText(),
    meanFps: 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
    p95FrameMs: frames[Math.floor(frames.length * 0.95)],
    environment:
      process.env.CERTIFY_MAP_FPS === '1'
        ? 'Local integrated-GPU acceptance run; renderer must identify Intel hardware'
        : 'Headless browser diagnostic; see the actual GPU renderer',
  };
  await writeFile(
    `artifacts/${info.project.name}-map-performance.json`,
    JSON.stringify(measurement, null, 2),
  );
  await writeFile(
    `artifacts/${info.project.name}-map-performance-${info.repeatEachIndex}.json`,
    JSON.stringify(measurement, null, 2),
  );
  await info.attach('map-performance.json', {
    body: JSON.stringify(measurement, null, 2),
    contentType: 'application/json',
  });
  if (process.env.CERTIFY_MAP_FPS === '1') {
    expect(gpu).toMatch(/Intel/i);
    expect(gpu).not.toMatch(/SwiftShader|llvmpipe|software/i);
    expect(measurement.meanFps).toBeGreaterThanOrEqual(59);
    expect(measurement.p95FrameMs).toBeLessThanOrEqual(20);
  }
  expect(requestedTiles.size).toBeLessThanOrEqual(16);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `artifacts/${info.project.name}-map-50k.png`, fullPage: true });
  // Keep the current document alive: a hard navigation can cancel its polling
  // requests. Exercise the explicit renderer URL in a fresh, authenticated page.
  const fallback = await page.context().newPage();
  fallback.on('pageerror', (error) => errors.push(error.message));
  try {
    await fallback.goto('/?renderer=canvas&page=map');
    await expect(fallback.getByLabel('Interactive world map', { exact: true })).toBeVisible();
    await expect(fallback.locator('.map-coordinate')).toContainText('Canvas');
    await expect(fallback.locator('.pixi-map canvas')).toBeVisible();
    await fallback.getByRole('button', { name: 'Zoom in', exact: true }).click();
    expect(await fallback.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  } finally {
    await fallback.close();
  }
});
