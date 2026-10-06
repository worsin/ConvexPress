import {expect,test} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('compact account desktop/mobile menus honor active header selection and retain independent footer mapping',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./header-menu-source.fixture.jsx',import.meta.url))],{encoding:'utf8'});
 if(result.status!==0)throw Error(result.stderr||result.stdout);
 expect(result.stdout).toContain('"menuSourceChecks":23');
});
