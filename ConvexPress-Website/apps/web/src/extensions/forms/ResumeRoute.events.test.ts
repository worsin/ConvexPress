import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('resume route keeps confirmation through its own token consumption and releases revoked or failed drafts',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./ResumeRoute.events.fixture.jsx',import.meta.url))],{encoding:'utf8'});
 if(result.status!==0)throw new Error(result.stderr||result.stdout);
 expect(result.status).toBe(0);
});
