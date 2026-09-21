import {z} from "zod";
import {streamQuery} from "convex-helpers/server/pagination";
import {sha256Hex} from "@convexpress/site-contract";
import schema from "../schema";
import type {QueryCtx} from "../_generated/server";
import {RequestReadLedger} from "../helpers/requestReadLedger";
import {canDiscoverContent} from "../helpers/publicContent";
import {createMembershipAccessEvaluator} from "../membership/access";
import {SHOWCASE_META_PREFIX,parseShowcasePublication,showcaseFingerprint} from "../media/showcasePolicy";
import {CanonicalDataError,stableKey,type DataScope} from "./foundation/contracts";
import {taggedMediaArgsSchema,taggedMediaResultSchema,type TaggedMediaResult} from "./foundation/taggedMediaContracts";
const cursorSchema=z.strictObject({version:z.literal(1),binding:z.string().regex(/^[a-f0-9]{64}$/),after:z.tuple([z.number().finite().nonnegative(),z.string().min(1).max(256)])});
const WEB_IMAGES=new Set(["image/jpeg","image/png","image/webp","image/avif","image/gif"]);
/** Rights evidence stays in the moderator API. The public projection uses only
 * current, approved image/tag pairs from this installation, never cached consent. */
export async function readTaggedMedia(ctx:QueryCtx,raw:unknown,scope:DataScope,documentId:string,budget=new RequestReadLedger(),now=Date.now()):Promise<TaggedMediaResult>{
 const args=taggedMediaArgsSchema.parse(raw),empty=():TaggedMediaResult=>({tag:null,items:[],cursor:args.cursor,nextCursor:null});
 const binding=sha256Hex(stableKey({version:1,scope,documentId,tag:args.tag??null,limit:args.limit}));
 const cursor=args.cursor?cursorSchema.parse(JSON.parse(args.cursor)):null;
 if(cursor&&(cursor.binding!==binding||!ctx.db.normalizeId("mediaMeta",cursor.after[1])))throw new CanonicalDataError("TAGGED_MEDIA_CURSOR_SCOPE","cursor","Image cursor belongs to another tag, document or website environment");
 const tagId=args.tag?ctx.db.normalizeId("terms",args.tag):null;if(!tagId)return empty();
 budget.beforeRead();const site=budget.record(await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key",q=>q.eq("identityKey","site-identity")).unique());
 if(!site||site.websiteKey!==scope.websiteKey||site.instanceKey!==scope.instanceKey)throw new CanonicalDataError("SCOPE_MISMATCH","scope","The expected environment is not this installation");
 budget.beforeRead();const tag=budget.record(await ctx.db.get("terms",tagId));if(!tag||tag.taxonomy!=="post_tag")return empty();
 const evaluate=createMembershipAccessEvaluator(ctx,budget);
 if(!(await evaluate({resourceType:"route",resourceIdOrKey:`/tag/${encodeURIComponent(tag.slug)}`})).allowed)return empty();
 const key=SHOWCASE_META_PREFIX+tagId,items:TaggedMediaResult["items"]=[],seen=new Set<string>();
 const iterator=streamQuery(ctx,{schema,table:"mediaMeta",index:"by_key",order:"asc",startIndexKey:cursor?[key,...cursor.after]:[key],startInclusive:!cursor,endIndexKey:[key],endInclusive:true});
 let position:z.infer<typeof cursorSchema>["after"]|null=null,more=false;
 try{
  for(let scanned=0;scanned<=96;scanned++){
   if(budget.queries>=budget.limits.queries-32||budget.bytes>=budget.limits.bytes-1024*1024||budget.documents>=budget.limits.documents-64){
    if(!position)throw new CanonicalDataError("TAGGED_MEDIA_BUDGET","sources","Not enough document read budget to advance community images");more=true;break;
   }
   budget.beforeRead();const next=await iterator.next();if(next.done)break;
   const row=budget.record(next.value[0]);
   if(items.length>=args.limit||scanned>=96){more=true;break;}
   position=[row._creationTime,row._id];
   const approval=parseShowcasePublication(row.value);
   if(!approval?.approved||approval.websiteKey!==scope.websiteKey||approval.instanceKey!==scope.instanceKey||(approval.expiresAt!==null&&approval.expiresAt<=now))continue;
   if(approval.expiresAt!==null)budget.noteAuthorizationBoundary(approval.expiresAt,now);
   budget.beforeRead();const media=budget.record(await ctx.db.get("media",row.mediaId));
   if(!media||media.status!=="active"||media.mediaType!=="image"||!WEB_IMAGES.has(media.mimeType)||approval.fingerprint!==showcaseFingerprint(media))continue;
   if(media.attachedTo){budget.beforeRead();const parent=budget.record(await ctx.db.get("posts",media.attachedTo));if(!parent||!await canDiscoverContent(ctx,parent,budget))continue;}
   let src:string|null=media.url;
   if(media.storageId){budget.beforeRead();src=await ctx.storage.getUrl(media.storageId);}
   if(!src||seen.has(media._id))continue;
   const candidate={id:String(media._id),image:{src,alt:approval.altText,...(media.width?{width:media.width}:{}),...(media.height?{height:media.height}:{}),mimeType:media.mimeType},caption:approval.caption,credit:approval.creditName,creditUrl:approval.creditUrl};
   // Legacy URL-only imports may contain unusable URLs; never pass them to a view.
   const valid=taggedMediaResultSchema.shape.items.element.safeParse(candidate);if(!valid.success)continue;
   seen.add(media._id);items.push(valid.data);
  }
 }finally{await iterator.return(undefined);}
 return taggedMediaResultSchema.parse({tag:{id:tag._id,name:tag.name},items,cursor:args.cursor,nextCursor:more&&position?JSON.stringify({version:1,binding,after:position}):null});
}
