import {expect,test} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('wizard receives each edit once without render-phase updates or lost values',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./FormRenderer.events.fixture.jsx',import.meta.url))],{encoding:'utf8'});
 if(result.status!==0)throw new Error(result.stderr||result.stdout);
 expect(result.status).toBe(0);
});
