import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('breadcrumb SSR preserves untrusted labels as JSON-LD data', () => {
  const result = spawnSync(process.execPath, ['test', fileURLToPath(new URL('./Breadcrumbs.security.cases.jsx', import.meta.url))], {encoding:'utf8',timeout:15000});
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  expect(result.status).toBe(0);
}, 20000);
