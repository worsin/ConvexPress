import {test,expect} from "bun:test";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {JSDOM}=createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
import {act} from "react";
import {createRoot} from "react-dom/client";
import {useWindowScopeSelection} from "./useWindowScopeSelection";
import type {ScopeSelection} from "./components/ScopeSwitcher";
const a:ScopeSelection={organizationId:"org-a",businessId:"business-a",websiteId:"website-a",instanceId:"staging-a"};
const b:ScopeSelection={organizationId:"org-b",businessId:"business-b",websiteId:"website-b",instanceId:"live-b"};
test("two open windows retain independent scope when their shared server preference changes",async()=>{
 const dom=new JSDOM('<div id="a"></div><div id="b"></div>'),names=['window','document','HTMLElement','IS_REACT_ACT_ENVIRONMENT','sessionStorage'],saved=names.map(name=>Object.getOwnPropertyDescriptor(globalThis,name));
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 const memory=new Map<string,string>();Object.defineProperty(globalThis,'sessionStorage',{value:{getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>memory.set(key,value)},configurable:true,writable:true});
 const first=createRoot(dom.window.document.getElementById('a')!),second=createRoot(dom.window.document.getElementById('b')!);
 function Window({seed,storageKey}:{seed:ScopeSelection|undefined;storageKey:string}){const [selection,commit]=useWindowScopeSelection(seed,storageKey);return <><output>{selection.websiteId??'none'}</output><button onClick={()=>commit(b)}>Switch locally</button></>;}
 try{
  await act(async()=>{first.render(<Window storageKey="first:operator-1" key="operator-1" seed={undefined}/>);second.render(<Window storageKey="second:operator-1" seed={a}/>);});
  expect(dom.window.document.querySelector('#a output')!.textContent).toBe('none');
  await act(async()=>first.render(<Window storageKey="first:operator-1" key="operator-1" seed={a}/>));
  await act(async()=>{(dom.window.document.querySelector('#b button') as HTMLButtonElement).click();});
  await act(async()=>{first.render(<Window storageKey="first:operator-1" key="operator-1" seed={b}/>);second.render(<Window storageKey="second:operator-1" seed={b}/>);});
  expect(dom.window.document.querySelector('#a output')!.textContent).toBe('website-a');expect(dom.window.document.querySelector('#b output')!.textContent).toBe('website-b');
  // A reload/remount keeps this window's saved scope even after another window updated the launch preference.
  await act(async()=>first.render(<Window storageKey="first:operator-1" key="reloaded" seed={b}/>));expect(dom.window.document.querySelector('#a output')!.textContent).toBe('website-a');
  await act(async()=>first.render(<Window storageKey="first:operator-2" key="operator-2" seed={b}/>));expect(dom.window.document.querySelector('#a output')!.textContent).toBe('website-b');
 }finally{await act(async()=>{first.unmount();second.unmount();});dom.window.close();names.forEach((name,index)=>{const previous=saved[index];if(previous)Object.defineProperty(globalThis,name,previous);else Reflect.deleteProperty(globalThis,name);});}
});
