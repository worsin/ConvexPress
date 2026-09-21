import {test,expect} from "bun:test";
import {act} from "react";
import {renderToString} from "react-dom/server";
import {createRequire} from "node:module";
import {useStoredProductHistory,useRecordStoredProductView,PRODUCT_HISTORY_CHANGED} from "../../../hooks/product-history-state";
import {productHistoryKey,recordProductVisit,PRODUCT_HISTORY_MAX_AGE} from "../../../lib/commerce/product-history";
const require=createRequire(import.meta.url),{JSDOM}=createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
async function fixture(run) {
 const dom=new JSDOM('<div id="app"></div>',{url:'https://history.invalid',pretendToBeVisual:true});
 const names=['window','document','navigator','HTMLElement','Element','Node','MutationObserver','getComputedStyle','IS_REACT_ACT_ENVIRONMENT'];
 const old=names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]);
 for(const name of names)Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[name]});
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('app'));
 try {await run({dom,root});} finally {await act(async()=>root.unmount());dom.window.close();for(const [name,descriptor] of old){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
}
const scope=(viewerKey="anonymous",instanceKey="stage")=>productHistoryKey({backendUrl:"https://fixture.convex.cloud",instanceKey,viewerKey});
test("product history hydrates after mount and masks every old account/site render before reading the new scope",async()=>fixture(async({root,dom})=>{
 const a=scope("user:a"),b=scope("user:b"),other=scope("user:b","other-site");
 recordProductVisit(dom.window.localStorage,a,"cup");recordProductVisit(dom.window.localStorage,b,"journal");recordProductVisit(dom.window.localStorage,other,"lamp");
 const frames=[];
 function View({historyKey,enabled=true}) {const value=useStoredProductHistory(historyKey,enabled);frames.push({historyKey,...value});return <output>{JSON.stringify(value)}</output>;}
 let reads=0;const getItem=dom.window.Storage.prototype.getItem;dom.window.Storage.prototype.getItem=function(...args){reads++;return getItem.apply(this,args);};
 expect(renderToString(<View historyKey={a}/>)).not.toContain("cup");expect(reads).toBe(0);
 await act(async()=>root.render(<View historyKey={a}/>));expect(frames.at(-1).ids).toEqual(["cup"]);
 frames.length=0;await act(async()=>root.render(<View historyKey={b}/>));
 expect(frames[0]).toMatchObject({ids:[],ready:false});expect(frames.every(frame=>!frame.ids.includes("cup"))).toBe(true);expect(frames.at(-1).ids).toEqual(["journal"]);
 frames.length=0;await act(async()=>root.render(<View historyKey={other}/>));
 expect(frames[0]).toMatchObject({ids:[],ready:false});expect(frames.every(frame=>!frame.ids.includes("journal"))).toBe(true);expect(frames.at(-1).ids).toEqual(["lamp"]);
 frames.length=0;await act(async()=>root.render(<View historyKey={null}/>));expect(frames.every(frame=>frame.ids.length===0&&!frame.ready)).toBe(true);
 const before=reads;await act(async()=>root.render(<View historyKey={a} enabled={false}/>));expect(reads).toBe(before);expect(frames.at(-1)).toMatchObject({ids:[],ready:true});
}));
test("real detail visits notify the current tab, cross-tab removal refreshes, and unrelated storage stays isolated",async()=>fixture(async({root,dom})=>{
 const key=scope(),other=scope("user:other");let value;
 function View({id=null}){value=useStoredProductHistory(key);useRecordStoredProductView(key,id);return <output>{value.ids.join(",")}</output>;}
 await act(async()=>root.render(<View/>));expect(dom.window.localStorage.getItem(key)).toBeNull();
 await act(async()=>root.render(<View id="cup"/>));expect(value.ids).toEqual(["cup"]);
 await act(async()=>root.render(<View id="journal"/>));expect(value.ids).toEqual(["journal","cup"]);
 recordProductVisit(dom.window.localStorage,key,"lamp");
 await act(async()=>dom.window.dispatchEvent(new dom.window.StorageEvent("storage",{key:other})));expect(value.ids).toEqual(["journal","cup"]);
 await act(async()=>dom.window.dispatchEvent(new dom.window.StorageEvent("storage",{key})));expect(value.ids).toEqual(["lamp","journal","cup"]);
 dom.window.localStorage.removeItem(key);
 await act(async()=>dom.window.dispatchEvent(new dom.window.StorageEvent("storage",{key:null})));expect(value.ids).toEqual([]);
 recordProductVisit(dom.window.localStorage,key,"cup");await act(async()=>dom.window.dispatchEvent(new dom.window.CustomEvent(PRODUCT_HISTORY_CHANGED,{detail:key})));expect(value.ids).toEqual(["cup"]);
}));
test("history expires while the page is idle and denied storage leaves a usable empty history",async()=>fixture(async({root,dom})=>{
 const key=scope();let value;
 dom.window.localStorage.setItem(key,JSON.stringify({version:1,visits:[{id:"cup",viewedAt:Date.now()-PRODUCT_HISTORY_MAX_AGE+80}]}));
 function View({historyKey=key}){value=useStoredProductHistory(historyKey);return <output>{value.ids.join(",")}</output>;}
 await act(async()=>root.render(<View/>));expect(value.ids).toEqual(["cup"]);
 await act(async()=>new Promise(resolve=>setTimeout(resolve,110)));expect(value.ids).toEqual([]);
 Object.defineProperty(dom.window,"localStorage",{configurable:true,get(){throw new Error("Storage denied");}});
 await act(async()=>root.render(<View historyKey={scope("user:denied")}/>));expect(value).toEqual({ids:[],ready:true});
}));
