import assert from 'node:assert/strict';
import {mock} from 'bun:test';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.org/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
let listener;const media={matches:false,addEventListener(_type,fn){listener=fn;},removeEventListener(){listener=undefined;}};
window.matchMedia=()=>media;
mock.module('@/hooks/layout/useScrollState',()=>({useScrollState:()=>({isScrolled:false,showBackToTop:false})}));
const {createElement,useContext,act}=await import('react');const {createRoot}=await import('react-dom/client');
const {LayoutShellProvider,LayoutShellContext,getBackgroundInertProps}=await import('./LayoutShellProvider');
function Body(){const shell=useContext(LayoutShellContext);return createElement('main',getBackgroundInertProps(shell.mobileNavOpen),createElement('button',{onClick:shell.toggleMobileNav},'Menu'));}
const root=createRoot(document.querySelector('#root'));await act(async()=>root.render(createElement(LayoutShellProvider,null,createElement(Body))));
await act(async()=>document.querySelector('button').click());assert.equal(document.querySelector('main').hasAttribute('inert'),true,'open menu makes background inert');
await act(async()=>{media.matches=true;listener?.({matches:true});});assert.equal(document.querySelector('main').hasAttribute('inert'),false,'crossing desktop breakpoint releases the background');
await act(async()=>{media.matches=false;listener?.({matches:false});});assert.equal(document.querySelector('main').hasAttribute('inert'),false,'returning to mobile does not reopen menu');
await act(async()=>root.unmount());assert.equal(listener,undefined,'breakpoint listener cleaned up');dom.window.close();console.log('desktopResizePassed');
