import {test,expect} from "bun:test";
import {act} from "react";
import {createRequire} from "node:module";
import collection from "../../../../../../../blocks/blocks/product-collection/render";
import {CollectionCartProvider} from "./collection-cart";
const require=createRequire(import.meta.url),{JSDOM}=createRequire(require.resolve('isomorphic-dompurify'))('jsdom');
test("collection cart control sends the displayed product once, reports success and supports keyboard groups",async()=>{
 const dom=new JSDOM('<div id="app"></div>',{url:'https://collection.invalid',pretendToBeVisual:true});
 dom.window.HTMLElement.prototype.scrollTo=function(options){this.scrollLeft=options.left??0;};
 const names=['window','document','navigator','HTMLElement','Element','Node','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT'];
 const old=names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]);
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('app'));
 const product={id:"cup",title:"Studio cup",href:"/products/cup",excerpt:null,createdAt:1,image:null,pricing:null,rating:null,cart:{kind:"add",productId:"cup"}};
 let finish;const calls=[],host={ready:true,busy:null,add:(...args)=>{calls.push(args);return new Promise(resolve=>finish=resolve);}};
 const View=collection.View;
 try{
  await act(async()=>root.render(<CollectionCartProvider value={host}><View attrs={{productIds:["cup"],showPrice:false,showAddToCart:true,groups:[{label:"Kitchen",productIds:["cup"]}]}} data={{items:[product],groups:[{index:0,items:[product]}]}} resources={{media:{}}}/></CollectionCartProvider>));
  const button=[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Add to cart'));
  await act(async()=>{button.click();button.click();});
  expect(calls).toEqual([["cup","Studio cup"]]);expect(button.disabled).toBe(true);
  await act(async()=>finish(true));expect(document.querySelector('[role=status]').textContent).toBe('Added to cart');
  const tab=document.querySelector('[role=tab]');
  await act(async()=>tab.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
  expect(document.activeElement.textContent).toBe('Kitchen');expect(document.activeElement.getAttribute('aria-selected')).toBe('true');
  expect(document.querySelectorAll('article')).toHaveLength(1);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [name,descriptor] of old){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
});
