import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
const output = fileURLToPath(new URL('./dist', import.meta.url));
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'warband-offline-assets',
      writeBundle(_options, bundle) {
        const file = output + '/sw.js';
        const assets = [
          '/',
          '/crest.svg',
          '/icon-192.png',
          '/icon-512.png',
          ...Object.keys(bundle)
            .filter((name) => /\.(js|css)$/.test(name))
            .map((name) => '/' + name),
        ];
        writeFileSync(
          file,
          readFileSync(file, 'utf8').replace('self.__WB_ASSETS__', JSON.stringify(assets)),
        );
      },
    },
  ],
  root: fileURLToPath(new URL('./apps/web', import.meta.url)),
  build: { outDir: fileURLToPath(new URL('./dist', import.meta.url)), emptyOutDir: true },
  server: {
    port: 4178,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3001', ws: true } },
  },
});
