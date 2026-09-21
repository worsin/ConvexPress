import {test,expect} from "bun:test";
import {convexTest} from "convex-test";
import {makeFunctionReference as ref} from "convex/server";
import schema from "../../schema";
const modules={"./convex/_generated/api.js":()=>import("../../_generated/api.js"),"./convex/_generated/server.js":()=>import("../../_generated/server.js"),"./convex/audiences/lists.ts":()=>import("../lists"),"./convex/audiences/subscribers.ts":()=>import("../subscribers")};
const create=ref<"mutation">("audiences/lists:create"),update=ref<"mutation">("audiences/lists:update"),get=ref<"query">("audiences/lists:get"),list=ref<"query">("audiences/lists:list"),members=ref<"query">("audiences/subscribers:list"),suppress=ref<"mutation">("audiences/subscribers:suppress");
const fields={name:"Field notes",description:"Small observations",consentText:"Send me occasional Field Notes emails. I can unsubscribe at any time.",privacyUrl:"/privacy",status:"active"};
async function fixture(){
 const t=convexTest({schema,modules});const ids=await t.run(async ctx=>{
  const role=await ctx.db.insert("roles",{name:"Moderator",slug:"moderator",description:"Test",level:10,type:"internal",isDefault:false,isProtected:false,capabilities:["manage_options"],pageAccess:[],status:"active",createdAt:1,updatedAt:1});
  const user=await ctx.db.insert("users",{authSource:"local",email:"moderator@example.invalid",emailVerified:true,status:"active",roleId:role,createdAt:1,updatedAt:1});
  const customer=await ctx.db.insert("users",{authSource:"clerk",clerkUserId:"audience-customer",email:"customer@example.invalid",emailVerified:true,status:"active",createdAt:1,updatedAt:1});
  const site=await ctx.db.insert("convexpress_siteIdentity",{identityKey:"site-identity",websiteKey:"audience",instanceKey:"audience-staging",environmentKind:"staging",deploymentOrigin:"https://audience.convex.cloud",managementOrigin:"https://controller.convex.cloud",siteOrigin:"https://audience.convex.site",siteContractVersion:"1",schemaVersion:"2026.9.0",engineVersion:"1",managementCapabilities:[],initializedAt:1,updatedAt:1});
  return {role,user,customer,site};
 });
 return {t,ids,operator:t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`}),customer:t.withIdentity({subject:"audience-customer",tokenIdentifier:"https://clerk.example|audience-customer"})};
}
test("list management requires a current active moderator and never creates a login or sends mail",async()=>{
 const {t,operator,customer,ids}=await fixture();for(const actor of [t,customer])await expect(actor.mutation(create,fields)).rejects.toThrow();
 const id=await operator.mutation(create,fields);expect(await operator.query(get,{listId:id})).toMatchObject({...fields,revision:1});
 for(const actor of [t,customer]){await expect(actor.query(get,{listId:id})).rejects.toThrow();await expect(actor.query(list,{paginationOpts:{numItems:10,cursor:null}})).rejects.toThrow();await expect(actor.query(members,{listId:id,status:"subscribed",paginationOpts:{numItems:10,cursor:null}})).rejects.toThrow();}
 expect(await t.run(ctx=>ctx.db.query("users").take(10))).toHaveLength(2);expect(await t.run(ctx=>ctx.db.query("newsletterSubscribers").take(1))).toHaveLength(0);expect(await t.run(ctx=>ctx.db.query("emailQueue").take(1))).toHaveLength(0);
 await t.run(ctx=>ctx.db.patch("users",ids.user,{status:"banned"}));await expect(operator.mutation(update,{listId:id,expectedRevision:1,...fields})).rejects.toThrow();
});
test("list edits bind revisions and copied installation records cannot be managed",async()=>{
 const {t,operator,ids}=await fixture();const id=await operator.mutation(create,fields);
 await operator.mutation(update,{listId:id,expectedRevision:1,...fields,status:"archived"});await expect(operator.mutation(update,{listId:id,expectedRevision:1,...fields})).rejects.toThrow();expect((await operator.query(get,{listId:id})).status).toBe("archived");
 await t.run(ctx=>ctx.db.patch("convexpress_siteIdentity",ids.site,{instanceKey:"another-environment"}));expect(await operator.query(get,{listId:id})).toBeNull();expect((await operator.query(list,{paginationOpts:{numItems:10,cursor:null}})).page).toEqual([]);await expect(operator.mutation(update,{listId:id,expectedRevision:2,...fields})).rejects.toThrow();
});
test("list settings reject empty consent, oversized values and unsafe privacy destinations",async()=>{
 const {operator}=await fixture();for(const patch of [{name:" "},{name:"x".repeat(161)},{description:"x".repeat(1001)},{consentText:""},{privacyUrl:"javascript:alert(1)"},{privacyUrl:"//evil.invalid"},{privacyUrl:"/\\evil.invalid"},{privacyUrl:"https://user:password@example.com"},{privacyUrl:"http://example.com"}])await expect(operator.mutation(create,{...fields,...patch})).rejects.toThrow();
 for(const privacyUrl of ["/privacy","https://example.com/privacy"])expect(await operator.mutation(create,{...fields,privacyUrl})).toBeTruthy();
});
test("bounded list pagination traverses every list and filters current status",async()=>{
 const {operator}=await fixture();for(let i=0;i<57;i++)await operator.mutation(create,{...fields,name:`Field notes ${String(i).padStart(2,"0")}`,status:i%2?"draft":"active"});
 const seen=new Set();let cursor:string|null=null;do{const page=await operator.query(list,{paginationOpts:{numItems:7,cursor}});for(const row of page.page){expect(seen.has(row.id)).toBe(false);seen.add(row.id);}cursor=page.isDone?null:page.continueCursor;}while(cursor);expect(seen.size).toBe(57);
 expect((await operator.query(list,{status:"active",paginationOpts:{numItems:50,cursor:null}})).page).toHaveLength(29);await expect(operator.query(list,{paginationOpts:{numItems:51,cursor:null}})).rejects.toThrow();
});
test("suppression is list-bound, optimistic and cannot reactivate a bounce",async()=>{
 const {t,operator,customer,ids}=await fixture();const a=await operator.mutation(create,fields),b=await operator.mutation(create,{...fields,name:"Another list"});
 const member=await t.run(async ctx=>{const post=await ctx.db.insert("posts",{type:"page",title:"Guide",slug:"guide",status:"publish",visibility:"public",authorId:ids.user,commentStatus:"closed",createdAt:1,updatedAt:1});return ctx.db.insert("mailingListSubscribers",{listId:a,email:"reader@example.invalid",status:"subscribed",consentText:fields.consentText,privacyUrl:fields.privacyUrl,consentedAt:1,sourcePostId:post,sourceBlockId:"guide",sourceRevision:1,updatedAt:1});});
 const args={listId:a,subscriberId:member,reason:"unsubscribed",expectedUpdatedAt:1};await expect(customer.mutation(suppress,args)).rejects.toThrow();await expect(operator.mutation(suppress,{...args,listId:b})).rejects.toThrow();
 await operator.mutation(suppress,args);const row=(await operator.query(members,{listId:a,status:"unsubscribed",paginationOpts:{numItems:10,cursor:null}})).page[0];expect(row).toMatchObject({email:"reader@example.invalid",consentText:fields.consentText});expect(row.unsubscribedAt).toBeGreaterThan(1);await expect(operator.mutation(suppress,{...args,reason:"bounced"})).rejects.toThrow();
 await operator.mutation(suppress,{...args,reason:"bounced",expectedUpdatedAt:row.updatedAt});const bounced=(await operator.query(members,{listId:a,status:"bounced",paginationOpts:{numItems:10,cursor:null}})).page[0];await operator.mutation(suppress,{...args,expectedUpdatedAt:bounced.updatedAt});expect((await operator.query(members,{listId:a,status:"bounced",paginationOpts:{numItems:10,cursor:null}})).page).toHaveLength(1);
});
