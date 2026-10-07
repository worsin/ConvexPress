import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mock} from 'bun:test';
import {identity,HEADER_DEFAULTS} from './header-render.fixture-support.jsx';
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://example.org/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
mock.module('@/hooks/layout/useMenuForLocation',()=>({useMenuForLocation:()=>({items:[{id:'social',label:'Github',url:'https://github.com/example',children:[]}]})}));
const {createElement,act}=await import('react');const {createRoot}=await import('react-dom/client');
const failures=[];let topBarChecks=0,themeChecks=0,actionChecks=0;
for(const pack of ['core','journal','depot','aster-house']){
 const {default:Header}=await import(`../../templates/packs/${pack}/surfaces/chrome.header.tsx`);
 const config=structuredClone(HEADER_DEFAULTS);config.layout.sticky='none';config.userMenu.enabled=false;config.search.enabled=false;config.darkModeToggle.enabled=false;config.logo.enabled=false;
 const root=createRoot(document.querySelector('#root'));const render=()=>root.render(createElement(Header,{data:{siteIdentity:identity,headerConfig:config}}));
 for(const left of ['none','announcement','contact','social'])for(const right of ['none','announcement','contact','social']){
  config.topBar={enabled:true,leftContent:left,rightContent:right,announcementText:'Delivery announcement',email:'contact@example.org',phone:''};await act(async()=>render());
  try{
   const rendered=[...document.querySelectorAll('[data-slot="site-header"] p,[data-slot="site-header"] a')].map(el=>el.getAttribute('aria-label')||el.textContent.trim()).filter(text=>['Delivery announcement','contact@example.org','Github'].includes(text));
   const labels={announcement:'Delivery announcement',contact:'contact@example.org',social:'Github'};
   assert.deepEqual(rendered,[labels[left],labels[right]].filter(Boolean),`${pack} ${left}/${right}: preserve left/right order and independent content`);topBarChecks++;
  }catch(error){failures.push(error.message);}
 }
 config.topBar.enabled=false;
 for(const variant of ['icon','switch']){
  config.darkModeToggle={enabled:true,variant};document.documentElement.classList.remove('dark');localStorage.removeItem('theme');await act(async()=>render());
  try{
   const control=document.querySelector(variant==='switch'?'[role="switch"]':'button[aria-label="Switch to dark mode"]');assert.ok(control,`${pack}: ${variant} control exists`);
   if(variant==='switch')assert.equal(control.getAttribute('aria-checked'),'false');
   await act(async()=>control.click());assert.ok(document.documentElement.classList.contains('dark'));assert.equal(localStorage.getItem('theme'),'dark');
   if(variant==='switch')assert.equal(control.getAttribute('aria-checked'),'true');
   await act(async()=>control.click());assert.ok(!document.documentElement.classList.contains('dark'));assert.equal(localStorage.getItem('theme'),'light');themeChecks++;
  }catch(error){failures.push(error.message);}
 }
 config.darkModeToggle.enabled=false;config.userMenu.enabled=true;
 const styleMarkup=[];
 for(const [style,guestDisplay]of[['filled','login-register'],['outline','login-only'],['ghost','hidden']]){
  config.cta={enabled:true,label:'Open guides',url:'/guides',style};config.userMenu.guestDisplay=guestDisplay;await act(async()=>render());
  try{
   const cta=document.querySelector('a[href="/guides"]');assert.equal(cta?.textContent,'Open guides');styleMarkup.push(cta.className);
   assert.equal(!!document.querySelector('a[href="/login"]'),guestDisplay!=='hidden');assert.equal(!!document.querySelector('a[href="/register"]'),guestDisplay==='login-register');
   assert.equal(!!document.querySelector('[role="switch"],button[aria-label^="Switch to "]'),false);assert.ok(!document.body.textContent.includes('Delivery announcement'));actionChecks++;
  }catch(error){failures.push(`${pack}/${style}: ${error.message}`);}
 }
 assert.equal(new Set(styleMarkup).size,3,`${pack}: distinct CTA styles`);config.cta.enabled=false;config.userMenu.enabled=false;await act(async()=>render());assert.equal(!!document.querySelector('a[href="/guides"],a[href="/login"],a[href="/register"]'),false);await act(async()=>root.unmount());
}
dom.window.close();assert.equal(failures.length,0,failures.join('\n'));console.log(JSON.stringify({topBarChecks,themeChecks,actionChecks}));
