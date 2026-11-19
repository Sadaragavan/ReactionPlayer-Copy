/**
 * Desktop build (`npm run dev`, `npm run build`): main + preload + the Svelte renderer.
 * The plain-browser dev server (`npm run dev:web`) uses `vite.config.ts` instead.
 */
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'electron-vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const { version } = JSON.parse(readFileSync(root('./package.json'), 'utf8')) as { version: string };

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: root('./electron/main.ts') } }
    }
  },
  preload: {
    build: {
      // A sandboxed preload cannot be an ES module, so it is emitted as CommonJS.
      rollupOptions: {
        input: { index: root('./electron/preload.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    root: root('.'),
    base: './',
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [svelte(), tailwindcss()],
    resolve: { alias: { $lib: root('./src/lib') } },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 900,
      rollupOptions: { input: { index: root('./index.html') } }
    }
  }
});
