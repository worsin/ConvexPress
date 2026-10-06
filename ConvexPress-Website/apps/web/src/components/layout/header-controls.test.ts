import {expect,test} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('header top-bar choices, theme variants, CTA styles and guest visibility reach all packs',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./header-controls.fixture.jsx',import.meta.url))],{encoding:'utf8'});
 if(result.status!==0)throw Error(result.stderr||result.stdout);
 expect(JSON.parse(result.stdout)).toEqual({topBarChecks:64,themeChecks:8,actionChecks:12});
});
