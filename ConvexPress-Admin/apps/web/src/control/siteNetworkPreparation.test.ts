import {expect,test} from 'bun:test';
import {rejects} from 'node:assert/strict';
import {createSiteNetworkPreparation} from './siteNetworkPreparation';
test('effect replay waits for the same original registration instead of connecting before reload',async()=>{
  const prepare = createSiteNetworkPreparation();
  let finish!: (value:{added:string[]})=>void, calls=0;
  const register=()=>{calls++;return new Promise<{added:string[]}>(resolve=>{finish=resolve;});};
  const first=prepare(['http://site.test:4870'],register), replay=prepare(['http://site.test:4870'],register);
  expect(first).toBe(replay); await Promise.resolve(); expect(calls).toBe(1);
  finish({added:['http://site.test:4870']});
  expect(await first).toBe(true);expect(await replay).toBe(true);
});
test('document policy controls readiness even when another window already persisted the origin',async()=>{
  const prepare=createSiteNetworkPreparation();
  expect(await prepare(['https://new.test'],async()=>({added:[],reloadRequired:true}))).toBe(true);
  expect(await prepare(['https://ready.test'],async()=>({added:['https://ready.test'],reloadRequired:false}))).toBe(false);
});
test('failed preparation can be retried and does not certify a different target',async()=>{
  const prepare=createSiteNetworkPreparation();
  await rejects(prepare(['https://retry.test'],async()=>{throw Error('IPC unavailable');}), /IPC unavailable/);
  expect(await prepare(['https://retry.test'],async()=>({added:[],reloadRequired:false}))).toBe(false);
  expect(await prepare(['https://another.test'],async()=>({added:[],reloadRequired:true}))).toBe(true);
});
