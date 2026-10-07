import {test,expect} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('Assistant composer retains unsent work',()=>{
 const result=spawnSync(process.execPath,['test',fileURLToPath(new URL('./AssistantRail.cases.jsx',import.meta.url))],{encoding:'utf8',timeout:20000});
 if(result.status!==0)throw Error(result.stdout+result.stderr);
 expect(result.status).toBe(0);
},25000);
