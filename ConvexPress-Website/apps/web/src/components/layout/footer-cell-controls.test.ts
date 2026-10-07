import {expect,test} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('all footer packs honor cell icons, alignment and responsive media',()=>{
 const r=spawnSync(process.execPath,[fileURLToPath(new URL('./footer-cell-controls.fixture.jsx',import.meta.url))],{encoding:'utf8'});
 if(r.status!==0)throw Error(r.stderr||r.stdout);expect(r.stdout).toContain('"cases":40');
});
