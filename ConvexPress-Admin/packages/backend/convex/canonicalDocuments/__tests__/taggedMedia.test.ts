import {displayContext} from "../displayContext";
import {test,expect} from "bun:test";
import {makeFunctionReference as ref} from "convex/server";
import {showcaseFixture} from "../../media/__tests__/showcase.test";
import {readTaggedMedia} from "../taggedMedia";
import {RequestReadLedger} from "../../helpers/requestReadLedger";
import {SHOWCASE_META_PREFIX,showcaseFingerprint} from "../../media/showcasePolicy";
const scope={websiteKey:"showcase",instanceKey:"showcase-staging"};
async function fixture(){const f=await showcaseFixture();await f.operator.mutation(ref<"mutation">("media/showcase:approve"),f.args);await f.t.run(ctx=>ctx.db.insert("settings",{section:"plugins",values:{membershipEnabled:false},updatedBy:f.ids.user,updatedAt:1}));return {...f,read:(cursor:string|null=null,limit=6)=>f.t.run(ctx=>readTaggedMedia(ctx,{tag:f.ids.tag,limit,cursor},scope,"document"))};}
test("approved tagged images have closed public credits and no permission evidence",async()=>{
 const {read}=await fixture();const result=await read();expect(result.items).toHaveLength(1);expect(result.tag?.name).toBe("In the wild");expect(result.items[0]).toMatchObject({credit:"Mara",caption:"A quiet morning",image:{alt:"A hand-thrown cup in morning light"}});
 for(const field of ["PRIVATE_PERMISSION_NOTE","permissionNote","rightsBasis","reviewedBy","fingerprint","uploadedBy","storageId"])expect(JSON.stringify(result)).not.toContain(field);
});
test("revocation, source changes, missing media and deleted tags are checked again",async()=>{
 const {t,ids,operator,args,read}=await fixture();await operator.mutation(ref<"mutation">("media/showcase:revoke"),{mediaId:ids.media,tagId:ids.tag,expectedRevision:1});expect((await read()).items).toEqual([]);
 await operator.mutation(ref<"mutation">("media/showcase:approve"),{...args,expectedRevision:2});await t.run(ctx=>ctx.db.patch("media",ids.media,{updatedAt:2}));expect((await read()).items).toEqual([]);
 await operator.mutation(ref<"mutation">("media/showcase:approve"),{...args,expectedRevision:3,expectedMediaUpdatedAt:2});await t.run(ctx=>ctx.db.delete("media",ids.media));expect((await read()).items).toEqual([]);
 await t.run(ctx=>ctx.db.delete("terms",ids.tag));expect((await read()).tag).toBeNull();
});
test("expiry bounds render validity and inherited private attachments remain hidden",async()=>{
 const {t,ids,args,operator}=await fixture();const expiry=Date.now()+10000;
 await operator.mutation(ref<"mutation">("media/showcase:approve"),{...args,expectedRevision:1,expiresAt:expiry});const budget=new RequestReadLedger();
 expect((await t.run(ctx=>readTaggedMedia(ctx,{tag:ids.tag},scope,"document",budget,expiry-1))).items).toHaveLength(1);expect(budget.authorizationRecheckAt).toBe(expiry);
 expect((await t.run(ctx=>readTaggedMedia(ctx,{tag:ids.tag},scope,"document",new RequestReadLedger(),expiry))).items).toEqual([]);
 await t.run(async ctx=>{const post=await ctx.db.insert("posts",{type:"post",title:"Private source",slug:"private-source",status:"publish",visibility:"password",authorId:ids.user,commentStatus:"closed",createdAt:1,updatedAt:1});await ctx.db.patch("media",ids.media,{attachedTo:post});});
 expect((await t.run(ctx=>readTaggedMedia(ctx,{tag:ids.tag},scope,"document",new RequestReadLedger(),expiry-1))).items).toEqual([]);
});
test("complete bounded traversal preserves tag/document/site/limit bindings",async()=>{
 const {t,ids,read}=await fixture();
 await t.run(async ctx=>{const base=(await ctx.db.get("media",ids.media))!;const meta=(await ctx.db.query("mediaMeta").withIndex("by_media_key",q=>q.eq("mediaId",ids.media).eq("key",SHOWCASE_META_PREFIX+ids.tag)).unique())!;const approval=JSON.parse(meta.value);
  for(let i=0;i<105;i++){const {_id,_creationTime,...fields}=base;const id=await ctx.db.insert("media",{...fields,title:`Community image ${i}`,slug:`community-${i}`});const media=(await ctx.db.get("media",id))!;await ctx.db.insert("mediaMeta",{mediaId:id,key:meta.key,value:JSON.stringify({...approval,fingerprint:showcaseFingerprint(media)})});}
 });
 const first=await read(null,3);expect(first.items).toHaveLength(3);expect(first.nextCursor).not.toBeNull();
 for(const changed of [{tag:"missing"},{limit:4}])await expect(t.run(ctx=>readTaggedMedia(ctx,{tag:ids.tag,limit:3,cursor:first.nextCursor,...changed},scope,"document"))).rejects.toThrow();
 await expect(t.run(ctx=>readTaggedMedia(ctx,{tag:ids.tag,limit:3,cursor:first.nextCursor},scope,"other-document"))).rejects.toThrow();
 await expect(t.run(ctx=>readTaggedMedia(ctx,{tag:ids.tag,limit:3}, {...scope,instanceKey:"foreign"},"document"))).rejects.toThrow();
 let cursor:string|null=null;const seen=new Set<string>();let pages=0;
 do{const result=await read(cursor,3);for(const item of result.items){expect(seen.has(item.id)).toBe(false);seen.add(item.id);}cursor=result.nextCursor;if(++pages>40)throw Error("Nonconvergent community cursor");}while(cursor);
 expect(seen.size).toBe(106);
});
test("invalid approvals cannot escape source checks; budgets fail closed",async()=>{
 const {t,ids,read}=await fixture();await t.run(async ctx=>{const meta=(await ctx.db.query("mediaMeta").first())!;await ctx.db.patch("mediaMeta",meta._id,{value:'{"approved":true}'});});expect((await read()).items).toEqual([]);
 await expect(t.run(ctx=>readTaggedMedia(ctx,{tag:ids.tag},scope,"document",new RequestReadLedger({queries:1,documents:1,bytes:100,documentBytes:100})))).rejects.toThrow();
});

test("unsafe URL imports and missing storage blobs never become public images",async()=>{
 const {t,ids,args,operator,read}=await fixture();
 await t.run(ctx=>ctx.db.patch("media",ids.media,{url:"javascript:alert(1)",updatedAt:2}));
 await operator.mutation(ref<"mutation">("media/showcase:approve"),{...args,expectedRevision:1,expectedMediaUpdatedAt:2});
 expect((await read()).items).toEqual([]);
 const storageId=await t.run(ctx=>ctx.storage.store(new Blob(["synthetic image"],{type:"image/png"})));
 await t.run(ctx=>ctx.db.patch("media",ids.media,{url:"https://example.com/cached.jpg",storageId,updatedAt:3}));
 await operator.mutation(ref<"mutation">("media/showcase:approve"),{...args,expectedRevision:2,expectedMediaUpdatedAt:3});
 expect((await read()).items).toHaveLength(1);
 await t.run(ctx=>ctx.storage.delete(storageId));expect((await read()).items).toEqual([]);
});

test("installed UGC authoring is enabled with its implemented tag reader and respects explicit disablement",async()=>{
 const {t,ids}=await fixture();const display=await t.run(ctx=>displayContext(ctx,new RequestReadLedger()));
 expect(display.policy.disabledBlocks).not.toContain("core/ugc-grid");
 await t.run(ctx=>ctx.db.insert("settings",{section:"blocks",values:{disabledBlockNames:["core/ugc-grid"]},updatedBy:ids.user,updatedAt:1}));
 expect((await t.run(ctx=>displayContext(ctx,new RequestReadLedger()))).policy.disabledBlocks).toContain("core/ugc-grid");
});
