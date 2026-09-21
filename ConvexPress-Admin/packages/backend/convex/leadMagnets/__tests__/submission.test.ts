import {test,expect} from "bun:test";
import {makeFunctionReference as ref} from "convex/server";
import {fixture} from "./fixture.test";
const request=ref<"action">("leadMagnets/actions:requestDownload"),read=ref<"query">("leadMagnets/delivery:readLease"),start=ref<"mutation">("leadMagnets/delivery:startLease"),unsubscribe=ref<"mutation">("leadMagnets/delivery:unsubscribe"),expire=ref<"mutation">("leadMagnets/delivery:expire"),reserve=ref<"mutation">("leadMagnets/submission:reserve"),finish=ref<"mutation">("leadMagnets/submission:finalize");
async function setup(marketingConsent=false){const f=await fixture();const offer=await f.query();const args={postId:f.ids.post,blockId:"guide",offerDigest:offer.digest,email:" Reader@Example.invalid ",marketingConsent,requestId:"request-00000001",secret:"a".repeat(64),startedAt:Date.now()-3000,honeypot:""};return {...f,args};}
test("explicit download works without marketing consent; exact retries keep one receipt and start once",async()=>{
 const {t,ids,args}=await setup(),result=await t.action(request,args);
 expect(result).toMatchObject({fileName:"field-guide.pdf",fileSize:16});expect(Object.keys(result).sort()).toEqual(["expiresAt","fileName","fileSize","leaseId"]);
 expect(await t.action(request,args)).toEqual(result);
 expect(await t.run(ctx=>ctx.db.query("mailingListSubscribers").collect())).toEqual([]);
 expect(await t.run(ctx=>ctx.db.query("leadMagnetDeliveries").collect())).toHaveLength(1);
 expect((await t.run(ctx=>ctx.db.query("mailingListConsentEvents").collect())).map(row=>row.event)).toEqual(["download_requested"]);
 const proof={leaseId:result.leaseId,secret:args.secret};const meta=await t.query(read,{...proof,requestTime:Date.now()});expect(meta.fileSize).toBe(16);
 await t.mutation(start,proof);const first=await t.run(ctx=>ctx.db.query("leadMagnetDeliveries").unique());await t.mutation(start,proof);expect((await t.run(ctx=>ctx.db.query("leadMagnetDeliveries").unique()))?.startedAt).toBe(first?.startedAt);
 await expect(t.action(request,{...args,email:"someoneelse@example.invalid"})).rejects.toThrow();await expect(t.query(read,{...proof,secret:"b".repeat(64),requestTime:Date.now()})).rejects.toThrow();
 expect(await t.run(ctx=>ctx.db.query("users").collect())).toHaveLength(1);expect(await t.run(ctx=>ctx.db.query("emailQueue").collect())).toEqual([]);
});
test("optional consent is list-specific and opt-out survives delivery expiry without reactivating suppression",async()=>{
 const {t,ids,args}=await setup(true);const result=await t.action(request,args),proof={leaseId:result.leaseId,secret:args.secret};
 const subscriber=await t.run(ctx=>ctx.db.query("mailingListSubscribers").unique());expect(subscriber).toMatchObject({email:"reader@example.invalid",listId:ids.list,status:"subscribed"});
 await t.run(async ctx=>{const row=await ctx.db.query("leadMagnetDeliveries").unique();await ctx.db.patch(row!._id,{createdAt:Date.now()-24*60*60*1000-1,expiresAt:Date.now()-1});});await t.mutation(expire,{deliveryId:result.leaseId});
 await t.mutation(unsubscribe,{...proof,secret:"b".repeat(64)});expect((await t.run(ctx=>ctx.db.get(subscriber!._id)))?.status).toBe("subscribed");
 await t.mutation(unsubscribe,proof);expect((await t.run(ctx=>ctx.db.get(subscriber!._id)))?.status).toBe("unsubscribed");await t.mutation(unsubscribe,proof);
 expect((await t.run(ctx=>ctx.db.query("mailingListConsentEvents").collect())).map(row=>row.event)).toEqual(["subscribed","unsubscribed"]);
 await t.action(request,{...args,requestId:"request-00000002"});expect((await t.run(ctx=>ctx.db.get(subscriber!._id)))?.status).toBe("unsubscribed");
 expect((await t.run(ctx=>ctx.db.query("mailingListConsentEvents").collect())).map(row=>row.event)).toEqual(["subscribed","unsubscribed","suppressed"]);
 await t.run(ctx=>ctx.db.patch(subscriber!._id,{status:"bounced"}));await t.action(request,{...args,requestId:"request-00000003"});await t.mutation(unsubscribe,proof);expect((await t.run(ctx=>ctx.db.get(subscriber!._id)))?.status).toBe("bounced");
});
test("source/list changes and replaced bytes reject stale offers and issued delivery capabilities",async()=>{
 for(const change of ["page","list","file","site"]){const {t,ids,args}=await setup(),result=await t.action(request,args);
  await t.run(async ctx=>{if(change==="page")await ctx.db.patch(ids.post,{blocksRevision:2});if(change==="list")await ctx.db.patch(ids.list,{status:"archived"});if(change==="file"){const storageId=await ctx.storage.store(new Blob(["new bytes"]));await ctx.db.patch(ids.media,{storageId});}if(change==="site")await ctx.db.patch(ids.site,{instanceKey:"another-instance"});});
  await expect(t.query(read,{leaseId:result.leaseId,secret:args.secret,requestTime:Date.now()})).rejects.toThrow();await expect(t.action(request,{...args,requestId:"request-00000002"})).rejects.toThrow();
 }
});
test("a stored principal cannot retain download access after account revocation",async()=>{
 const {t,ids,args}=await setup();const actor=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});const result=await actor.action(request,args);
 await t.run(ctx=>ctx.db.patch(ids.user,{status:"banned"}));await expect(t.query(read,{leaseId:result.leaseId,secret:args.secret,requestTime:Date.now()})).rejects.toThrow();
});
test("invalid and abusive submissions spend no consent; repeated valid attempts are bounded",async()=>{
 const {t,args}=await setup(true);
 for(const patch of [{email:"bad"},{email:"a".repeat(260)+"@x.com"},{honeypot:"bot"},{startedAt:Date.now()},{startedAt:0},{offerDigest:"b".repeat(64)},{captchaVerified:true}])await expect(t.action(request,{...args,...patch})).rejects.toThrow();
 expect(await t.run(ctx=>ctx.db.query("mailingListSubscribers").collect())).toEqual([]);
 for(let i=0;i<5;i++)await t.action(request,{...args,requestId:`request-0000000${i}`});
 await expect(t.action(request,{...args,requestId:"request-00000006"})).rejects.toThrow();expect(await t.run(ctx=>ctx.db.query("leadMagnetDeliveries").collect())).toHaveLength(5);
});
test("CAPTCHA is server-verified before finalization and policy changes invalidate a pending request",async()=>{
 const {t,ids}=await setup(true);await t.run(ctx=>ctx.db.insert("form_security_settings",{key:"global",honeypotEnabled:true,captchaEnabled:true,captchaProvider:"turnstile",captchaSiteKey:"public-site-key",updatedAt:1,updatedBy:ids.user}));
 const offer=await t.query(ref("leadMagnets/queries:offer"),{postId:ids.post,blockId:"guide"});const args={postId:ids.post,blockId:"guide",offerDigest:offer.digest,email:"reader@example.invalid",marketingConsent:true,requestId:"request-00000001",secret:"a".repeat(64),startedAt:Date.now()-3000,honeypot:""};
 await expect(t.action(request,args)).rejects.toThrow();const pending=await t.mutation(reserve,args);
 await expect(t.mutation(finish,{...args,deliveryId:pending.deliveryId,captchaVerified:false})).rejects.toThrow();
 expect(await t.run(ctx=>ctx.db.query("mailingListSubscribers").collect())).toEqual([]);
 await t.run(ctx=>ctx.db.patch(ids.list,{revision:2,consentText:"Changed consent"}));await expect(t.mutation(finish,{...args,deliveryId:pending.deliveryId,captchaVerified:true})).rejects.toThrow();
});

import {handleDownloadBytes} from "../../commerceDigital/byteTransport";
test("Lead Magnet transport projects metadata and delivers storage bytes through its scoped lease",async()=>{
 const {t,ids,args}=await setup(),result=await t.action(request,args);
 const bytes=await t.run(async ctx=>(await ctx.storage.get(ids.storage))!.arrayBuffer());
 const internalMeta=await t.query(read,{leaseId:result.leaseId,secret:args.secret,requestTime:Date.now()});
 const deps={authorize:(proof:any)=>t.query(read,proof),start:(proof:any)=>t.mutation(start,proof),fetch:async(input:RequestInfo|URL,init?:RequestInit)=>{
  expect(new Headers(init?.headers).get("range")).toBe("bytes=0-15");
  expect(String(input)).toBe(internalMeta.url);
  return new Response(bytes,{status:206,headers:{"Content-Length":"16","Content-Range":"bytes 0-15/16"}});
 }};
 const call=(body:object)=>handleDownloadBytes(new Request("https://backend.invalid/lead-magnets/downloads/bytes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({leaseId:result.leaseId,secret:args.secret,...body})}),deps);
 const metadata=await call({mode:"metadata"});expect(metadata.status).toBe(200);const publicMeta=await metadata.json();expect(Object.keys(publicMeta).sort()).toEqual(["etag","expiresAt","fileName","fileSize"]);expect(JSON.stringify(publicMeta)).not.toContain("url");
 const response=await call({mode:"chunk",offset:0,length:16});expect(response.status).toBe(206);expect(await response.text()).toBe("REAL GUIDE BYTES");
 await t.run(ctx=>ctx.db.patch(ids.list,{status:"archived"}));expect((await call({mode:"chunk",offset:0,length:16})).status).toBe(403);
});
