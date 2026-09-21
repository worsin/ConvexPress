import { mock } from 'bun:test';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://example.test/dashboard/community-events'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
const {act,createElement,useEffect}=await import('react');
const {createRoot}=await import('react-dom/client');
let mounts=0,unmounts=0,capability='pending';
function Page({subpath}){useEffect(()=>{mounts++;return()=>{unmounts++;};},[]);return createElement('article',{'data-plugin-page':true},'Community Events'+subpath);}
const module={id:'community-events',Page,matchSubpath:path=>!path||path==='/'};
mock.module('./registry',()=>({getPageModule:id=>id===module.id?module:undefined}));
mock.module('@/components/blog/NotFoundPage',()=>({NotFoundPage:()=>createElement('p',{'data-not-found':true},'Page not found')}));
mock.module('@/hooks/useCan',()=>({useCapabilityAccess:()=>capability}));
const {DashboardShellContext}=await import('./shell/DashboardShellContext');
const {DashboardPage}=await import('./DashboardPage');
const root=createRoot(document.getElementById('root'));
const errors=[],originalError=console.error;console.error=(...args)=>errors.push(args.join(' '));
const definition={id:'community-events',pluginId:'community-events',title:'Community Events',path:'/community-events'};
async function render(pages,id=module.id,subpath=''){
 await act(async()=>root.render(createElement(DashboardShellContext.Provider,{value:{registry:pages===null?null:{pages}}},createElement(DashboardPage,{id,subpath}))));
}
try{
 await render(null);assert.equal(mounts,0,'Plugin page must not mount before the live registry resolves');assert.ok(document.querySelector('[role="status"]'));
 await render([]);assert.equal(mounts,0,'A disabled plugin must not mount through its direct route');assert.ok(document.querySelector('[data-not-found]'));
 await render([definition]);assert.equal(mounts,1);assert.ok(document.querySelector('[data-plugin-page]'));
 await render([]);assert.equal(unmounts,1,'Disabling the owner must unmount an already-open plugin page');assert.equal(document.querySelector('[data-plugin-page]'),null);
 await render([definition]);assert.equal(mounts,2,'Re-enabled page can mount again');
 await render([{...definition,capability:'events.manage'}]);assert.equal(unmounts,2);assert.ok(document.querySelector('[role="status"]'),'Wait for capability resolution without mounting');
 capability='denied';await render([{...definition,capability:'events.manage'}]);assert.equal(mounts,2);assert.ok(document.querySelector('[data-not-found]'));
 capability='allowed';await render([{...definition,capability:'events.manage'}]);assert.equal(mounts,3);
 capability='denied';await render([{...definition,capability:'events.manage'}]);assert.equal(unmounts,3,'Capability revocation unmounts the live page');
 await render([definition],module.id,'/unexpected');assert.equal(mounts,3);assert.ok(document.querySelector('[data-not-found]'));
 await render([{...definition,id:'not-installed'}],'not-installed');assert.match(document.body.textContent,/This page is not available yet/);
 await render(null,'not-installed');assert.ok(document.querySelector('[role="status"]'));
 assert.equal(errors.length,0,errors.join('\n'));
 console.log(JSON.stringify({passed:true,mounts,unmounts,loading:true,disabledDirectRoute:true,reactiveRevocation:true,capabilityGate:true,invalidSubpath:true,missingModule:true}));
}finally{await act(async()=>root.unmount());console.error=originalError;dom.window.close();}
