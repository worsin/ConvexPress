import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import {makeFunctionReference as ref} from "convex/server";
import schema from "../../schema";
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/audiences/footer.ts":()=>import("../footer")};
const offer=ref<"query">("audiences/footer:offer"),subscribe=ref<"mutation">("audiences/footer:subscribe"),unsubscribe=ref<"mutation">("audiences/footer:unsubscribe");
async function fixture(){
 const t=convexTest({schema,modules});const ids=await t.run(async ctx=>{
  const user=await ctx.db.insert("users",{authSource:"local",email:"author@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  await ctx.db.insert("convexpress_siteIdentity",{identityKey:"site-identity",websiteKey:"footer",instanceKey:"footer-staging",environmentKind:"staging",deploymentOrigin:"https://footer.convex.cloud",managementOrigin:"https://controller.convex.cloud",siteOrigin:"https://footer.convex.site",siteContractVersion:"1",schemaVersion:"2026.9.0",engineVersion:"1",managementCapabilities:[],initializedAt:1,updatedAt:1});
  const list=await ctx.db.insert("mailingLists",{websiteKey:"footer",instanceKey:"footer-staging",name:"Journal letters",description:"Monthly letters",consentText:"Send me Journal letters.",privacyUrl:"/privacy",status:"active",revision:1,createdBy:user,updatedBy:user,createdAt:1,updatedAt:1});
  const values:any={active:"journal",overrides:{},variants:{},settings:{journal:{footer:{rows:[{id:"row",columns:[{id:"column",cell:{type:"newsletter",audienceId:list,buttonText:"Subscribe"}}]}]}}}};
  const settings=await ctx.db.insert("settings",{section:"appearance.template",values,updatedAt:1,updatedBy:user,legacyAppearanceMigration:{version:2,migratedAt:1}});
  return {user,list,settings,values};
 });
 const published=await t.query(offer,{audienceId:ids.list});
 const args={audienceId:ids.list,offerDigest:published?.digest??"a".repeat(64),email:" Reader@Example.invalid ",consent:true,secret:"b".repeat(64),startedAt:Date.now()-3000,honeypot:""};
 return {t,ids,published,args};
}
test("published footer records owned list, exact consent/source, and secret-bound opt-out",async()=>{
 const {t,ids,published,args}=await fixture();expect(published).toMatchObject({name:"Journal letters",consentText:"Send me Journal letters.",privacyUrl:"/privacy"});expect(await t.mutation(subscribe,args)).toEqual({ok:true});
 const row=await t.run(ctx=>ctx.db.query("mailingListSubscribers").withIndex("by_list_email",q=>q.eq("listId",ids.list).eq("email","reader@example.invalid")).unique());
 expect(row).toMatchObject({status:"subscribed",email:"reader@example.invalid",consentText:published.consentText,privacyUrl:published.privacyUrl,sourceFooter:{packId:"journal",rowId:"row",columnId:"column",digest:published.digest}});expect(row?.sourcePostId).toBeUndefined();
 expect(await t.run(ctx=>ctx.db.query("users").take(10))).toHaveLength(1);expect(await t.run(ctx=>ctx.db.query("newsletterSubscribers").take(1))).toEqual([]);
 await t.mutation(unsubscribe,{secret:"c".repeat(64)});expect((await t.run(ctx=>ctx.db.get("mailingListSubscribers",row!._id)))?.status).toBe("subscribed");
 await t.mutation(unsubscribe,{secret:args.secret});expect((await t.run(ctx=>ctx.db.get("mailingListSubscribers",row!._id)))?.status).toBe("unsubscribed");
 await t.mutation(subscribe,{...args,secret:"d".repeat(64)});expect((await t.run(ctx=>ctx.db.get("mailingListSubscribers",row!._id)))?.status).toBe("unsubscribed");
});
test("inactive, foreign, unpublished, hidden and malformed audiences are unavailable",async()=>{
 for(const change of ["draft","archived","foreign","removed","inactive-pack","minimal","malformed"]){const {t,ids,args}=await fixture();await t.run(async ctx=>{
  if(change==="draft"||change==="archived")await ctx.db.patch("mailingLists",ids.list,{status:change});
  if(change==="foreign")await ctx.db.patch("mailingLists",ids.list,{instanceKey:"elsewhere"});
  if(change==="malformed")await ctx.db.patch("mailingLists",ids.list,{privacyUrl:"javascript:alert(1)"});
  if(change==="removed")ids.values.settings.journal.footer.rows=[];
  if(change==="inactive-pack")ids.values.active="core";
  if(change==="minimal")ids.values.variants={"chrome.footer":"minimal"};
  await ctx.db.patch("settings",ids.settings,{values:ids.values});
 });expect(await t.query(offer,{audienceId:ids.list})).toBeNull();await expect(t.mutation(subscribe,args)).rejects.toThrow();expect(await t.run(ctx=>ctx.db.query("mailingListSubscribers").take(1))).toEqual([]);}
 const {t}=await fixture();expect(await t.query(offer,{audienceId:"provider-id"})).toBeNull();
});
test("stale consent, missing consent, invalid email and automated requests fail closed",async()=>{
 for(const patch of [{consent:false},{email:"bad"},{email:"x".repeat(255)+"@example.com"},{secret:"bad"},{honeypot:"bot"},{startedAt:Date.now()+1000},{startedAt:Date.now()-7200000},{offerDigest:"f".repeat(64)}]){const {t,args}=await fixture();await expect(t.mutation(subscribe,{...args,...patch})).rejects.toThrow();}
 const {t,args,ids}=await fixture();await t.run(ctx=>ctx.db.patch("mailingLists",ids.list,{consentText:"Different consent",revision:2}));await expect(t.mutation(subscribe,args)).rejects.toThrow();expect((await t.query(offer,{audienceId:ids.list})).digest).not.toBe(args.offerDigest);
});
test("duplicates preserve original consent and opt-out token; bounces and bounded requests stay enforced",async()=>{
 const {t,args}=await fixture();await t.mutation(subscribe,args);const before=await t.run(ctx=>ctx.db.query("mailingListSubscribers").first());
 await t.mutation(subscribe,{...args,secret:"c".repeat(64)});expect(await t.run(ctx=>ctx.db.get("mailingListSubscribers",before!._id))).toEqual(before);
 await t.mutation(unsubscribe,{secret:"c".repeat(64)});expect((await t.run(ctx=>ctx.db.get("mailingListSubscribers",before!._id)))?.status).toBe("subscribed");
 await t.run(ctx=>ctx.db.patch("mailingListSubscribers",before!._id,{status:"bounced"}));await t.mutation(subscribe,args);await t.mutation(unsubscribe,{secret:args.secret});expect((await t.run(ctx=>ctx.db.get("mailingListSubscribers",before!._id)))?.status).toBe("bounced");
 await t.mutation(subscribe,args);await t.mutation(subscribe,args);await expect(t.mutation(subscribe,args)).rejects.toThrow();
});
