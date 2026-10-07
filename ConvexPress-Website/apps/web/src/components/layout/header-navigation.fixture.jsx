import assert from 'node:assert/strict';
import {createElement,act} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
import {identity,HEADER_DEFAULTS} from './header-render.fixture-support.jsx';
const child={id:'child',type:'custom',label:'First guide',url:'/first-guide',depth:1,children:[]};
const menu={id:'nav',name:'Study navigation',items:[{id:'guides',type:'heading',label:'Guides',url:'',depth:0,children:[child,{id:'topics',type:'heading',label:'Topics',url:'',depth:1,children:[{id:'deep',type:'custom',label:'Deep guide',url:'/deep-guide',depth:2,children:[]}]}]},{id:'about',type:'custom',label:'About',url:'/about',depth:0,children:[]}]};
const failures=[];let checks=0;
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://example.org/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
dom.window.document.addEventListener('click',event=>event.preventDefault());
const {createRoot}=await import('react-dom/client');
for(const pack of ['core','journal','depot','aster-house']){
 const {default:Header}=await import(`../../templates/packs/${pack}/surfaces/chrome.header.tsx`);
 const config=structuredClone(HEADER_DEFAULTS);config.layout.sticky='none';config.search.enabled=false;config.userMenu.enabled=false;config.darkModeToggle.enabled=false;
 const render=()=>createElement(Header,{data:{siteIdentity:identity,menu,headerConfig:config}});
 const styles=[];
 for(const style of ['inline','pills','underline']){
  config.navigation.style=style;const html=new JSDOM(renderToStaticMarkup(render()));
  styles.push(html.window.document.querySelector('nav a[href="/about"]').className);html.window.close();
 }
 try{assert.equal(new Set(styles).size,3,`${pack}: all3 navigation styles must alter the actual About link`);checks++;}catch(e){failures.push(e.message);}
 for(const dropdownStyle of ['flyout','mega']){
  config.navigation.dropdownStyle=dropdownStyle;
  const root=createRoot(dom.window.document.querySelector('#root'));await act(async()=>root.render(render()));
  try{
   const buttons=[...dom.window.document.querySelectorAll('nav button')];
   if(pack==='depot'&&dropdownStyle==='mega'){
    assert.ok(buttons.some(b=>b.textContent==='All'),`${pack}: Mega must retain the department overview`);checks++;
   }else{
    const trigger=buttons.find(b=>b.textContent==='Guides');assert.ok(trigger,`${pack}/${dropdownStyle}: heading must expose its child submenu`);
    await act(async()=>trigger.click());
    assert.ok(dom.window.document.querySelector('a[href="/first-guide"]'),`${pack}/${dropdownStyle}: opening reveals the authored child`);
    const submenu=dom.window.document.querySelector('[data-slot="nav-dropdown"]');
    assert.equal(submenu.classList.contains('grid'),dropdownStyle==='mega',`${pack}: selected dropdown arrangement must reach its rendered submenu`);
    await act(async()=>trigger.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(!!dom.window.document.querySelector('a[href="/first-guide"]'),false,`${pack}: Escape closes submenu`);
    await act(async()=>trigger.click());
    await act(async()=>dom.window.document.querySelector('a[href="/first-guide"]').click());
    assert.equal(!!dom.window.document.querySelector('a[href="/first-guide"]'),false,`${pack}: selecting a destination closes its submenu`);
    await act(async()=>trigger.click());
    await act(async()=>[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent==='Topics').click());
    await act(async()=>dom.window.document.querySelector('a[href="/deep-guide"]').click());
    assert.equal(!!dom.window.document.querySelector('a[href="/deep-guide"]'),false,`${pack}: nested destination selection closes the complete submenu tree`);checks++;
   }
  }catch(e){failures.push(e.message);}finally{await act(async()=>root.unmount());}
 }
}
dom.window.close();assert.equal(failures.length,0,failures.join('\n'));console.log(JSON.stringify({navigationChecks:checks}));
