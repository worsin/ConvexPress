/** Build the actual Core drawer for isolated browser focus acceptance. */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const app = path.join(root, 'apps/web');
const require = createRequire(path.join(app, 'package.json'));
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
const output = path.resolve(root, '../output/navigation-ssr-20260905');
mkdirSync(output, { recursive: true });
await build({
  absWorkingDir: app,
  entryPoints: ['src/components/layout/mobile-nav.browser.fixture.tsx'],
  bundle: true, format: 'iife', outfile: path.join(output, 'fixture.js'),
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.DEV': 'false' },
  logLevel: 'warning',
});
writeFileSync(path.join(output, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Core navigation acceptance</title></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
console.log(`Serve ${output} on loopback for Playwright CLI acceptance. This harness makes no backend or provider requests.`);
