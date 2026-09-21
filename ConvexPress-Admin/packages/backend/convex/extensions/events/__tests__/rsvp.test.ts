import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import {makeFunctionReference} from "convex/server";
import {v} from "convex/values";
import {internalAction} from "../../../_generated/server";
import schema from "../../../schema";
import {readEventRsvp} from "../../../canonicalDocuments/eventRsvp";
import {resolveCanonicalData,validateCanonicalData} from "../../../canonicalDocuments/foundation/resolve";
import {RequestReadLedger} from "../../../helpers/requestReadLedger";
import {publishedFixture} from "../../../syncedBlocks/__tests__/publishedFixture.test-support";
import {resolvePublishedOccurrences} from "../../../syncedBlocks/occurrences";
const get=makeFunctionReference<"query">("extensions/events/rsvp:get"),submit=makeFunctionReference<"mutation">("extensions/events/rsvp:submit"),verified=makeFunctionReference<"action">("extensions/events/rsvp:submitWithVerification"),prepare=makeFunctionReference<"query">("extensions/events/rsvp:prepareVerification"),writeVerified=makeFunctionReference<"mutation">("extensions/events/rsvp:submitVerified");
const modules={"./convex/canonicalRsvp.ts":()=>import("../../../canonicalRsvp"),"./convex/extensions/events/rsvpOrganizer.ts":()=>import("../rsvpOrganizer"),"./convex/_generated/api.js":()=>import("../../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../../_generated/server.js"),"./convex/extensions/events/rsvp.ts":()=>import("../rsvp"),"./convex/extensions/events/mutations.ts":()=>import("../mutations"),"./convex/membership/policyReads.ts":()=>import("../../../membership/policyReads")};
const visitor="a".repeat(64),other="b".repeat(64);
const organizerList=makeFunctionReference<"query">("extensions/events/rsvpOrganizer:list"),organizerSummary=makeFunctionReference<"query">("extensions/events/rsvpOrganizer:summary"),organizerCancel=makeFunctionReference<"mutation">("extensions/events/rsvpOrganizer:cancel");
async function fixture(capacity:number|null=2){
 const verifications:unknown[]=[];let verify:()=>Promise<{ok:boolean;block:boolean;score:number}>=async()=>({ok:true,block:false,score:0});
 const t=convexTest({schema,modules:{...modules,"./convex/extensions/forms/spam.ts":async()=>({runCaptchaVerification:internalAction({args:{provider:v.string(),token:v.string(),recaptchaMinScore:v.optional(v.number()),failClosed:v.optional(v.boolean())},handler:async(_ctx,args)=>{verifications.push(args);return verify();}})})}});
 const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert("users",{authSource:"local",email:"rsvp@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  const plugin=await ctx.db.insert("settings",{section:"plugins",values:{eventsEnabled:true,formsEnabled:true,membershipEnabled:false},updatedBy:user,updatedAt:1});
  await ctx.db.insert("convexpress_siteIdentity",{identityKey:"site-identity",websiteKey:"rsvp",instanceKey:"rsvp-stage",environmentKind:"staging",deploymentOrigin:"https://rsvp.convex.cloud",managementOrigin:"https://rsvp.convex.site",siteOrigin:"https://rsvp.example.invalid",siteContractVersion:"1",schemaVersion:"1",engineVersion:"1",managementCapabilities:[],initializedAt:1,updatedAt:1});
  const startsAt=Date.now()+86400000,event=await ctx.db.insert("extension_events",{title:"A morning in the studio",slug:"studio-morning",description:"Make something worth keeping.",startsAt,endsAt:startsAt+3600000,timeZone:"America/Denver",venue:"The studio",venueAddress:"",status:"published",rsvp:{mode:"guests",capacity,closesAt:null},createdBy:user,createdAt:1,updatedAt:1});
  const node={id:"rsvp",name:"core/event-rsvp",version:1,attrs:{event}};
  const post=await ctx.db.insert("posts",{type:"page",title:"Join us",slug:"join-us",path:"/join-us",status:"publish",visibility:"public",authorId:user,commentStatus:"closed",publishedAt:1,blocksVersion:2,blocks:[node],createdAt:1,updatedAt:1});
  return{user,plugin,event,post,node,startsAt};
 });
 const target={postId:ids.post,blockId:"rsvp",instanceKey:"rsvp-stage",visitorToken:visitor};
 const initial=await t.query(get,target);
 const args={...target,operation:"register",requestKey:"register-request-0001",definitionVersion:initial.definitionVersion,expectedRevision:0,contact:{name:"Guest Example",email:"guest@example.invalid"}};
 const account=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});
 const read=(extra={})=>t.query(get,{...target,...extra}),send=(extra={})=>t.mutation(submit,{...args,...extra});
 const total=()=>t.run(async ctx=>(await ctx.db.query("event_rsvp_totals").withIndex("by_event",q=>q.eq("eventId",ids.event)).unique())?.confirmed??0);
 const security=(patch:Record<string,unknown>)=>t.run(ctx=>ctx.db.insert("form_security_settings",{key:"global",honeypotEnabled:true,...patch}));
 return{t,ids,target,args,initial,account,read,send,total,security,verifications,setVerification:(fn:typeof verify)=>{verify=fn;}};
}
async function allowOrganizer(f:Awaited<ReturnType<typeof fixture>>){
 return f.t.run(async ctx=>{
  const role=await ctx.db.insert("roles",{name:"Event manager",slug:"event-manager",description:"Fixture",level:80,type:"internal",isDefault:false,isProtected:false,capabilities:["manage_options"],pageAccess:[],status:"active",createdAt:1,updatedAt:1});
  await ctx.db.patch("users",f.ids.user,{roleId:role});return role;
 });
}
test("reusable RSVP placements preserve event-wide uniqueness and withdrawal revokes submission authority",async()=>{
 const f=await fixture();
 const source=await f.t.run(async ctx=>{
  const id=await publishedFixture(ctx,f.ids.user,[f.ids.node]);
  const blocks=["first","second"].map(idValue=>({id:idValue,name:"core/synced",version:1,attrs:{syncedBlock:id,revisionPolicy:"latest"}}));
  await ctx.db.patch("posts",f.ids.post,{blocks});
  const plan=await resolvePublishedOccurrences(ctx,blocks,new RequestReadLedger());
  return {id,blockIds:plan.resolverTree.map(node=>node.id)};
 });
 expect(await f.read()).toBeNull();await expect(f.send()).rejects.toThrow();
 await f.send({blockId:source.blockIds[0]});
 expect((await f.read({blockId:source.blockIds[1]})).registration.status).toBe("confirmed");
 await expect(f.send({blockId:source.blockIds[1],requestKey:"second-synced-placement"})).rejects.toThrow("another tab");
 expect(await f.total()).toBe(1);
 await f.t.run(ctx=>ctx.db.patch("syncedBlocks",source.id,{publishedRevision:undefined}));
 expect(await f.read({blockId:source.blockIds[0]})).toBeNull();
 await expect(f.send({blockId:source.blockIds[0],visitorToken:other,requestKey:"withdrawn-synced-guest"})).rejects.toThrow();
 expect(await f.total()).toBe(1);
});
test("ordinary RSVP blocks enforce current block membership without relying on page restrictions",async()=>{
 const f=await fixture();
 await f.t.run(async ctx=>{
  await ctx.db.patch("settings",f.ids.plugin,{values:{eventsEnabled:true,formsEnabled:true,membershipEnabled:true}});
  await ctx.db.insert("membership_restriction_rules",{resourceType:"block",resourceIdOrKey:"rsvp",ruleMode:"allow_only",planIds:[],loginRequired:true,teaserMode:"hide",createdAt:1,updatedAt:1});
 });
 expect(await f.read()).toBeNull();await expect(f.send()).rejects.toThrow();expect(await f.total()).toBe(0);
});
test("organizer attendee access is current, bounded and excludes visitor identifiers",async()=>{
 const f=await fixture();await f.send();const args={eventId:f.ids.event,status:"confirmed",paginationOpts:{cursor:null,numItems:25}};
 for(const client of [f.t,f.account]){await expect(client.query(organizerList,args)).rejects.toThrow();await expect(client.query(organizerSummary,{eventId:f.ids.event})).rejects.toThrow();}
 const role=await allowOrganizer(f);
 const page=await f.account.query(organizerList,args);expect(page.page).toHaveLength(1);
 expect(Object.keys(page.page[0]).sort()).toEqual(["createdAt","email","id","name","revision","status","updatedAt"]);
 expect(page.page[0].email).toBe("guest@example.invalid");expect(page.isDone).toBe(true);
 expect(await f.account.query(organizerSummary,{eventId:f.ids.event})).toEqual({confirmed:1,capacity:2});
 await expect(f.account.query(organizerList,{...args,paginationOpts:{cursor:null,numItems:51}})).rejects.toThrow("between 1 and 50");
 await f.t.run(ctx=>ctx.db.patch("settings",f.ids.plugin,{values:{eventsEnabled:true,formsEnabled:false}}));
 expect((await f.account.query(organizerList,args)).page).toHaveLength(1);
 await f.t.run(ctx=>ctx.db.patch("roles",role,{capabilities:[]}));
 await expect(f.account.query(organizerList,args)).rejects.toThrow();
});
test("organizer cancellation updates capacity once, preserves retry receipts and refuses stale or cross-event changes",async()=>{
 const f=await fixture(1);await f.send();await allowOrganizer(f);
 const entry=await f.t.run(ctx=>ctx.db.query("event_rsvp_entries").first());
 const args={eventId:f.ids.event,entryId:entry!._id,expectedRevision:1,requestKey:"organizer-cancel-0001"}; // gitleaks:allow -- Synthetic request id for idempotency tests; not a credential.
 await expect(f.t.mutation(organizerCancel,args)).rejects.toThrow();expect(await f.total()).toBe(1);
 const otherEvent=await f.t.run(async ctx=>{const event=(await ctx.db.get("extension_events",f.ids.event))!;const {_id,_creationTime,...fields}=event;return ctx.db.insert("extension_events",{...fields,slug:"other-event"});});
 await expect(f.account.mutation(organizerCancel,{...args,eventId:otherEvent})).rejects.toThrow("for this event");
 const receipt=await f.account.mutation(organizerCancel,args);expect(receipt).toEqual({status:"cancelled",revision:2});expect(await f.total()).toBe(0);
 expect(await f.account.mutation(organizerCancel,args)).toEqual(receipt);expect(await f.total()).toBe(0);
 expect((await f.read()).registration.status).toBe("cancelled");
 await expect(f.account.mutation(organizerCancel,{...args,expectedRevision:2})).rejects.toThrow("another registration change");
 await f.send({expectedRevision:2,requestKey:"register-after-organizer"});expect(await f.total()).toBe(1);
 expect(await f.account.mutation(organizerCancel,args)).toEqual(receipt);expect((await f.read()).registration.revision).toBe(3);expect(await f.total()).toBe(1);
 await expect(f.account.mutation(organizerCancel,{...args,requestKey:"stale-organizer-0001"})).rejects.toThrow("registration changed"); // gitleaks:allow -- Synthetic request id for idempotency tests; not a credential.
 const audit=await f.t.run(ctx=>ctx.db.query("events").take(10));expect(audit).toHaveLength(1);expect(JSON.stringify(audit)).not.toContain("guest@example.invalid");
});
test("organizer listing paginates within one event and refuses cancellation when restored counts are missing",async()=>{
 const f=await fixture();await allowOrganizer(f);await f.send();
 await f.t.run(async ctx=>{for(let i=0;i<54;i++)await ctx.db.insert("event_rsvp_entries",{eventId:f.ids.event,actorHash:`fixture-${i}`,name:`Fixture ${i}`,email:`fixture-${i}@example.invalid`,status:"cancelled",revision:2,createdAt:1,updatedAt:1});});
 const args={eventId:f.ids.event,status:"cancelled",paginationOpts:{cursor:null as string|null,numItems:25}};
 const ids=new Set<string>();let pages=0;
 for(;;){const page=await f.account.query(organizerList,args);pages++;expect(page.page.length).toBeLessThanOrEqual(25);for(const row of page.page){expect(ids.has(row.id)).toBe(false);ids.add(row.id);expect(row.status).toBe("cancelled");}if(page.isDone)break;args.paginationOpts.cursor=page.continueCursor;expect(pages).toBeLessThan(5);}
 expect(ids.size).toBe(54);expect(pages).toBe(3);
 const entry=await f.t.run(async ctx=>{const total=(await ctx.db.query("event_rsvp_totals").first())!;await ctx.db.delete("event_rsvp_totals",total._id);return ctx.db.query("event_rsvp_entries").withIndex("by_event_status",q=>q.eq("eventId",f.ids.event).eq("status","confirmed")).first();});
 await expect(f.account.mutation(organizerCancel,{eventId:f.ids.event,entryId:entry!._id,expectedRevision:1,requestKey:"missing-organizer-count"})).rejects.toThrow("count needs repair");
 expect((await f.t.run(ctx=>ctx.db.get("event_rsvp_entries",entry!._id)))?.status).toBe("confirmed");
});
test("retrying an identical request writes exactly one RSVP and one capacity increment",async()=>{
 const f=await fixture();const receipt=await f.send();expect(receipt).toEqual({status:"confirmed",revision:1});expect(await f.send()).toEqual(receipt);expect(await f.total()).toBe(1);expect((await f.read()).registration).toEqual({status:"confirmed",revision:1,name:"Guest Example",email:"guest@example.invalid"});
 const counts=await f.t.run(async ctx=>({entries:(await ctx.db.query("event_rsvp_entries").take(10)).length,operations:(await ctx.db.query("event_rsvp_operations").take(10)).length}));expect(counts).toEqual({entries:1,operations:1});
});
test("reusing a request key for different details refuses without altering a booking",async()=>{
 const f=await fixture();await f.send();await expect(f.send({contact:{name:"Other name",email:"other@example.invalid"}})).rejects.toThrow("different RSVP details");await expect(f.send({requestKey:"register-request-0002"})).rejects.toThrow("another tab");expect(await f.total()).toBe(1);
});
test("capacity, cancellation and rebooking commit with immutable retry receipts",async()=>{
 const f=await fixture(1);await f.send();expect((await f.read({visitorToken:other})).state).toBe("full");await expect(f.send({visitorToken:other,requestKey:"register-request-other"})).rejects.toThrow("event is full");expect(await f.total()).toBe(1);
 const cancel={...f.args,operation:"cancel",contact:undefined,expectedRevision:1,requestKey:"cancel-request-0001"};expect(await f.t.mutation(submit,cancel)).toEqual({status:"cancelled",revision:2});expect(await f.t.mutation(submit,cancel)).toEqual({status:"cancelled",revision:2});expect(await f.total()).toBe(0);
 expect(await f.send()).toEqual({status:"confirmed",revision:1});expect((await f.read()).registration.status).toBe("cancelled");expect(await f.total()).toBe(0);
 await f.send({visitorToken:other,requestKey:"register-request-other"});expect(await f.total()).toBe(1);await expect(f.send({expectedRevision:2,requestKey:"register-request-0003"})).rejects.toThrow("event is full");
});
test("different guests cannot read or cancel one another's private contact details",async()=>{
 const f=await fixture();await f.send();const view=await f.read({visitorToken:other});expect(view.registration).toBeNull();expect(JSON.stringify(view)).not.toContain("guest@example.invalid");await expect(f.send({visitorToken:other,operation:"cancel",contact:undefined,requestKey:"cancel-request-other",expectedRevision:1})).rejects.toThrow();expect(await f.total()).toBe(1);
});
test("same guest across different block placements cannot reserve a second place",async()=>{
 const f=await fixture();await f.send();await f.t.run(ctx=>ctx.db.patch(f.ids.post,{blocks:[f.ids.node,{...f.ids.node,id:"another-placement"}]}));await expect(f.send({blockId:"another-placement",requestKey:"another-placement-01"})).rejects.toThrow("another tab");expect(await f.total()).toBe(1);
});
test("verified accounts take precedence over browser tokens and sign-in policy excludes guests",async()=>{
 const f=await fixture();await f.account.mutation(submit,f.args);expect((await f.account.query(get,{...f.target,visitorToken:other})).registration.status).toBe("confirmed");expect((await f.read()).registration).toBeNull();
 await f.t.run(ctx=>ctx.db.patch(f.ids.event,{rsvp:{mode:"signedIn",capacity:2,closesAt:null},updatedAt:2}));const guest=await f.read();expect(guest.state).toBe("sign-in-required");await expect(f.send({definitionVersion:guest.definitionVersion})).rejects.toThrow();
});
test("page publication, route membership, ancestor visibility and plugin changes revoke writes and reads",async()=>{
 for(const change of ["draft","route","parent","forms","events"]){
  const f=await fixture();await f.send();await f.t.run(async ctx=>{
   if(change==="draft")await ctx.db.patch(f.ids.post,{status:"draft"});
   if(change==="parent")await ctx.db.patch(f.ids.post,{blocks:[{id:"hidden-parent",name:"core/group",version:1,attrs:{},visibility:"signedIn",children:[f.ids.node]}]});
   if(change==="forms"||change==="events")await ctx.db.patch(f.ids.plugin,{values:{eventsEnabled:change!=="events",formsEnabled:change!=="forms",membershipEnabled:false}});
   if(change==="route"){await ctx.db.patch(f.ids.plugin,{values:{eventsEnabled:true,formsEnabled:true,membershipEnabled:true}});await ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/page/join-us",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1});}
  });expect(await f.read()).toBeNull();await expect(f.send()).rejects.toThrow();expect(await f.total()).toBe(1);
 }
});
test("event route restriction and source instance mismatch expose no RSVP",async()=>{
 const f=await fixture();expect(await f.read({instanceKey:"other-instance"})).toBeNull();await expect(f.send({instanceKey:"other-instance"})).rejects.toThrow();
 await f.t.run(async ctx=>{await ctx.db.patch(f.ids.plugin,{values:{eventsEnabled:true,formsEnabled:true,membershipEnabled:true}});await ctx.db.insert("membership_restriction_rules",{resourceType:"route",resourceIdOrKey:"/events/studio-morning",ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1});});expect(await f.read()).toBeNull();
});
test("changed event settings invalidate new requests but do not replay previously recorded writes",async()=>{
 const f=await fixture();await f.send();await f.t.run(ctx=>ctx.db.patch(f.ids.event,{updatedAt:2,rsvp:{mode:"guests",capacity:2,closesAt:Date.now()-1}}));expect(await f.send()).toEqual({status:"confirmed",revision:1});const current=await f.read();expect(current.state).toBe("closed");expect(current.canCancel).toBe(true);
 await expect(f.send({visitorToken:other,requestKey:"new-event-request-01"})).rejects.toThrow("Event details changed");await expect(f.send({visitorToken:other,requestKey:"new-event-request-02",definitionVersion:current.definitionVersion})).rejects.toThrow("Registration is closed");
 await f.send({operation:"cancel",contact:undefined,requestKey:"cancel-after-close-01",expectedRevision:1,definitionVersion:current.definitionVersion});expect(await f.total()).toBe(0); // gitleaks:allow -- Synthetic request id for idempotency tests; not a credential.
});
test("cancelled events reject registration while permitting the owner to cancel before the start",async()=>{
 const f=await fixture();await f.send();await f.t.run(ctx=>ctx.db.patch(f.ids.event,{status:"cancelled",updatedAt:2}));const current=await f.read();expect(current.state).toBe("cancelled");await expect(f.send({visitorToken:other,requestKey:"cancelled-event-req1",definitionVersion:current.definitionVersion})).rejects.toThrow("Registration is closed");await f.send({operation:"cancel",contact:undefined,requestKey:"cancel-own-entry-01",expectedRevision:1,definitionVersion:current.definitionVersion});expect(await f.total()).toBe(0);
});
test("honeypots, rate limits and invalid contact fields roll back capacity and attendee writes",async()=>{
 const f=await fixture();await expect(f.send({honeypot:"filled"})).rejects.toThrow();await expect(f.send({contact:{name:"",email:"bad"}})).rejects.toThrow("valid email");expect(await f.total()).toBe(0);
 await f.security({perFormLimit:1,rateLimitEnabled:true});await f.send();await expect(f.send({visitorToken:other,requestKey:"rate-limited-request"})).rejects.toThrow("many responses");expect(await f.total()).toBe(1);
});
test("CAPTCHA cannot be bypassed and successful retries never verify or reserve twice",async()=>{
 const f=await fixture();await f.security({captchaEnabled:true,captchaProvider:"turnstile",captchaSiteKey:"synthetic-public-key",skipForLoggedIn:false});await expect(f.send()).rejects.toThrow("verification challenge");expect(await f.total()).toBe(0);
 expect(await f.t.action(verified,{...f.args,captchaToken:"synthetic-proof"})).toEqual({status:"confirmed",revision:1});expect(await f.t.action(verified,{...f.args,captchaToken:"synthetic-proof"})).toEqual({status:"confirmed",revision:1});expect(f.verifications).toHaveLength(1);expect(await f.total()).toBe(1);
});
test("final transaction rechecks CAPTCHA policy and rejects stale proofs",async()=>{
 const f=await fixture();const prepared=await f.t.query(prepare,f.args);await f.security({captchaEnabled:true,captchaProvider:"turnstile",captchaSiteKey:"synthetic-public-key"});await expect(f.t.mutation(writeVerified,{...f.args,verification:{fingerprint:prepared.fingerprint,verifiedAt:Date.now()}})).rejects.toThrow("verification challenge");
 const fresh=await f.t.query(prepare,f.args);await expect(f.t.mutation(writeVerified,{...f.args,verification:{fingerprint:fresh.fingerprint,verifiedAt:Date.now()-31000}})).rejects.toThrow();expect(await f.total()).toBe(0);
});

test("canonical RSVP binds the current document, saved event, installation and refresh deadline",async()=>{
 const f=await fixture();await f.send();
 const scope={websiteKey:"rsvp",instanceKey:"rsvp-stage"};
 const read=(event:string|undefined=f.ids.event,tree:unknown=[f.ids.node],instanceKey="rsvp-stage")=>f.t.run(async ctx=>readEventRsvp(ctx,{event,blockId:"rsvp"},{...scope,instanceKey},{document:(await ctx.db.get("posts",f.ids.post))!,tree}));
 const result=await read();expect(result.rsvp?.eventId).toBe(f.ids.event);expect(result.rsvp?.registration).toBeNull();expect(result.nextChangeAt).toBe(f.ids.startsAt);expect(result.asOf).toBe(result.rsvp?.asOf);
 expect((await read(undefined,[{...f.ids.node,attrs:{}}])).rsvp).toBeNull();
 expect((await read("unsaved-event",[{...f.ids.node,attrs:{event:"unsaved-event"}}])).rsvp).toBeNull();
 expect((await read(f.ids.event,[{...f.ids.node,attrs:{event:"different-event"}}])).rsvp).toBeNull();
 expect((await read(f.ids.event,[f.ids.node],"wrong-installation")).rsvp).toBeNull();
 expect(JSON.stringify(result)).not.toContain("guest@example.invalid");
});

test("canonical planning requires an explicit RSVP reader and rejects substituted results",async()=>{
 const f=await fixture();const scope={websiteKey:"rsvp",instanceKey:"rsvp-stage"},policy={enabledPlugins:["events","forms"],capabilities:["form.submission","reference.targetResolution"],disabledBlocks:[]};
 let reads=0;const params:Parameters<typeof resolveCanonicalData>=[[f.ids.node],scope,policy,async()=>{reads++;return {page:null};}];
 await expect(resolveCanonicalData(...params)).rejects.toThrow("Trusted RSVP reader");expect(reads).toBe(0);
 const result=await f.t.run(async ctx=>readEventRsvp(ctx,{event:f.ids.event,blockId:"rsvp"},scope,{document:(await ctx.db.get("posts",f.ids.post))!,tree:[f.ids.node]}));
 params[35]=async()=>result;const envelope=await resolveCanonicalData(...params);expect(validateCanonicalData([f.ids.node],scope,policy,envelope).dataByBlock.rsvp?.resolver).toBe("events.event");
 params[35]=async()=>({...result,blockId:"another",rsvp:null});await expect(resolveCanonicalData(...params)).rejects.toThrow("source block and event");
 const tampered=structuredClone(envelope);const entry=tampered.dataByBlock.rsvp;if(entry?.resolver!=="events.event")throw new Error("Missing RSVP entry");entry.data={...entry.data,eventId:"another",rsvp:null};expect(()=>validateCanonicalData([f.ids.node],scope,policy,tampered)).toThrow();
});

test("missing capacity state cannot be reset by another visitor after a partial restore",async()=>{
 const f=await fixture(1);await f.send();await f.t.run(async ctx=>{const total=await ctx.db.query("event_rsvp_totals").withIndex("by_event",q=>q.eq("eventId",f.ids.event)).unique();if(total)await ctx.db.delete("event_rsvp_totals",total._id);});
 await expect(f.read({visitorToken:other})).rejects.toThrow("count needs repair");await expect(f.send({visitorToken:other,requestKey:"missing-count-new-01"})).rejects.toThrow("count needs repair");
 expect(await f.t.run(ctx=>ctx.db.query("event_rsvp_entries").take(10))).toHaveLength(1);
});

test("event start revokes cancellation and RSVP reads charge the shared request budget",async()=>{
 const f=await fixture();await f.send();await f.t.run(ctx=>ctx.db.patch("extension_events",f.ids.event,{startsAt:Date.now()-1000,updatedAt:2}));const current=await f.read();expect(current.canCancel).toBe(false);expect(current.state).toBe("closed");await expect(f.send({operation:"cancel",contact:undefined,expectedRevision:1,definitionVersion:current.definitionVersion,requestKey:"cancel-after-start-01"})).rejects.toThrow("event has started");expect(await f.total()).toBe(1);
 const budget=new RequestReadLedger();let reads=0;const original=budget.beforeRead.bind(budget);budget.beforeRead=()=>{reads++;original();};
 await f.t.run(async ctx=>readEventRsvp(ctx,{event:f.ids.event,blockId:"rsvp"},{websiteKey:"rsvp",instanceKey:"rsvp-stage"},{document:(await ctx.db.get("posts",f.ids.post))!,tree:[f.ids.node]},budget));expect(reads).toBeGreaterThan(5);
});


test("stable RSVP dispatcher follows the saved owning table and refuses caller-selected authority",async()=>{
 const f=await fixture(),get=makeFunctionReference<"query">("canonicalRsvp:get"),submit=makeFunctionReference<"mutation">("canonicalRsvp:submit");
 const initial=await f.t.query(get,f.target);expect(initial.providerId).toBe("events");expect(initial.eventId).toBe(f.ids.event);expect(initial.href).toBe("/events/studio-morning");
 expect(await f.t.mutation(submit,f.args)).toEqual({status:"confirmed",revision:1});
 expect(await f.t.mutation(submit,f.args)).toEqual({status:"confirmed",revision:1});expect(await f.total()).toBe(1);
 await expect(f.t.mutation(submit,{...f.args,providerId:"unrelated"})).rejects.toThrow();
 await f.t.run(ctx=>ctx.db.patch("settings",f.ids.plugin,{values:{eventsEnabled:false,formsEnabled:true}}));
 expect(await f.t.query(get,f.target)).toBeNull();await expect(f.t.mutation(submit,f.args)).rejects.toThrow();
});
test("stable RSVP dispatcher retains CAPTCHA checks and idempotent verification",async()=>{
 const f=await fixture(),submit=makeFunctionReference<"mutation">("canonicalRsvp:submit"),verified=makeFunctionReference<"action">("canonicalRsvp:submitWithVerification");
 await f.security({captchaEnabled:true,captchaProvider:"turnstile",captchaSiteKey:"synthetic-public-key",skipForLoggedIn:false});
 await expect(f.t.mutation(submit,f.args)).rejects.toThrow("verification challenge");
 expect(await f.t.action(verified,{...f.args,captchaToken:"synthetic-proof"})).toEqual({status:"confirmed",revision:1});
 expect(await f.t.action(verified,{...f.args,captchaToken:"synthetic-proof"})).toEqual({status:"confirmed",revision:1});
 expect(f.verifications).toHaveLength(1);expect(await f.total()).toBe(1);
 await f.t.run(ctx=>ctx.db.patch("posts",f.ids.post,{status:"draft"}));
 await expect(f.t.action(verified,{...f.args,captchaToken:"synthetic-proof"})).rejects.toThrow();expect(f.verifications).toHaveLength(1);
});
