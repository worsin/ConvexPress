import {test,expect} from "bun:test";
import {createRequire} from "node:module";
import {act} from "react";
import {ConvexProvider} from "convex/react";
import {getFunctionName} from "convex/server";
import {SavedProductButton} from "./SavedProductButton";
const require=createRequire(import.meta.url);
const {JSDOM}=createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
async function inDom(run){
 const dom=new JSDOM('<div id="root"></div>',{url:"https://example.test/products/mug",pretendToBeVisual:true});
 const names=["window","document","HTMLElement","IS_REACT_ACT_ENVIRONMENT"],old=Object.fromEntries(names.map(k=>[k,globalThis[k]]));
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const {createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"));
 try{await run(root);}finally{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,old);}
}
function fixture(){
 const values=new Map(),watches=[],writes=[];let connection={isWebSocketConnected:true},onConnection=()=>{},finish;
 const key=args=>`${args.productId}:${args.paginationOpts.cursor??"first"}`;
 const client={logger:{warn(){}},connectionState:()=>connection,subscribeToConnectionState(fn){onConnection=fn;return()=>{};},
  watchQuery(fn,args){const watch={name:getFunctionName(fn),args,stopped:false,update:()=>{}};watches.push(watch);return {localQueryResult:()=>values.get(key(args)),onUpdate(fn){watch.update=fn;return()=>{watch.stopped=true;};}};},
  mutation(fn,args){writes.push({name:getFunctionName(fn),args});return new Promise(resolve=>{finish=resolve;});}};
 return {watches,writes,set(product,cursor,value){values.set(`${product}:${cursor??"first"}`,value);},notify(){for(const w of watches)if(!w.stopped)w.update();},offline(){connection={isWebSocketConnected:false};onConnection();},finish(){finish("done");},view(product="product-a",generation="session-a"){return <ConvexProvider client={client}><SavedProductButton key={`${product}:${generation}`} instanceKey="site-a" productId={product}/></ConvexProvider>;}};
}
const empty=(done=true,cursor="")=>({page:[],isDone:done,continueCursor:cursor});
const found={page:[{state:"saved",wishlistId:"list-a",itemId:"item-a"}],isDone:true,continueCursor:""};
test("heart remains disabled through empty intermediate pages and removes the later saved match",async()=>{
 const f=fixture();f.set("product-a",null,empty(false,"next"));
 await inDom(async root=>{
  await act(async()=>root.render(f.view()));
  expect(f.watches.some(w=>w.args.paginationOpts.cursor==="next")).toBe(true);
  expect(document.querySelector("button").disabled).toBe(true);expect(document.querySelector("button").getAttribute("aria-label")).toBe("Checking saved products");
  f.set("product-a","next",found);await act(async()=>f.notify());
  const button=document.querySelector("button");expect(button.disabled).toBe(false);expect(button.getAttribute("aria-pressed")).toBe("true");
  await act(async()=>{button.click();button.click();});expect(f.writes).toHaveLength(1);expect(f.writes[0]).toEqual({name:"commerceWishlists/mutations:removeItem",args:{itemId:"item-a"}});
  await act(async()=>f.finish());
 });
});
test("absence becomes actionable only after exhaustion, and product changes reset the pending operation",async()=>{
 const f=fixture();f.set("product-a",null,empty());
 await inDom(async root=>{
  await act(async()=>root.render(f.view()));expect(document.querySelector("button").getAttribute("aria-label")).toBe("Add to wishlist");
  await act(async()=>document.querySelector("button").click());expect(f.writes[0].name).toBe("commerceWishlists/mutations:addItem");
  await act(async()=>root.render(f.view("product-b","session-b")));expect(document.querySelector("button").getAttribute("aria-label")).toBe("Checking saved products");
  await act(async()=>f.finish());expect(document.querySelector("button").disabled).toBe(true);expect(f.writes).toHaveLength(1);
 });
});
test("offline and unavailable results hide saved status and prevent actions",async()=>{
 const f=fixture();f.set("product-a",null,found);
 await inDom(async root=>{
  await act(async()=>root.render(f.view()));expect(document.querySelector("button").getAttribute("aria-pressed")).toBe("true");
  await act(async()=>f.offline());expect(document.querySelector("button").getAttribute("aria-pressed")).toBe("false");expect(document.querySelector("button").disabled).toBe(true);
  await act(async()=>document.querySelector("button").click());expect(f.writes).toHaveLength(0);
 });
 const revoked=fixture();revoked.set("product-a",null,{...empty(),page:[{state:"unavailable"}]});
 await inDom(async root=>{await act(async()=>root.render(revoked.view()));expect(document.querySelector("button").getAttribute("aria-label")).toBe("Wishlist unavailable");expect(document.querySelector("button").disabled).toBe(true);});
});
