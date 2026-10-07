import {test,expect,mock} from 'bun:test';
import {act} from 'react';
import {JSDOM} from 'jsdom';
let state, calls;
mock.module('../../../hooks/useAssistantConfig',()=>({useAssistantConfig:()=>({displayName:'Test assistant',promptChips:'off'})}));
mock.module('./AssistantBlocks',()=>({AssistantBlocks:()=>null}));
mock.module('./useAssistant',()=>({useAssistant:()=>state}));
const {AssistantRail}=await import('./AssistantRail');

test('composer preserves unavailable, failed, busy and newer drafts and clears a completed draft',async()=>{
 const dom=new JSDOM('<div id="app"></div>',{url:'https://shop.invalid'}),saved=new Map();
 for(const key of ['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT']){
  saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
  Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
 }
 dom.window.HTMLElement.prototype.scrollTo=()=>{};
 calls=[];state={ready:false,sending:false,sessionToken:'owned',messages:[],memory:[],brief:{blocks:[],loading:false},send:()=>new Promise(resolve=>calls.push(resolve))};
 const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('app'));
 const render=()=>act(async()=>root.render(<AssistantRail kind="catalog" active/>));
 try{
  await render();const input=document.querySelector('textarea'),form=document.querySelector('form'),button=document.querySelector('[aria-label="Send"]');
  const type=async text=>act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(input,text);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  const submit=()=>act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  await type('Keep this draft');expect(button.disabled).toBe(true);await submit();expect(calls).toHaveLength(0);expect(input.value).toBe('Keep this draft');
  state.ready=true;await render();await submit();expect(calls).toHaveLength(1);expect(input.value).toBe('Keep this draft');
  await act(async()=>calls[0](false));expect(input.value).toBe('Keep this draft');
  state.sending=true;await render();await submit();expect(calls).toHaveLength(1);expect(input.value).toBe('Keep this draft');
  state.sending=false;await render();await submit();await type('Newer draft');await act(async()=>calls[1](true));expect(input.value).toBe('Newer draft');
  await submit();await act(async()=>calls[2](true));expect(input.value).toBe('');
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});
