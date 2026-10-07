import {test,expect} from 'bun:test';
import {act} from 'react';
import {JSDOM} from 'jsdom';
import {AssistantCartAction} from './AssistantCartAction';

test('cart action exposes the exact quantity and requires a click, retaining the same action for retries',async()=>{
 const dom=new JSDOM('<div id="app"></div>'),saved=new Map();
 for(const key of ['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT']){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});}
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('app'));
 const calls=[],block={type:'cart_proposal',id:'exact-action',productId:'notebook',quantity:2,title:'Notebook',added:false},product={inStock:true,price:{amount:2400,currencyCode:'USD'}};
 const onConfirm=id=>new Promise(resolve=>calls.push({id,resolve}));
 try{
  await act(async()=>root.render(<AssistantCartAction block={block} product={product} onConfirm={onConfirm}/>));
  expect(calls).toHaveLength(0);expect(document.body.textContent).toContain('2 × Notebook');expect(document.body.textContent).toContain('$24.00 each');
  const button=document.querySelector('button');expect(button.getAttribute('aria-label')).toBe('Add 2 Notebook to cart');
  await act(async()=>{button.click();button.click();});expect(calls).toHaveLength(1);expect(button.disabled).toBe(true);
  await act(async()=>calls[0].resolve(false));expect(button.disabled).toBe(false);
  await act(async()=>button.click());expect(calls[1].id).toBe(calls[0].id);
  await act(async()=>calls[1].resolve(true));expect(button.disabled).toBe(true);expect(button.textContent).toBe('Added to cart');
 }finally{await act(async()=>root.unmount());dom.window.close();for(const[key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});
