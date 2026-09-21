import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
test('reference block schemas are byte-identical in Admin and Website',()=>{
 for(const id of ['field-guide','upcoming-events']) {
  const website=readFileSync(new URL(`../apps/web/src/blocks/${id}/schema.ts`,import.meta.url),'utf8');
  const admin=readFileSync(new URL(`../../ConvexPress-Admin/apps/web/src/blocks/${id}/schema.ts`,import.meta.url),'utf8');
  expect(admin).toBe(website);
 }
});
