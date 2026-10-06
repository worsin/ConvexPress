import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><header data-slot="site-header"></header><div id="root"></div>',{url:'https://example.org/',pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,NodeFilter:dom.window.NodeFilter,DocumentFragment:dom.window.DocumentFragment,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle.bind(dom.window),requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true});
dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
const {identity}=await import('./header-render.fixture-support.jsx');
const {createElement,act}=await import('react');
const {createRoot}=await import('react-dom/client');
const {fireEvent}=await import('@testing-library/dom');
let headerBottom=64;document.querySelector('header').getBoundingClientRect=()=>({bottom:headerBottom});
document.addEventListener('click',e=>e.preventDefault());
const menu={id:'fixture',name:'Fixture',items:[{id:'first',type:'custom',label:'First destination',url:'/first',depth:0,children:[]},{id:'last',type:'custom',label:'Last destination',url:'/last',depth:0,children:[]}]};
const failures=[];let checks=0;
for(const pack of ['core','journal','depot','aster-house']){
 const {default:MobileNav}=await import(`../../templates/packs/${pack}/surfaces/chrome.mobileNav.tsx`);
 const signatures=[];
 for(const variant of ['drawer','fullscreen','dropdown'])for(const drawerSide of ['left','right']){
  let open=true;const root=createRoot(document.querySelector('#root'));
  const render=()=>root.render(createElement(MobileNav,{data:{siteIdentity:identity,menu,config:{variant,drawerSide},userMenu:{enabled:false},open,onClose:()=>{open=false;render();}}}));
  try{
   await act(async()=>{render();});await act(async()=>new Promise(resolve=>window.requestAnimationFrame(resolve)));const panel=document.querySelector('[data-slot="mobile-nav"]');assert.ok(panel,`${pack}: panel renders`);
   if(drawerSide==='left')signatures.push(panel.className+panel.getAttribute('style'));
   assert.equal(panel.getAttribute('role'),'dialog',`${pack}: dialog semantics`);
   assert.ok(panel.contains(document.activeElement),`${pack}/${variant}: opening moves focus inside`);
   if(variant==='dropdown'){
    assert.equal(panel.style.top,'64px',`${pack}: dropdown starts beneath the visible header`);
    headerBottom=92;await act(async()=>window.dispatchEvent(new dom.window.Event('resize')));
    assert.equal(panel.style.top,'92px',`${pack}: dropdown follows header resize`);headerBottom=64;
   }
   await act(async()=>fireEvent.keyDown(document.activeElement,{key:'Escape'}));assert.equal(open,false,`${pack}/${variant}: Escape closes`);
   open=true;await act(async()=>render());const link=document.querySelector('[data-slot="mobile-nav"] a[href="/last"]');assert.ok(link);await act(async()=>link.click());assert.equal(open,false,`${pack}/${variant}: destination closes menu`);
   open=true;await act(async()=>render());const brand=document.querySelector('[data-slot="mobile-nav"] a[href="/"]');await act(async()=>brand.click());assert.equal(open,false,`${pack}/${variant}: brand closes menu even on the homepage`);checks++;
  }catch(e){failures.push(e.message);}finally{await act(async()=>root.unmount());}
 }
 try{assert.equal(new Set(signatures).size,3,`${pack}: three menu variants must have distinct geometry`);}catch(e){failures.push(e.message);}
}
dom.window.close();assert.equal(failures.length,0,failures.join('\n'));console.log(JSON.stringify({mobileMenuChecks:checks}));
