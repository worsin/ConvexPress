import {test,expect} from "bun:test";
import {act} from "react";
import {JSDOM} from "jsdom";
import {renderToStaticMarkup} from "react-dom/server";
import {ConvexProvider} from "convex/react";
import {getFunctionName} from "convex/server";
import {ProductionRsvpProvider,RsvpDraftScope} from "./rsvp-production";
import {RsvpBody,RsvpView} from "./rsvp";
import {rsvpIdentityKey,subscribeRsvp} from "./rsvp-client";
import {demoRsvp} from "../../../../block-demo/rsvp-adapter";
async function inDom(run){
 const dom=new JSDOM('<div id="root"></div>',{url:"https://example.test/page/join-us",pretendToBeVisual:true});Object.defineProperty(dom.window.navigator,"locks",{value:{request:async(_key,callback)=>callback()}});
 const keys=["window","document","HTMLElement","HTMLInputElement","IS_REACT_ACT_ENVIRONMENT"],previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,IS_REACT_ACT_ENVIRONMENT:true});
 const {createRoot}=await import("react-dom/client"),root=createRoot(document.getElementById("root"));
 try{await run(root,dom);}finally{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,previous);}
}
function fixture(initial=demoRsvp()){
 let result=initial,finish,fail;const queries=[],writes=[];
 const client={url:"https://fixture.convex.cloud",watchQuery(fn,args){const item={name:getFunctionName(fn),args,stopped:false,update:()=>{}};queries.push(item);return{localQueryResult:()=>result,onUpdate(callback){item.update=callback;return()=>{item.stopped=true;};}};},mutation(fn,args){writes.push({name:getFunctionName(fn),args});return new Promise((resolve,reject)=>{finish=resolve;fail=reject;});},action(fn,args){writes.push({name:getFunctionName(fn),args});return new Promise((resolve,reject)=>{finish=resolve;fail=reject;});}};
 const view=({generation="one",signedIn=false,postId=initial.postId,instanceKey="stage"}={})=><ConvexProvider client={client}><RsvpDraftScope key={generation}><ProductionRsvpProvider instanceKey={instanceKey} postId={postId} generation={generation} signedIn={signedIn} password="page-proof"><RsvpBody data={{eventId:initial.eventId,blockId:initial.blockId,rsvp:initial,asOf:initial.asOf,nextChangeAt:initial.nextChangeAt}}/></ProductionRsvpProvider></RsvpDraftScope></ConvexProvider>;
 return{client,initial,queries,writes,view,set(value){result=value;},notify(){for(const q of queries)if(!q.stopped)q.update();},finish(value){finish(value);},fail(error){fail(error);}};
}
test("RSVP server rendering is inert and current document identity gates the production host",async()=>{
 const f=fixture();expect(renderToStaticMarkup(f.view())).toContain("Preview only");expect(f.queries).toHaveLength(0);expect(f.writes).toHaveLength(0);
 await inDom(async root=>{await act(async()=>root.render(f.view({postId:"different"})));expect(f.queries).toHaveLength(0);await act(async()=>root.render(f.view()));expect(f.queries[0].args).toMatchObject({postId:f.initial.postId,blockId:f.initial.blockId,instanceKey:"stage",password:"page-proof"});expect(window.localStorage.length).toBe(0);expect(f.writes).toHaveLength(0);});
});
test("RSVP form validates contact and guards duplicate submission while a write is pending",async()=>{
 await inDom(async root=>{let calls=0,finish;const initial=demoRsvp(),submit=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};await act(async()=>root.render(<RsvpView snapshot={initial} onRegister={submit}/>));await act(async()=>document.querySelector('button[type="submit"]').click());expect(calls).toBe(0);expect(document.body.textContent).toContain("valid email");await act(async()=>root.render(<RsvpView snapshot={initial} contact={{name:"Guest",email:"guest@example.invalid"}} onRegister={submit}/>));await act(async()=>{document.querySelector('button[type="submit"]').click();document.querySelector('button[type="submit"]').click();});expect(calls).toBe(1);expect(document.querySelector('button[type="submit"]').disabled).toBe(true);await act(async()=>finish());expect(document.body.textContent).not.toContain("Your place is reserved");});
});
test("cancellation uses the current revision and historical receipt cannot revive a reservation",async()=>{
 const initial={...demoRsvp(),registration:{status:"confirmed",revision:3,name:"Guest",email:"guest@example.invalid"},canCancel:true},f=fixture(initial);
 await inDom(async root=>{await act(async()=>root.render(f.view({signedIn:true})));await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==="Cancel my reservation").click());expect(f.writes).toHaveLength(0);await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==="Confirm cancellation").click());expect(f.writes).toHaveLength(1);expect(f.writes[0].args).toMatchObject({operation:"cancel",expectedRevision:3,instanceKey:"stage"});expect(f.writes[0].args.contact).toBeUndefined();expect(f.writes[0].args.visitorToken).toBeUndefined();f.set({...initial,registration:{...initial.registration,status:"cancelled",revision:4},canCancel:false});await act(async()=>f.finish({status:"confirmed",revision:1}));expect(document.body.textContent).toContain("Your reservation was cancelled");expect(document.body.textContent).not.toContain("You’re on the list");});
});
test("signed-in RSVP links return to the page containing the form",async()=>{const initial={...demoRsvp(),state:"sign-in-required",responsePolicy:"signedIn"},f=fixture(initial);await inDom(async root=>{await act(async()=>root.render(f.view()));expect([...document.querySelectorAll('a')].find(a=>a.textContent==="Sign in").getAttribute('href')).toBe('/login?returnTo=%2Fpage%2Fjoin-us');});});
test("RSVP subscription clears contact details on expiry, source substitution and revocation",()=>{
 const initial=demoRsvp();let now=0,result={...initial,asOf:1000,nextChangeAt:1020,registration:{status:"confirmed",revision:1,name:"Private guest",email:"private@example.invalid"},canCancel:true},callback,scheduled,expired=0;const values=[];
 const watch={localQueryResult:()=>result,onUpdate(fn){callback=fn;return()=>{};}},timers={now:()=>now,schedule(fn){scheduled=fn;return 1;},cancel(){}};
 const stop=subscribeRsvp(watch,initial,value=>values.push(value),()=>expired++,timers);expect(values.at(-1).registration.email).toBe("private@example.invalid");now=21;scheduled();expect(values.at(-1)).toBeNull();expect(expired).toBe(1);stop();
 result={...initial,eventId:"different"};const end=subscribeRsvp(watch,initial,value=>values.push(value),()=>{},timers);expect(values.at(-1)).toBeNull();result=null;callback();expect(values.at(-1)).toBeNull();end();
});
test("guest RSVP identity is stable across placements and isolated by website environment",()=>{
 expect(rsvpIdentityKey("https://one.convex.cloud","stage","event")).toBe(rsvpIdentityKey("https://one.convex.cloud","stage","event"));expect(rsvpIdentityKey("https://one.convex.cloud","stage","event")).not.toBe(rsvpIdentityKey("https://one.convex.cloud","production","event"));expect(rsvpIdentityKey("https://one.convex.cloud","stage","event")).not.toBe(rsvpIdentityKey("https://two.convex.cloud","stage","event"));
});

test("an unconfirmed RSVP cancellation retries the same request and waits for authoritative state",async()=>{
 const initial={...demoRsvp(),registration:{status:"confirmed",revision:1,name:"Guest",email:"guest@example.invalid"},canCancel:true},f=fixture(initial);
 await inDom(async root=>{
  await act(async()=>root.render(f.view({signedIn:true})));
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Cancel my reservation').click());
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm cancellation').click());
  const first=f.writes[0].args;
  await act(async()=>f.fail(new Error('Connection lost after dispatch')));
  expect(document.body.textContent).toContain('Your place is reserved.');
  expect(f.writes).toHaveLength(1);
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm cancellation').click());
  expect(f.writes).toHaveLength(2);expect(f.writes[1].args).toEqual(first);
  f.set({...initial,registration:{...initial.registration,status:'cancelled',revision:2},canCancel:false});
  await act(async()=>f.finish({status:'cancelled',revision:2}));
  expect(document.body.textContent).toContain('Your reservation was cancelled.');
 });
});
test("a late RSVP acknowledgement cannot restore private state after the document session changes",async()=>{
 const initial={...demoRsvp(),registration:{status:'confirmed',revision:1,name:'Previous visitor',email:'previous@example.invalid'},canCancel:true},f=fixture(initial);
 await inDom(async root=>{
  await act(async()=>root.render(f.view({signedIn:true})));
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Cancel my reservation').click());
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm cancellation').click());
  f.set(null);await act(async()=>root.render(f.view({signedIn:false,generation:'new-session'})));
  expect(f.queries[0].stopped).toBe(true);expect(document.body.textContent).not.toContain('previous@example.invalid');
  const queries=f.queries.length;await act(async()=>f.finish({status:'cancelled',revision:2}));
  expect(f.queries).toHaveLength(queries);expect(f.writes).toHaveLength(1);expect(document.body.textContent).not.toContain('previous@example.invalid');
  expect(document.body.textContent).toContain('This RSVP is not currently available.');
 });
});

test("generated event RSVPs use stable endpoints and reject a substituted provider response",async()=>{
 const initial={...demoRsvp(),providerId:"community-events",href:"/community-events/studio-morning",registration:{status:"confirmed",revision:1,name:"Guest",email:"guest@example.invalid"},canCancel:true},f=fixture(initial);
 await inDom(async root=>{
  await act(async()=>root.render(f.view({signedIn:true})));
  expect(f.queries[0].name).toBe("canonicalRsvp:get");
  await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==="Cancel my reservation").click());
  await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==="Confirm cancellation").click());
  expect(f.writes[0].name).toBe("canonicalRsvp:submit");expect(f.writes[0].args.providerId).toBeUndefined();
  f.set({...initial,providerId:"events",href:"/events/studio-morning"});
  await act(async()=>f.finish({status:"cancelled",revision:2}));
  expect(document.body.textContent).toContain("This RSVP is not currently available");
  expect(document.body.textContent).not.toContain("guest@example.invalid");
 });
});
