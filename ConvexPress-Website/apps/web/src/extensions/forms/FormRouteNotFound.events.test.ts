import {expect,test} from 'bun:test';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('form SSR denial retries once per ready customer session with bounded cache eviction',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./FormRouteNotFound.events.fixture.jsx',import.meta.url))],{encoding:'utf8'});
 if(result.status!==0)throw new Error(result.stderr||result.stdout);
 expect(result.status).toBe(0);
});
