import {expect,test} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('pack navigation styles and submenu arrangements reach real interactive headers',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./header-navigation.fixture.jsx',import.meta.url))],{encoding:'utf8'});
 if(result.status!==0)throw Error(result.stderr||result.stdout);
 expect(result.stdout).toContain('"navigationChecks":12');
});
