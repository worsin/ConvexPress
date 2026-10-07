import {expect,test} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('actual desktop, dropdown, footer and mobile consumers preserve menu item kinds',()=>{
 const r=spawnSync(process.execPath,[fileURLToPath(new URL('./render-runner.mjs',import.meta.url))],{encoding:'utf8',timeout:30000});
 if(r.status!==0)throw Error(r.stdout+r.stderr);
 expect(r.stdout).toContain('37 menu semantics checks passed');
});
