import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {identity,HEADER_DEFAULTS} from './header-render.fixture-support.jsx';
export const layoutCases=[];
const menu={id:'layout',name:'Layout links',items:[{id:'about',type:'custom',label:'About',url:'/about',depth:0,children:[]}]};
const failures=[];let checks=0;
for(const pack of ['core','journal','depot','aster-house']){
 const {default:Header}=await import(`../../templates/packs/${pack}/surfaces/chrome.header.tsx`);
 for(const[field,values]of Object.entries({style:['standard','centered','split'],height:['compact','normal','tall'],background:['solid','transparent','glass'],bottomBorder:['none','subtle','bold','shadow']})){
  const markup=[];
  for(const value of values){
   const config=structuredClone(HEADER_DEFAULTS);config.layout[field]=value;config.layout.sticky='none';config.userMenu.enabled=false;config.darkModeToggle.enabled=false;config.search.enabled=false;config.cta.enabled=true;config.cta.label='Contact';
   const html=renderToStaticMarkup(createElement(Header,{data:{siteIdentity:identity,menu,headerConfig:config,layoutConfig:{stickyHeader:false}}}));
   markup.push(html);layoutCases.push({pack,field,value,html});
   if(field==='style'){
    const dom=new JSDOM(html);const order=[...dom.window.document.querySelectorAll('[data-slot="site-brand"],nav[aria-label="Primary navigation"],[data-slot="header-actions"]')].map(e=>e.tagName==='NAV'?'nav':e.dataset.slot);
    const expected=value==='split'?['nav','site-brand','header-actions']:value==='centered'||pack==='depot'?['site-brand','header-actions','nav']:['site-brand','nav','header-actions'];
    try{assert.deepEqual(order,expected,`${pack}/${value}: visual layout must retain matching reading order`);checks++;}catch(e){failures.push(e.message);}dom.window.close();
   }
  }
  try{assert.equal(new Set(markup).size,values.length,`${pack}/${field}: changing a visible field must reach the real header consumer`);checks++;}catch(e){failures.push(e.message);}
 }
}
assert.equal(failures.length,0,failures.join('\n'));
console.log(JSON.stringify({layoutChecks:checks,renderedCases:layoutCases.length}));
