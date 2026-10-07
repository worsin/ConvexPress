import {test,expect} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('Assistant cart action requires exact shopper authorization',()=>{
 const result=spawnSync(process.execPath,['test',fileURLToPath(new URL('./AssistantCartAction.cases.jsx',import.meta.url))],{encoding:'utf8',timeout:20000});
 if(result.status!==0)throw Error(result.stdout+result.stderr);
 expect(result.status).toBe(0);
},25000);
