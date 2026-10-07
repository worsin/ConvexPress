import {expect,test} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('all header packs consume layout fields and maintain the selected reading order',()=>{
 const r=spawnSync(process.execPath,[fileURLToPath(new URL('./header-layout.fixture.jsx',import.meta.url))],{encoding:'utf8'});
 if(r.status!==0)throw Error(r.stderr||r.stdout);
 expect(r.stdout).toContain('"layoutChecks":32');
});
