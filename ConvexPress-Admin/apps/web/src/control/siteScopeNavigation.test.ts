import {expect,test} from 'bun:test';
import {prepareSiteScopeNavigation} from './siteScopeNavigation';
const old={websiteId:'one',instanceId:'staging'},next={websiteId:'two',instanceId:'production'};
test('site changes leave the previous database resource route before proceeding',async()=>{
  let path='/pages/old-db-id/edit',calls=0;
  expect(await prepareSiteScopeNavigation(old,next,async()=>{calls++;path='/dashboard';},()=>path,()=>true)).toBe(true);
  expect(calls).toBe(1);
});
test('cancelled navigation and superseded requests cannot change the selected database',async()=>{
  expect(await prepareSiteScopeNavigation(old,next,async()=>{},()=>'/pages/unsaved/edit',()=>true)).toBe(false);
  expect(await prepareSiteScopeNavigation(old,next,async()=>{},()=>'/dashboard',()=>false)).toBe(false);
});
test('reselecting the same environment preserves its resource route',async()=>{
  expect(await prepareSiteScopeNavigation(old,old,async()=>{throw Error('must not navigate');},()=>'/pages/own-id/edit',()=>true)).toBe(true);
});
