import {v,ConvexError} from "convex/values";
import {paginationOptsValidator} from "convex/server";
import {emitEvent} from "../helpers/events";
import {query,mutation} from "../_generated/server";
import {requireCan} from "../helpers/permissions";
import {SHOWCASE_META_PREFIX,showcaseFieldsSchema,showcaseFingerprint,parseShowcasePublication,type ShowcasePublication} from "./showcasePolicy";
const fields={creditName:v.string(),creditUrl:v.union(v.string(),v.null()),altText:v.string(),caption:v.string(),rightsBasis:v.union(v.literal("owned"),v.literal("permission"),v.literal("license")),permissionNote:v.string(),expiresAt:v.union(v.number(),v.null())};
const fail=(message:string):never=>{throw new ConvexError({code:"SHOWCASE_VALIDATION",message});};
export const get=query({
 args:{mediaId:v.id("media"),tagId:v.id("terms")},
 returns:v.union(v.null(),v.object({...fields,approved:v.boolean(),revision:v.number(),needsReview:v.boolean(),reviewedAt:v.number()})),
 handler:async(ctx,args)=>{
  await requireCan(ctx,"manage_options");
  const media=await ctx.db.get("media",args.mediaId);if(!media)return null;
  const meta=await ctx.db.query("mediaMeta").withIndex("by_media_key",q=>q.eq("mediaId",args.mediaId).eq("key",SHOWCASE_META_PREFIX+args.tagId)).unique();
  const publication=meta?parseShowcasePublication(meta.value):null;if(!publication)return null;
  const site=await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key",q=>q.eq("identityKey","site-identity")).unique();
  const {creditName,creditUrl,altText,caption,rightsBasis,permissionNote,expiresAt,approved,reviewedAt,revision}=publication;
  return {creditName,creditUrl,altText,caption,rightsBasis,permissionNote,expiresAt,approved,reviewedAt,revision,
   needsReview:media.status!=="active"||publication.fingerprint!==showcaseFingerprint(media)||publication.websiteKey!==site?.websiteKey||publication.instanceKey!==site?.instanceKey||(expiresAt!==null&&expiresAt<=Date.now())};
 },
});
export const approve=mutation({
 args:{mediaId:v.id("media"),tagId:v.id("terms"),...fields,expectedMediaUpdatedAt:v.number(),expectedRevision:v.union(v.number(),v.null())},returns:v.null(),
 handler:async(ctx,args)=>{
  const user=await requireCan(ctx,"manage_options"),now=Date.now();
  const {mediaId,tagId,expectedMediaUpdatedAt,expectedRevision,...raw}=args;
  const fields=showcaseFieldsSchema.parse(raw);
  if(fields.expiresAt!==null&&fields.expiresAt<=now)fail("Choose a future permission expiry");
  const [media,tag,site]=await Promise.all([ctx.db.get("media",mediaId),ctx.db.get("terms",tagId),ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key",q=>q.eq("identityKey","site-identity")).unique()]);
  if(!media||media.status!=="active"||media.mediaType!=="image"||!["image/jpeg","image/png","image/webp","image/avif","image/gif"].includes(media.mimeType))fail("Choose an active, web-compatible image");
  if(media!.updatedAt!==expectedMediaUpdatedAt)fail("The image changed. Reload it before approving");
  if(!tag||tag.taxonomy!=="post_tag")fail("Choose an existing site tag");
  if(!site)fail("The website identity must be configured before approving media");
  const key=SHOWCASE_META_PREFIX+tagId;
  const existing=await ctx.db.query("mediaMeta").withIndex("by_media_key",q=>q.eq("mediaId",mediaId).eq("key",key)).unique();
  const prior=existing?parseShowcasePublication(existing.value):null;
  if((prior?.revision??null)!==expectedRevision)fail("The approval changed. Reload it before saving");
  if(!existing){
   const assigned=await ctx.db.query("mediaMeta").withIndex("by_media_key",q=>q.eq("mediaId",mediaId).gte("key",SHOWCASE_META_PREFIX).lt("key",SHOWCASE_META_PREFIX+"\uffff")).take(32);
   if(assigned.length>=32)fail("An image can be approved for up to 32 tags");
  }
  const publication:ShowcasePublication={...fields,version:1,revision:(prior?.revision??0)+1,approved:true,websiteKey:site!.websiteKey,instanceKey:site!.instanceKey,fingerprint:showcaseFingerprint(media!),reviewedBy:user._id,reviewedAt:now};
  const value=JSON.stringify(publication);
  if(existing)await ctx.db.patch("mediaMeta",existing._id,{value});else await ctx.db.insert("mediaMeta",{mediaId,key,value});
  await emitEvent(ctx,"media.updated","media",{mediaId,showcase:{tagId,approved:true,reviewedAt:now}},{actorId:user._id});
  return null;
 },
});
export const revoke=mutation({
 args:{mediaId:v.id("media"),tagId:v.id("terms"),expectedRevision:v.union(v.number(),v.null())},returns:v.null(),
 handler:async(ctx,args)=>{
  const user=await requireCan(ctx,"manage_options");
  const meta=await ctx.db.query("mediaMeta").withIndex("by_media_key",q=>q.eq("mediaId",args.mediaId).eq("key",SHOWCASE_META_PREFIX+args.tagId)).unique();
  if(!meta)return null;
  const publication=parseShowcasePublication(meta.value);
  if((publication?.revision??null)!==args.expectedRevision)fail("The approval changed. Reload it before revoking");
  // Invalid metadata is never publishable; remove it rather than retaining an
  // unreadable approval. Valid records retain their permission audit note.
  if(!publication)await ctx.db.delete("mediaMeta",meta._id);
  else await ctx.db.patch("mediaMeta",meta._id,{value:JSON.stringify({...publication,revision:publication.revision+1,approved:false,reviewedBy:user._id,reviewedAt:Date.now()})});
  await emitEvent(ctx,"media.updated","media",{mediaId:args.mediaId,showcase:{tagId:args.tagId,approved:false}},{actorId:user._id});
  return null;
 },
});

export const tags=query({
 args:{paginationOpts:paginationOptsValidator},
 returns:v.object({page:v.array(v.object({id:v.id("terms"),name:v.string()})),isDone:v.boolean(),continueCursor:v.string()}),
 handler:async(ctx,args)=>{
  await requireCan(ctx,"manage_options");
  if(!Number.isInteger(args.paginationOpts.numItems)||args.paginationOpts.numItems<1||args.paginationOpts.numItems>25)fail("Choose up to25 tags per page");
  const page=await ctx.db.query("terms").withIndex("by_taxonomy_name",q=>q.eq("taxonomy","post_tag")).paginate({...args.paginationOpts,maximumRowsRead:25,maximumBytesRead:512*1024});
  return {page:page.page.map(tag=>({id:tag._id,name:tag.name})),isDone:page.isDone,continueCursor:page.continueCursor};
 },
});
