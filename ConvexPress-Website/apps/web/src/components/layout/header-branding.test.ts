import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('all header packs honor logo size, visibility and tagline controls', () => {
  const result = spawnSync(process.execPath,[fileURLToPath(new URL('./header-branding.fixture.jsx',import.meta.url))],{encoding:'utf8'});
  if(result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stdout).toContain('"cases":66');
});
