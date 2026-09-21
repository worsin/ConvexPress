import {test,expect} from "bun:test";
import {makeFunctionReference as ref} from "convex/server";
import {leadMagnetOfferSchema} from "../../canonicalDocuments/foundation/leadMagnetContracts";
const offer=ref<"query">("leadMagnets/queries:offer");
import {fixture} from "./fixture.test";
test("offer is bound to saved source and returns actual file metadata without a URL or private audience records",async()=>{
 const {t,ids,query}=await fixture();const value=await query();expect(value).toMatchObject({postId:ids.post,blockId:"guide",revision:1,file:{name:"field-guide.pdf",bytes:16,mimeType:"application/pdf"},audience:{name:"Field notes",privacyUrl:"/privacy"}});
 expect(leadMagnetOfferSchema.parse(value)).toEqual(value);
 for(const marker of ["NEVER_PROJECT", "PRIVATE_LIST", "storageId", "uploadedBy", "subscriber", ids.storage])expect(JSON.stringify(value)).not.toContain(marker);
 expect(await t.run(ctx=>ctx.db.query("mailingListSubscribers").take(1))).toEqual([]);expect(await t.run(ctx=>ctx.db.query("emailQueue").take(1))).toEqual([]);
 expect(await t.query(offer,{postId:ids.post,blockId:"other"})).toBeNull();expect(await t.query(offer,{postId:ids.media,blockId:"guide"})).toBeNull();
 await expect(t.query(offer,{postId:ids.post,blockId:"guide",fileId:ids.media})).rejects.toThrow();
});
test("publication, password, plugin, parent visibility and block switches are rechecked",async()=>{
 const {t,ids,query}=await fixture();
 for(const patch of [{status:"draft"},{status:"trash"},{status:"publish",visibility:"private"},{status:"publish",visibility:"public",publishedAt:Date.now()+100000}]){await t.run(ctx=>ctx.db.patch(ids.post,patch as any));expect(await query()).toBeNull();}
 await t.run(ctx=>ctx.db.patch(ids.post,{status:"publish",visibility:"password",publishedAt:1,password:"secret-test-password"}));expect(await query()).toBeNull();expect(await t.query(offer,{postId:ids.post,blockId:"guide",password:"wrong"})).toBeNull();expect(await t.query(offer,{postId:ids.post,blockId:"guide",password:"secret-test-password"})).not.toBeNull();
 await t.run(ctx=>ctx.db.patch(ids.post,{visibility:"public",blocks:[{id:"hidden",name:"core/group",version:1,attrs:{},visibility:"signedIn",children:[{id:"guide",name:"core/lead-magnet",version:1,attrs:{title:"Guide",file:{id:ids.media},list:ids.list}}]}]}));expect(await query()).toBeNull();
 const signedIn=t.withIdentity({subject:ids.user,tokenIdentifier:`https://convexpress-admin.local|${ids.user}`});expect(await signedIn.query(offer,{postId:ids.post,blockId:"guide"})).toBeNull(); // Canonical storage currently rejects signedIn/signedOut visibility.
 await t.run(ctx=>ctx.db.patch(ids.post,{blocks:[{id:"guide",name:"core/lead-magnet",version:1,attrs:{title:"Guide",file:{id:ids.media},list:ids.list}}]}));
 await t.run(ctx=>ctx.db.insert("settings",{section:"blocks",values:{disabledBlockNames:["core/lead-magnet"]},updatedAt:1,updatedBy:ids.user}));expect(await query()).toBeNull();
 await t.run(ctx=>ctx.db.patch(ids.settings,{values:{formsEnabled:false}}));expect(await query()).toBeNull();
});
test("list state, installation ownership and storage existence revoke offers",async()=>{
 const {t,ids,query}=await fixture();
 for(const patch of [{status:"archived"},{status:"draft"},{status:"active",instanceKey:"production"},{status:"active",instanceKey:"guide-staging",websiteKey:"another-site"}]){await t.run(ctx=>ctx.db.patch(ids.list,patch as any));expect(await query()).toBeNull();}
 await t.run(ctx=>ctx.db.patch(ids.list,{status:"active",websiteKey:"guide",instanceKey:"guide-staging"}));expect(await query()).not.toBeNull();
 await t.run(ctx=>ctx.db.patch(ids.media,{status:"trashed"}));expect(await query()).toBeNull();
 await t.run(ctx=>ctx.db.patch(ids.media,{status:"active",attachedTo:ids.post}));await t.run(ctx=>ctx.db.patch(ids.post,{visibility:"private"}));expect(await query()).toBeNull();
 await t.run(ctx=>ctx.db.patch(ids.post,{visibility:"public"}));await t.run(ctx=>ctx.storage.delete(ids.storage));expect(await query()).toBeNull();
});
test("offer digest changes with document revisions, list consent and replacement bytes",async()=>{
 const {t,ids,query}=await fixture();const original=(await query()).digest;
 await t.run(ctx=>ctx.db.patch(ids.post,{blocksRevision:2}));const revision=(await query()).digest;expect(revision).not.toBe(original);
 await t.run(ctx=>ctx.db.patch(ids.list,{revision:2,consentText:"New optional consent wording"}));const consent=(await query()).digest;expect(consent).not.toBe(revision);
 await t.run(async ctx=>{const storageId=await ctx.storage.store(new Blob(["REPLACED"]));await ctx.db.patch(ids.media,{storageId,updatedAt:2});});expect((await query()).digest).not.toBe(consent);
});
test("membership rules on the page aliases and block cannot be bypassed by the offer endpoint",async()=>{
 const {t,ids,query}=await fixture();await t.run(ctx=>ctx.db.patch(ids.settings,{values:{formsEnabled:true,membershipEnabled:true}}));
 for(const [resourceType,resourceIdOrKey] of [["page",ids.post],["route","/guide"],["route","/page/guide"],["block","guide"],["block","core/lead-magnet"]] as const){const rule=await t.run(ctx=>ctx.db.insert("membership_restriction_rules",{resourceType,resourceIdOrKey,ruleMode:"allow_only",planIds:[],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1}));expect(await query()).toBeNull();await t.run(ctx=>ctx.db.delete(rule));expect(await query()).not.toBeNull();}
});

test("a private attachment parent denies a public source page independently",async()=>{
 const {t,ids,query}=await fixture();const parent=await t.run(ctx=>ctx.db.insert("posts",{type:"page",title:"Private assets",slug:"private-assets",status:"private",visibility:"private",authorId:ids.user,commentStatus:"closed",createdAt:1,updatedAt:1}));
 await t.run(ctx=>ctx.db.patch(ids.media,{attachedTo:parent}));expect(await query()).toBeNull();
 await t.run(ctx=>ctx.db.patch(parent,{status:"publish",visibility:"public"}));expect(await query()).not.toBeNull();
});

test("a disabled ancestor removes the offer while a normal group permits it",async()=>{
 const {t,ids,query}=await fixture();await t.run(ctx=>ctx.db.patch(ids.post,{blocks:[{id:"group",name:"core/group",version:1,attrs:{},children:[{id:"guide",name:"core/lead-magnet",version:1,attrs:{title:"Guide",file:{id:ids.media},list:ids.list}}]}]}));
 expect(await query()).not.toBeNull();await t.run(ctx=>ctx.db.insert("settings",{section:"blocks",values:{disabledBlockNames:["core/group"]},updatedAt:1,updatedBy:ids.user}));expect(await query()).toBeNull();
});
