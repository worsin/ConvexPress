import {expect,test} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('real pack headers honor search variants, placeholders, keyboard behavior and query routing',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./header-search.fixture.jsx',import.meta.url))],{encoding:'utf8'});
 if(result.status!==0)throw Error(result.stderr||result.stdout);
 expect(result.stdout).toContain('"searchChecks":12');
});
