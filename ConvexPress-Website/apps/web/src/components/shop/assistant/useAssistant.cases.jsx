import { test, expect, mock } from "bun:test";
import { act, StrictMode } from "react";
import { JSDOM } from "jsdom";
import { getFunctionName } from "convex/server";

let identity, auth, runtime, cartState, current, briefCalls, sends, errors;
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return {promise,resolve,reject}; };
const respond = args => { const pending=deferred(); sends.push({args,...pending}); return pending.promise; };
const briefAction = args => { const pending=deferred(); briefCalls.push({args,...pending}); return pending.promise; };
const mutate = async () => undefined;
mock.module("convex/react", () => ({
  useConvexAuth: () => auth,
  useAction: ref => getFunctionName(ref).endsWith(":respond") ? respond : briefAction,
  useMutation: () => mutate,
  useQuery: (ref,args) => args === "skip" ? undefined : getFunctionName(ref).endsWith(":getThread") ? {session:null,messages:[]} : [],
}));
mock.module("../../../hooks/useCart", () => ({useCart: () => cartState}));
mock.module("../../../lib/auth/clerk", () => ({useAuth: () => identity}));
mock.module("../../../lib/site-runtime", () => ({getSiteRuntime: () => runtime}));
mock.module("sonner", () => ({toast:{error:message => errors.push(message)}}));
const {useAssistant} = await import("./useAssistant");
function Probe({active=true}) { current=useAssistant({kind:"cart",active}); return <div>{current.pendingText}{JSON.stringify(current.brief.blocks)}</div>; }
async function fixture() {
  identity={isLoaded:true,isSignedIn:true,userId:"one",sessionId:"auth-one"};
  auth={isLoading:false,isAuthenticated:true}; runtime={convexUrl:"https://one.convex.cloud",instanceKey:"staging"};
  cartState={sessionToken:"cart-one",cart:{items:[{productId:"cup",quantity:1}]}};
  briefCalls=[];sends=[];errors=[];
  const dom=new JSDOM('<div id="app"></div>',{url:'https://shop.invalid'}),saved=new Map();
  for(const key of ['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT']) {
    saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom.window[key]});
  }
  let timerId=0, mounted=true; const timers=new Map();
  dom.window.setTimeout=callback=>{timers.set(++timerId,callback);return timerId;};
  dom.window.clearTimeout=id=>timers.delete(id);
  const {createRoot}=await import('react-dom/client'), root=createRoot(document.getElementById('app'));
  const render=(active=true)=>act(async()=>root.render(<StrictMode><Probe active={active}/></StrictMode>));
  await render();
  return {render,
    flush:()=>act(async()=>{const queued=[...timers.values()];timers.clear();for(const callback of queued)callback();}),
    changeAccount:async()=>{identity={...identity,userId:'two',sessionId:'auth-two'};cartState={...cartState,sessionToken:'cart-two'};await render();},
    unmount:async()=>{await act(async()=>root.unmount());mounted=false;},
    cleanup:async()=>{if(mounted)await act(async()=>root.unmount());dom.window.close();for(const [key,value] of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}},
  };
}
const recommendation=text=>({blocks:[{type:'text',markdown:text}]});

test('cached recommendations disappear when the shopper changes with the same cart contents',async()=>{
  const f=await fixture();try{
    await f.flush();await act(async()=>briefCalls[0].resolve(recommendation('Private first-shopper context')));
    expect(current.brief.blocks).toHaveLength(1);
    await f.changeAccount();expect(current.brief.blocks).toEqual([]);
  }finally{await f.cleanup();}
});

for(const change of ['account-return','environment','inactive','auth-revocation']) test(`delayed recommendations cannot return after ${change}`,async()=>{
  const f=await fixture();try{
    await f.flush();const old=briefCalls[0];
    if(change==='account-return'){await f.changeAccount();identity={...identity,userId:'one',sessionId:'auth-one'};cartState={...cartState,sessionToken:'cart-one'};await f.render();}
    else if(change==='environment'){runtime={...runtime,instanceKey:'live'};await f.render();}
    else if(change==='inactive')await f.render(false);
    else {auth={isLoading:false,isAuthenticated:false};await f.render();}
    await act(async()=>old.resolve(recommendation('Obsolete context')));
    expect(current.brief.blocks).toEqual([]);
  }finally{await f.cleanup();}
});

test('an older cart recommendation cannot overwrite the newer cart result',async()=>{
  const f=await fixture();try{
    await f.flush();cartState={...cartState,cart:{items:[{productId:'cup',quantity:2}]}};
    await f.render();await f.flush();expect(briefCalls).toHaveLength(2);
    await act(async()=>briefCalls[1].resolve(recommendation('Two cups')));
    await act(async()=>briefCalls[0].resolve(recommendation('One cup')));
    expect(current.brief.blocks).toEqual(recommendation('Two cups').blocks);
  }finally{await f.cleanup();}
});

for(const change of ['variant','price','total']) test(`recommendations refresh when ${change} changes without a quantity change`,async()=>{
  const f=await fixture();try{
    await f.flush();await act(async()=>briefCalls[0].resolve(recommendation('Previous cart')));
    const line=cartState.cart.items[0];
    cartState={...cartState,cart:change==='total'?{...cartState.cart,totalAmount:2400}:{...cartState.cart,items:[{...line,...(change==='variant'?{variantId:'large'}:{unitPriceAmount:2400,lineTotalAmount:2400})}]}};
    await f.render();expect(current.brief.blocks).toEqual([]);
    await f.flush();expect(briefCalls).toHaveLength(2);
    await act(async()=>briefCalls[1].resolve(recommendation('Updated cart')));
    expect(current.brief.blocks).toEqual(recommendation('Updated cart').blocks);
    await f.render();await f.flush();expect(briefCalls).toHaveLength(2);
  }finally{await f.cleanup();}
});

test('old send completion cannot clear or block the next shopper pending message',async()=>{
  const f=await fixture();try{
    await act(async()=>{void current.send('First shopper');});expect(sends).toHaveLength(1);
    await f.changeAccount();expect(current.pendingText).toBeNull();expect(current.sending).toBe(false);
    await act(async()=>{void current.send('Second shopper');});expect(sends).toHaveLength(2);
    await act(async()=>sends[0].reject(Error('Old shopper failure')));
    expect(errors).toEqual([]);expect(current.sending).toBe(true);expect(current.pendingText).toBe('Second shopper');
    await act(async()=>sends[1].resolve({}));expect(current.sending).toBe(false);expect(current.pendingText).toBeNull();
  }finally{await f.cleanup();}
});

test('unmounted assistant cannot emit a late failure notification',async()=>{
  const f=await fixture();try{
    await act(async()=>{void current.send('Before leaving');});await f.unmount();
    await act(async()=>sends[0].reject(Error('Obsolete failure')));expect(errors).toEqual([]);
  }finally{await f.cleanup();}
});

test('current send failure remains visible and permits a successful retry without duplicate dispatch',async()=>{
  const f=await fixture();try{
    await act(async()=>{void current.send('Current question');void current.send('Duplicate');});expect(sends).toHaveLength(1);
    await act(async()=>sends[0].reject(Error('Please try again')));expect(errors).toEqual(['Please try again']);expect(current.sending).toBe(false);
    await act(async()=>{void current.send('Current question');});expect(sends).toHaveLength(2);
    await act(async()=>sends[1].resolve({}));expect(current.sending).toBe(false);
  }finally{await f.cleanup();}
});
