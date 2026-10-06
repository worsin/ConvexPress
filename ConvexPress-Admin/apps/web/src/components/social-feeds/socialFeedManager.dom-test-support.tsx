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
let allowed=true,refuse=true;
const calls:any[]=[];
mock.module("@backend/convex/_generated/api",()=>({api:anyApi}));
mock.module("@/lib/auth-context",()=>({useAuth:()=>({can:()=>allowed,isLoading:false,user:{_id:"operator"}})}));
mock.module("@/hooks/useUnsavedChangesWarning",()=>({useUnsavedChangesWarning:()=>{}}));
mock.module("@/components/ui/button",()=>({Button:({variant,size,...props}:any)=><button {...props}/>}));
mock.module("@tanstack/react-router",()=>({Link:({to,...props}:any)=><a href={to} {...props}/>}));
mock.module("convex/react",()=>({
 useConvex:()=>({url:"https://site.convex.cloud"}),
 useQuery:()=>({sources:[],approvedMastodonOrigins:["https://mastodon.social"]}),
 useAction:()=>async()=>{throw Error("Unexpected refresh")},
 useMutation:(fn:any)=>async(args:any)=>{assert.equal(getFunctionName(fn),"socialFeeds/sources:create");calls.push(args);if(refuse)throw Error("Ask your site operator to authorize this Instagram professional account for this environment");},
}));
const {SocialFeedManager}=await import("./SocialFeedManager");
const root=createRoot(document.getElementById("app")!);
await act(async()=>root.render(<SocialFeedManager/>));
const select=document.querySelector("select")!;
assert.ok(select,"Provider can be selected");
await act(async()=>{select.value="instagram";select.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
const handle=document.querySelector('input[name="handle"]') as HTMLInputElement;
assert.equal(handle.placeholder,"studio.name");assert.match(handle.parentElement!.textContent!,/Instagram username/);
await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value")!.set!.call(handle,"studio.name");handle.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});
await act(async()=>(document.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
const submit=()=>act(async()=>{document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true}));});
await submit();
assert.deepEqual(calls,[{provider:"instagram",handle:"studio.name",enabled:true}]);
assert.match(document.querySelector('[role="alert"]')!.textContent!,/authorize this Instagram/);
assert.equal(handle.value,"studio.name","Failed configuration preserves the authored handle");
assert.equal(select.value,"instagram");
assert.equal((document.querySelector('input[type="checkbox"]') as HTMLInputElement).checked,true);
assert.equal(document.querySelector('input[type="password"]'),null,"Credentials are not collected in content administration");
refuse=false;await submit();assert.equal(calls.length,2);assert.equal(handle.value,"");assert.match(document.querySelector('[role="status"]')!.textContent!,/Account connected/);
allowed=false;await act(async()=>root.render(<SocialFeedManager/>));assert.equal(document.querySelector("form"),null);assert.match(document.body.textContent!,/do not have permission/);
await act(async()=>root.unmount());dom.window.close();
console.log("Instagram selection, authorized mutation, refusal recovery and permission boundary passed");
