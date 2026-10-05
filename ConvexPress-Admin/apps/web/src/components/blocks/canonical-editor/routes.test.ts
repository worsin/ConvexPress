import {expect,test} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('post and page routes use only canonical authoring and deliberate import',()=>{
 const result=spawnSync(process.execPath,['test',fileURLToPath(new URL('./routes.cases.jsx',import.meta.url))],{encoding:'utf8',timeout:30000});
 if(result.status!==0)throw Error(result.stdout+result.stderr);expect(result.status).toBe(0);
},30000);
