import assert from 'node:assert/strict';
import {mock} from 'bun:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {HEADER_DEFAULTS,identity,shellState,surfaceState} from './header-render.fixture-support.jsx';
// Exercise real compact account shells and the real menu lookup hook. Only
// external data sources and rendered surface boundaries are controlled.
let config=structuredClone(HEADER_DEFAULTS);
const locations={primary:'main-links',secondary:'alternate-links','footer-1':'footer-links'};
const queried=[];
mock.module('@/hooks/layout/useHeaderConfig',()=>({useHeaderConfig:()=>config}));
mock.module('@/hooks/layout/useFooterConfig',()=>({useFooterConfig:()=>({})}));
mock.module('@/hooks/layout/useLayoutConfig',()=>({useLayoutConfig:()=>({})}));
mock.module('@/hooks/layout/useSiteIdentity',()=>({useSiteIdentity:()=>identity}));
mock.module('@/templates/sdk/useTemplateSettings',()=>({useTemplateSettings:()=>({get:(module,key)=>module==='menuLayout'?locations[key]:undefined})}));
mock.module('@convex-dev/react-query',()=>({convexQuery:(_api,args)=>args}));
const query=await import('@tanstack/react-query');
mock.module('@tanstack/react-query',()=>({...query,useSuspenseQuery:({locationSlug})=>{
 queried.push(locationSlug);
 return {data:locationSlug==='missing-location'?null:{menu:{_id:locationSlug,name:locationSlug,slug:locationSlug},items:[{_id:`${locationSlug}-link`,itemType:'custom',label:`${locationSlug} destination`,url:`/${locationSlug}`,depth:0,children:[]}]}};
}}));
mock.module('@/dashboard/registry',()=>({getPageModule:()=>undefined}));
const data={compact:true,config:{footerVariant:'none'},badges:{},to:(path='')=>`/dashboard${path}`,children:'Account body'};
mock.module('@/dashboard/shell/DashboardShellContext',()=>({useDashboardShell:()=>data}));
mock.module('@/dashboard/shell/FullShell',()=>({FullShell:()=>null}));
const menuSurface=(kind,menu)=>createElement('nav',{'data-menu-kind':kind},menu?.items.map(item=>createElement('a',{key:item.id,href:item.url},item.label)));
mock.module('@/components/layout/SiteHeader',()=>({SiteHeader:({menu})=>menuSurface('desktop',menu)}));
mock.module('@/components/layout/MobileNav',()=>({MobileNav:({menu})=>menuSurface('mobile',menu)}));
surfaceState.render=({name,data})=>name==='chrome.header'?menuSurface('desktop',data.menu):name==='chrome.mobileNav'?menuSurface('mobile',data.menu):null;
shellState.mobileNavOpen=true;shellState.closeMobileNav=()=>{};
const failures=[];let checks=0;
for(const pack of ['core','journal','depot','aster-house']){
 const {default:Shell}=await import(`../../templates/packs/${pack}/surfaces/dashboard.shell.tsx`);
 for(const [source,custom,expected] of [['primary','unused','main-links'],['secondary','unused','alternate-links'],['custom','  campaign-links  ','campaign-links'],['custom',' ','main-links'],['custom','missing-location',null]]){
  config={...structuredClone(HEADER_DEFAULTS),navigation:{...HEADER_DEFAULTS.navigation,menuSource:source,customLocation:custom}};
  queried.length=0;
  const dom=new JSDOM(renderToStaticMarkup(createElement(Shell,{data})));
  try{
   for(const kind of ['desktop','mobile']){
    const nav=dom.window.document.querySelector(`[data-menu-kind="${kind}"]`);
    assert.ok(nav,`${pack}: ${kind} surface exists`);
    assert.deepEqual([...nav.querySelectorAll('a')].map(a=>a.getAttribute('href')),expected?[`/${expected}`]:[],`${pack}/${source}/${custom}: ${kind} uses selected menu`);
   }
   assert.deepEqual(queried,[expected??'missing-location']);checks++;
  }catch(error){failures.push(error.message);}finally{dom.window.close();}
 }
}
// The same resolver's footer mapping remains independent of header selection.
const {useMenuForLocation}=await import('@/hooks/layout/useMenuForLocation');
function FooterProbe(){return menuSurface('footer',useMenuForLocation('footer-1'));}
for(const menuSource of ['primary','secondary','custom']){
 config.navigation.menuSource=menuSource;
 assert.ok(renderToStaticMarkup(createElement(FooterProbe)).includes('href="/footer-links"'));checks++;
}
assert.equal(failures.length,0,failures.join('\n'));console.log(JSON.stringify({menuSourceChecks:checks}));
