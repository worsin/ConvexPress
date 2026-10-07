import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mock} from 'bun:test';
import {identity,HEADER_DEFAULTS,shellState,surfaceState,settingsState,navigationEvents} from './header-render.fixture-support.jsx';
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://example.org/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
mock.module('@/components/search/SearchSuggestions',()=>({SearchSuggestions:()=>null}));
const {createElement,act}=await import('react');
const {createRoot}=await import('react-dom/client');
const {fireEvent}=await import('@testing-library/dom');
const failures=[];let checks=0;
for(const pack of ['core','journal','depot','aster-house']){
 const {default:Header}=await import(`../../templates/packs/${pack}/surfaces/chrome.header.tsx`);
 const {default:Overlay}=await import(`../../templates/packs/${pack}/surfaces/chrome.searchOverlay.tsx`);
 surfaceState.render=props=>props.name==='chrome.searchOverlay'?createElement(Overlay,props):null;
 for(const variant of ['inline','icon','expandable']){
  const config=structuredClone(HEADER_DEFAULTS);config.layout.sticky='none';config.userMenu.enabled=false;config.darkModeToggle.enabled=false;
  config.search={enabled:true,variant,placeholder:`Find in ${pack}`};shellState.searchOpen=false;
  const root=createRoot(document.querySelector('#root'));
  const render=()=>root.render(createElement(Header,{data:{siteIdentity:identity,headerConfig:config}}));
  shellState.toggleSearch=()=>{shellState.searchOpen=!shellState.searchOpen;render();};
  shellState.closeSearch=()=>{shellState.searchOpen=false;render();};
  await act(async()=>render());
  try{
   const trigger=()=>document.querySelector('button[aria-label="Toggle search"]');
   if(variant==='inline'){
    assert.ok(document.querySelector('input[type="search"]'),`${pack}: inline field must be immediately available`);
    assert.equal(!!trigger(),false,`${pack}: inline must not require opening an overlay`);
   }else{
    assert.equal(!!document.querySelector('input[type="search"]'),false,`${pack}/${variant}: field starts closed`);
    assert.ok(trigger(),`${pack}/${variant}: has a search trigger`);
    await act(async()=>trigger().click());
    assert.ok(document.querySelector('input[type="search"]'),`${pack}/${variant}: trigger reveals field`);
    assert.equal(!!document.querySelector('[data-slot="search-overlay"]'),variant==='icon',`${pack}: expandable stays in header; icon uses pack surface`);
    assert.equal(document.activeElement.tagName,'INPUT',`${pack}/${variant}: opening focuses search`);
   }
   for(const input of document.querySelectorAll('input[type="search"]')) assert.equal(input.placeholder,config.search.placeholder,`${pack}/${variant}: configured placeholder`);
   const input=document.querySelector('input[type="search"]');
   await act(async()=>fireEvent.input(input,{target:{value:'  '}}));
   const before=navigationEvents.length;
   await act(async()=>fireEvent.submit(input.closest('form')));
   assert.equal(navigationEvents.length,before,'empty query must not navigate');
   for(const commerce of [false,true]){
    settingsState.plugins.commerceEnabled=commerce;await act(async()=>render());
    if(variant!=='inline'&&!document.querySelector('input[type="search"]')) await act(async()=>trigger().click());
    const field=document.querySelector('input[type="search"]');
    await act(async()=>fireEvent.input(field,{target:{value:'  helpful guide  '}}));
    await act(async()=>fireEvent.submit(field.closest('form')));
    assert.deepEqual(navigationEvents.at(-1),{to:commerce?'/products':'/search',search:{q:'helpful guide'}},`${pack}/${variant}: trim and correct search route`);
    if(variant!=='inline')assert.equal(!!document.querySelector('input[type="search"]'),false,'submitted search closes');
   }
   if(variant!=='inline'){
    await act(async()=>trigger().click());
    await act(async()=>fireEvent.keyDown(document.activeElement,{key:'Escape'}));
    assert.equal(!!document.querySelector('input[type="search"]'),false,`${pack}/${variant}: Escape closes`);
   }
   config.search.enabled=false;await act(async()=>render());
   assert.equal(!!document.querySelector('input[type="search"]'),false,'disabled hides field');assert.equal(!!trigger(),false,'disabled hides trigger');checks++;
  }catch(e){failures.push(e.message);}finally{settingsState.plugins={};await act(async()=>root.unmount());}
 }
}
dom.window.close();assert.equal(failures.length,0,failures.join('\n'));console.log(JSON.stringify({searchChecks:checks}));
