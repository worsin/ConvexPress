import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('all template cart review and shared surfaces display the resolved variant', () => {
 const result = spawnSync(process.execPath, ['test', fileURLToPath(new URL('./cart-variant-surfaces.cases.jsx', import.meta.url))], {encoding:'utf8', timeout:30000});
 if (result.status !== 0) throw Error(result.stdout + result.stderr);
 expect(result.status).toBe(0);
}, 30000);
