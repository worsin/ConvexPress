import assert from 'node:assert/strict';import{mock}from'bun:test';import{createElement}from'react';import{renderToStaticMarkup}from'react-dom/server';import{JSDOM}from'jsdom';import{identity,HEADER_DEFAULTS}from'./header-render.fixture-support.jsx';
mock.module('@/hooks/layout/useMenuForLocation',()=>({useMenuForLocation:()=>undefined}));
const failures=[];let checks=0;
for(const pack of['core','journal','depot','aster-house']){
 const{default:Header}=await import(`../../templates/packs/${pack}/surfaces/chrome.header.tsx`);const config=structuredClone(HEADER_DEFAULTS);config.topBar={enabled:true,leftContent:'contact',rightContent:'announcement',email:'contact@example.org',announcementText:'Pick this announcement'};config.cta={enabled:true,label:'Pick this CTA',url:'/pick',style:'filled'};config.userMenu.guestDisplay='login-only';config.darkModeToggle={enabled:true,variant:'switch'};
 for(const variant of['icon','inline']){config.search.variant=variant;const dom=new JSDOM(renderToStaticMarkup(createElement(Header,{data:{siteIdentity:identity,headerConfig:config}})));const doc=dom.window.document;
  const cases=[['[data-slot="top-bar-left"] a','header.topBar.leftContent'],['[data-slot="top-bar-right"] p','header.topBar.rightContent'],['a[href="/pick"]','header.cta.label'],['[role="switch"]','header.darkModeToggle.variant'],['a[href="/login"]','header.userMenu.guestDisplay'],['button[aria-label="Open navigation menu"]','header.mobileMenu.variant'],[variant==='icon'?'button[aria-label="Toggle search"]':'input[type="search"]',variant==='icon'?'header.search.variant':'header.search.placeholder']];
  for(const[selector,expected]of cases){try{assert.equal(doc.querySelector(selector)?.closest('[data-customize]')?.getAttribute('data-customize'),expected,`${pack}/${variant}/${selector}`);checks++;}catch(e){failures.push(e.message);}}dom.window.close();
 }
}
assert.equal(failures.length,0,failures.join('\n'));console.log(JSON.stringify({targetChecks:checks}));
