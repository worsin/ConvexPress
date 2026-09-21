import {test,expect} from "bun:test";
import {act} from "react";
import {createRequire} from "node:module";
import hero from "../../../../../../../blocks/commerce/product-hero/render";
import {CollectionCartProvider} from "./collection-cart";
const require=createRequire(import.meta.url),{JSDOM}=createRequire(require.resolve('isomorphic-dompurify'))('jsdom');
test("product hero cart sends exactly its selected product and surfaces failure then successful retry",async()=>{
 const dom=new JSDOM('<div id="app"></div>',{url:'https://collection.invalid',pretendToBeVisual:true});
 dom.window.HTMLElement.prototype.scrollTo=function(options){this.scrollLeft=options.left??0;};
 const names=['window','document','navigator','HTMLElement','Element','Node','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT'];
 const old=names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]);
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('app'));
 const product={id:"cup",title:"Studio cup",href:"/products/cup",excerpt:null,createdAt:1,image:null,pricing:null,rating:null,cart:{kind:"add",productId:"cup"}};
 let finish;const calls=[],host={ready:true,busy:null,add:(...args)=>{calls.push(args);return new Promise(resolve=>finish=resolve);}};
 const View=hero.View;
 try{
  await act(async()=>root.render(<CollectionCartProvider value={host}><View attrs={{product:"cup",title:"A slower morning."}} data={{items:[product],groups:[]}} resources={{media:{}}}/></CollectionCartProvider>));
  const button=[...document.querySelectorAll('button')].find(el=>el.textContent.includes('Add to cart'));
  await act(async()=>{button.click();button.click();});
  expect(calls).toEqual([["cup","Studio cup"]]);expect(button.disabled).toBe(true);
  await act(async()=>finish(false));expect(document.querySelector('[role=status]').textContent).toContain('Could not add');expect(button.disabled).toBe(false);
  await act(async()=>button.click());expect(calls).toEqual([["cup","Studio cup"],["cup","Studio cup"]]);
  await act(async()=>finish(true));expect(document.querySelector('[role=status]').textContent).toBe('Added to cart');
  expect(document.querySelectorAll('article')).toHaveLength(1);
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [name,descriptor] of old){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
});
