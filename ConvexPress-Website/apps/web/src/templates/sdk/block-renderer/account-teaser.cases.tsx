import {expect, test} from 'bun:test';
import {renderToStaticMarkup} from 'react-dom/server';
import accountBlock from '../../../../../../../blocks/core/account-teaser/render';
import {prepareBlocks} from './model';
import {createDemoContentPageHost} from '../block-data/demo-channel';
import {resolveCanonicalData} from '../block-data/portable/resolve';
const policy = {enabledPlugins:[],capabilities:['viewer.authorization'],disabledBlocks:[]};
const current = {scope:{websiteKey:'account-demo',instanceKey:'staging'},documentKey:'account',revision:'1',viewerKey:'reader'};
const tree = [{id:'account',name:'core/account-teaser',version:1,attrs:{signedInText:'Your <script>space</script>',signedOutText:'A place for you'}}];
async function installed(signedIn:boolean) {
  const envelope = await resolveCanonicalData(tree,current.scope,policy,async()=>({page:null}),async()=>signedIn ? {state:'signed-in',href:'/dashboard'} : {state:'signed-out',href:'/login?returnTo=%2Fdashboard'});
  const host = createDemoContentPageHost(), grant = host.install({tree,context:current,policy,envelope});
  return {host, render:(context=current)=>renderToStaticMarkup(prepareBlocks(tree,{'core/account-teaser':accountBlock},policy,{media:{}},{grant,current:context}))};
}
test('account teaser renders the correct escaped text and working local destination for both viewer states', async()=>{
  const out = (await installed(false)).render();
  expect(out).toContain('A place for you');
  expect(out).toContain('href="/login?returnTo=%2Fdashboard"');
  expect(out).not.toContain('Welcome back');
  const signedIn = (await installed(true)).render();
  expect(signedIn).toContain('Your &lt;script&gt;space&lt;/script&gt;');
  expect(signedIn).toContain('href="/dashboard"');
  expect(signedIn).not.toContain('<script>');
  expect(signedIn).not.toContain('Sign in →');
});
test('a retired account grant or another viewer cannot display the previous signed-in account teaser',async()=>{
  const {host,render} = await installed(true);
  expect(()=>render({...current,viewerKey:'another-person'})).toThrow();
  expect(()=>render({...current,scope:{...current.scope,instanceKey:'production'}})).toThrow();
  host.invalidate();
  expect(()=>render()).toThrow();
});
