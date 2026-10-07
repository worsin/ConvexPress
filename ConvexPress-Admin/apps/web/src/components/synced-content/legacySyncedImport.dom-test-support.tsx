import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {anyApi,getFunctionName} from "convex/server";
const require=createRequire(import.meta.url);
const {mock}=require("bun:test");
const {JSDOM}=createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
const dom=new JSDOM('<!doctype html><div id="app"></div>',{url:"http://localhost"});
for(const name of ["window","document","HTMLElement","HTMLInputElement","Element","Node","navigator"])Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:Reflect.get(dom.window,name)});
Object.defineProperty(globalThis,"IS_REACT_ACT_ENVIRONMENT",{configurable:true,value:true});
const {act}=await import("react");
const {createRoot}=await import("react-dom/client");
let digest="first",refuse=true,locked=false,selected="";
const calls:any[]=[];
mock.module("@backend/convex/_generated/api",()=>({api:anyApi}));
mock.module("@/hooks/useUnsavedChangesWarning",()=>({useUnsavedChangesWarning:()=>{}}));
mock.module("@/components/ui/button",()=>({Button:({variant,size,...props}:any)=><button {...props}/>}));
mock.module("@/components/blocks/schema-editor/SchemaBlockForm",()=>({SchemaBlockForm:()=>null}));
mock.module("convex/react",()=>({
 useConvex:()=>({query:async(fn:any)=>{assert.equal(getFunctionName(fn),"syncedBlocks/legacy:review");return {digest,sources:[{legacyId:"old",title:"Saved source",published:false,locked:true,targetId:digest==="first"?null:"existing",blocks:[]}]};}}),
 usePaginatedQuery:()=>({status:"Exhausted",results:[{id:"old",title:"Saved source",published:false,locked:true}]}),
 useMutation:(fn:any)=>async(args:any)=>{assert.equal(getFunctionName(fn),"syncedBlocks/legacy:apply");calls.push(args);if(refuse)throw Error("The source graph changed. Review again.");return {id:"existing",created:0,reused:1};},
}));
const {LegacySyncedImport}=await import("./LegacySyncedImport");
const root=createRoot(document.getElementById("app")!);const lock=(value:boolean)=>{locked=value;};
await act(async()=>root.render(<LegacySyncedImport scope={{websiteKey:"site",instanceKey:"stage"}} disabled={false} lock={lock} onImported={id=>{selected=id;}}/>));
const button=(label:string)=>[...document.querySelectorAll("button")].find(b=>b.textContent===label)!;
assert.equal(button("Review import").disabled,true);const select=document.querySelector("select")!;
await act(async()=>{select.value="old";select.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
await act(async()=>button("Review import").click());assert.equal(locked,true);assert.equal(select.disabled,true);
await act(async()=>button("Confirm import").click());assert.equal(selected,"");assert.equal(locked,false);assert.match(document.querySelector('[role="alert"]')!.textContent!,/changed/);assert.equal(button("Confirm import"),undefined);assert.equal(select.value,"old");
digest="second";refuse=false;
await act(async()=>button("Review import").click());assert.match(document.body.textContent!,/Already imported/);
await act(async()=>button("Confirm import").click());assert.equal(selected,"existing");assert.equal(locked,false);
assert.deepEqual(calls,[{legacyId:"old",expectedDigest:"first"},{legacyId:"old",expectedDigest:"second"}]);
await act(async()=>root.unmount());dom.window.close();console.log("legacy import review recovery passed");
