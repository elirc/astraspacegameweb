import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const svg = await readFile('apps/web/public/crest.svg', 'utf8');
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      '<style>html,body{margin:0;width:100%;height:100%;background:#18231d}svg{width:100%;height:100%}</style>' +
        svg,
    );
    await page.screenshot({ path: `apps/web/public/icon-${size}.png` });
  }
  const file = 'apps/web/public/manifest.webmanifest';
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.icons = [
    { src: '/crest.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ...[192, 512].map((size) => ({
      src: `/icon-${size}.png`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'any maskable',
    })),
  ];
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n');
} finally {
  await browser.close();
}
