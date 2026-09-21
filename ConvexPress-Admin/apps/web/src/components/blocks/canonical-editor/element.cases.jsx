import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { act } from "react";
import { loadStaged } from "../schema-editor/test-harness";
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
async function setup(selectOverride) {
 const dom = new JSDOM('<div id="root"></div>', {url:"https://editor.example.invalid"}), previous={};
 for (const key of ["window","document","navigator","HTMLElement","HTMLInputElement","HTMLTextAreaElement","HTMLSelectElement","Event","MouseEvent","IS_REACT_ACT_ENVIRONMENT"]) {
  previous[key]=Object.getOwnPropertyDescriptor(globalThis,key);
  Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==="IS_REACT_ACT_ENVIRONMENT"?true:dom.window[key]});
 }
 const loaded=await loadStaged("../canonical-editor/element.fixture.ts"),m=loaded.module;
 const {createRoot}=await import("react-dom/client"), root=createRoot(document.getElementById("root"));
 const scope={websiteKey:"studio",instanceKey:"staging"}, installation={...scope,deploymentOrigin:"https://stage.convex.cloud"};
 const policy={enabledPlugins:[],capabilities:["tree.children"],disabledBlocks:[]};
 const blocks=[m.canonicalEditorAdapter(policy,"journal").createBlock("core/heading")];
 const read={contract:"canonical-document-v1",scope,document:{id:"page",type:"page",title:"Original title",status:"draft",path:"/page",blocksVersion:2,revision:3,digest:m.canonicalContentDigest("Original title",blocks),blocks},presentation:{packId:"journal",revision:"b".repeat(64)},policy,data:await m.resolveCanonicalData(blocks,scope,policy,async()=>({page:null})),resources:{media:{}}};
 const made=m.starterDefinition("Studio services","studio-services");let saved;const writes=[],requests=[],selections=[],dirty=[];
 const save=async(args)=>{writes.push(args);const value=JSON.parse(args.definitionJson);saved={id:"definition",name:value.spec.name,version:1,lastVersion:1,generation:1,status:"draft",versionStatus:"draft",activeVersion:null,definitionJson:made.json,digest:made.digest};return {id:saved.id,name:saved.name,version:1,generation:1,digest:saved.digest};};
 const clients={creation:{compose:async(args)=>{requests.push(args);return{definitionJson:made.json,digest:made.digest,fingerprint:"review-context"};},create:save,accept:save,get:async()=>saved,options:async()=>({page:[],cursor:null})},workbench:{get:async()=>saved,history:async()=>({versions:[],nextBeforeVersion:null}),review:async()=>{saved={...saved,generation:2,status:"active",versionStatus:"active",activeVersion:1};return{version:1};}}};
 const snapshot=()=>({scope:installation,definitions:[{name:saved.name,version:saved.version,digest:saved.digest,definitionJson:saved.definitionJson}]});
 const client={get:async()=>read,save:async()=>{throw Error("Unexpected page save");},listCustomBlocks:async()=>{throw Error("Unexpected library scan");},selectCustomBlock:async(args)=>{selections.push(args);return selectOverride?selectOverride(snapshot()):snapshot();}};
 let props={documentKey:{...scope,documentId:"page",generation:"one"},read,client,pickResource:async()=>null,onDirtyChange:value=>dirty.push(value),elementCreation:{clients,scope:installation,canAi:true,canMedia:false,canEdit:true,canRestore:false,canApprove:true,renderPreview:()=> <p>Website preview control</p>}};
 const render=async(next={})=>{props={...props,...next};await act(async()=>root.render(<m.CanonicalDocumentWorkspace {...props}/>));};
 const button=name=>[...document.querySelectorAll("button")].find(n=>n.textContent===name);
 const click=async(name)=>{expect(button(name)).toBeDefined();await act(async()=>button(name).click());};
 const input=async(label,value)=>{const el=[...document.querySelectorAll("label")].find(n=>n.textContent.trim()===label)?.control;expect(el).toBeTruthy();await act(async()=>{const proto=el.tagName==="TEXTAREA"?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(el,value);el.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});};
 await render();
 const prepare=async()=>{await click("Create");await click("Describe an element");await input("Block name","studio-services");await input("Describe your block","An editorial services section");await click("Generate block proposal");await click("Save reviewed draft");};
 const approve=async()=>{await click("Review approval");await click("Confirm approval");};
 const outline=()=>document.querySelector('nav[aria-label="Page outline"]').textContent;
 return {render,click,input,button,prepare,approve,outline,read,writes,requests,selections,dirty,close:async()=>{await act(async()=>root.unmount());dom.window.close();await loaded.cleanup();for(const key of Object.keys(previous)){if(previous[key])Object.defineProperty(globalThis,key,previous[key]);else delete globalThis[key];}}};
}
test("describe, review, approve and insert use active template and preserve unsaved page edits with Undo",async()=>{
 const f=await setup();try{
  await f.input("Document title","Unsaved title");const before=f.outline();
  await f.prepare();expect(f.requests[0].packId).toBe("journal");expect(f.writes).toHaveLength(1);expect(f.outline()).toBe(before);
  await f.click("Add approved element");expect(f.selections).toHaveLength(0);expect(document.body.textContent).toContain("Approve a saved version");
  await f.approve();await f.input("Document title","Edited during creation");await f.click("Add approved element");
  expect(f.outline()).toContain("Studio services");expect(f.selections[0].expectedRevision).toBe(3);expect(f.selections[0].expectedScope).toEqual({websiteKey:"studio",instanceKey:"staging"});
  expect(document.querySelector('label input').value).toBe("Edited during creation");
  await f.click("Undo");expect(f.outline()).toBe(before);expect(document.querySelector('label input').value).toBe("Edited during creation");expect(f.read.document.revision).toBe(3);expect(f.writes).toHaveLength(1);
 }finally{await f.close();}
});
test("a pending approved insertion cannot cross a changed saved revision",async()=>{
 let release;const f=await setup(value=>new Promise(resolve=>{release=()=>resolve(value);}));try{
  await f.prepare();await f.approve();const before=f.outline();await f.click("Add approved element");expect(f.button("Adding element…").disabled).toBe(true);
  await f.render({read:{...f.read,document:{...f.read.document,revision:4}}});await act(async()=>release());expect(f.outline()).toBe(before);expect(f.writes).toHaveLength(1);
 }finally{await f.close();}
});
test("a pending selection from another installation is refused without losing page edits",async()=>{
 const f=await setup(value=>({...value,scope:{...value.scope,websiteKey:"another-site"}}));try{
  await f.prepare();await f.approve();await f.input("Document title","Keep these edits");const before=f.outline();await f.click("Add approved element");expect(f.outline()).toBe(before);expect(document.body.textContent).toContain("Your page edits are preserved");expect(document.querySelector('label input').value).toBe("Keep these edits");
 }finally{await f.close();}
});
