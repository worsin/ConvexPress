import { z } from "zod";
import { streamQuery } from "convex-helpers/server/pagination";
import { sha256Hex } from "@convexpress/site-contract";
import schema from "../schema";
import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { createContentDiscoveryEvaluator } from "../helpers/publicContent";
import { evaluateMembershipAccess } from "../membership/access";
import { getDefaults } from "../settings/defaults";
import { SOURCE_LIMITS, SourceByteLedger } from "./sourceBudget";
import { CanonicalDataError, encodedBytes, stableKey, type DataScope } from "./foundation/contracts";
import { eventTimeZoneSchema } from "./foundation/eventContracts";
import { archiveArgsSchema,archiveResultSchema,archivePeriodAt,archivePeriod,archiveHref,type ArchiveResult } from "./foundation/archiveContracts";
import { relatedResultSchema,type RelatedResult } from "./foundation/relatedContracts";
const coordinates=z.union([z.tuple([z.number().finite()]),z.tuple([z.number().finite(),z.number().finite(),z.string().min(1).max(256)])]);
const cursorSchema=z.strictObject({version:z.literal(1),binding:z.string().regex(/^[a-f0-9]{64}$/),key:coordinates});
const prefix=["post","publish","public"];
export async function archiveTimeZone(ctx:QueryCtx,budget:RequestReadLedger){
 budget.beforeRead();const settings=budget.record(await ctx.db.query("settings").withIndex("by_section",q=>q.eq("section","general")).unique());
 return eventTimeZoneSchema.parse(settings?.values.timezone??getDefaults("general").timezone);
}
function decode(ctx:QueryCtx,raw:string|null,binding:string,now:number){
 if(!raw)return null;
 let value:z.infer<typeof cursorSchema>;try{value=cursorSchema.parse(JSON.parse(raw));}catch{throw new CanonicalDataError("ARCHIVE_CURSOR_FORMAT","cursor","Invalid archive cursor");}
 if(value.binding!==binding||value.key[0]>now||value.key.length===3&&!ctx.db.normalizeId("posts",value.key[2]))throw new CanonicalDataError("ARCHIVE_CURSOR_SCOPE","cursor","Archive position belongs to another date selection, document or environment");
 return value.key;
}
function reserve(budget:RequestReadLedger,sources:SourceByteLedger){return budget.queries>=budget.limits.queries-32 || sources.usedBytes>SOURCE_LIMITS.total-SOURCE_LIMITS.post-SOURCE_LIMITS.media;}
/** Find one accessible post per period, then seek past that entire period. No
 * fabricated totals and no scan through all posts in a busy month. */
export async function readDateArchiveGroups(ctx:QueryCtx,input:unknown,scope:DataScope,documentId:string,budget=new RequestReadLedger(),sources=new SourceByteLedger(),now=Date.now()):Promise<ArchiveResult>{
 const discover=createContentDiscoveryEvaluator(ctx,budget);
 const args=archiveArgsSchema.parse(input),timeZone=await archiveTimeZone(ctx,budget);
 const binding=sha256Hex(stableKey({scope,documentId,timeZone,groupBy:args.groupBy,limit:args.limit}));
 let key=decode(ctx,args.cursor,binding,now),more=false,scanned=0;
 const items:ArchiveResult["items"]=[];
 if(!(await evaluateMembershipAccess(ctx,{resourceType:"route",resourceIdOrKey:"/archive"},budget)).allowed)return {groupBy:args.groupBy,timeZone,items,cursor:args.cursor,nextCursor:null};
 let done=false;
 while(!done) {
  const iterator=streamQuery(ctx,{schema,table:"posts",index:"by_public_discovery",order:"desc",startIndexKey:[...prefix,...(key??[now])],startInclusive:key===null,endIndexKey:[...prefix,0],endInclusive:true});
  try {
   while(true){
    if(scanned&&(scanned>=64||items.length>=args.limit||reserve(budget,sources))){more=true;done=true;break;}
    sources.beforeRead();budget.beforeRead();const next=await iterator.next();if(next.done){done=true;break;}
    const [post,position]=next.value;budget.record(post);sources.record("post",post);scanned++;key=coordinates.parse(position.slice(3));
    if(post.publishedAt===undefined||post.publishedAt>now||!await discover(post))continue;
    const period=archivePeriodAt(post.publishedAt,timeZone,args.groupBy);
    items.push({year:period.year,month:period.month,href:archiveHref(period.year,period.month)});
    // An incomplete key with exclusive start skips every row at the boundary.
    key=[period.startsAt];break;
   }
  } finally {await iterator.return(undefined);}
 }
 return archiveResultSchema.parse({groupBy:args.groupBy,timeZone,items,cursor:args.cursor,nextCursor:more?JSON.stringify({version:1,binding,key}):null});
}
export async function readDateArchivePosts(ctx:QueryCtx,args:{year:number;month:number|null;cursor:string|null;limit:number},scope:DataScope,budget=new RequestReadLedger(),sources=new SourceByteLedger(),now=Date.now()){
 const discover=createContentDiscoveryEvaluator(ctx,budget);
 const timeZone=await archiveTimeZone(ctx,budget),period=archivePeriod(args.year,args.month,timeZone);
 const binding=sha256Hex(stableKey({scope,timeZone,year:args.year,month:args.month,limit:args.limit}));
 let key=decode(ctx,args.cursor,binding,now),scanned=0,more=false;
 if(key && (key[0]<period.startsAt || key[0]>=period.endsAt))throw new CanonicalDataError("ARCHIVE_CURSOR_SCOPE","cursor","Archive position is outside the requested date period");
 const items:RelatedResult["items"]=[];
 const iterator=streamQuery(ctx,{schema,table:"posts",index:"by_public_discovery",order:"desc",startIndexKey:[...prefix,...(key??[Math.min(now,period.endsAt)])],startInclusive:key===null&&now<period.endsAt,endIndexKey:[...prefix,Math.max(0,period.startsAt)],endInclusive:true});
 try{while(true){
  if(scanned&&(scanned>=64||reserve(budget,sources)||encodedBytes(items)>32000)){more=true;break;}
  sources.beforeRead();budget.beforeRead();const next=await iterator.next();if(next.done)break;
  const [post,position]=next.value;budget.record(post);sources.record("post",post);if(items.length>=args.limit){more=true;break;}
  key=coordinates.parse(position.slice(3));scanned++;
  if(post.publishedAt===undefined||post.publishedAt<period.startsAt||post.publishedAt>=period.endsAt||post.publishedAt>now||!await discover(post))continue;
  let image:RelatedResult["items"][number]["image"]=null;
  if(post.featuredImageId){sources.beforeRead();budget.beforeRead();const media=budget.record(await ctx.db.get("media",post.featuredImageId));if(media)sources.record("media",media);
   if(media?.status==="active"&&media.mediaType==="image"&&media.mimeType.startsWith("image/")){let src:string|null=null;if(media.storageId){budget.beforeRead();src=await ctx.storage.getUrl(media.storageId);}src??=media.url??null;if(src)image={src,alt:(media.altText??"").slice(0,512).replace(/[\uD800-\uDBFF]$/,"")};}
  }
  items.push({id:post._id,title:post.title||"Untitled post",href:`/blog/${encodeURIComponent(post.slug)}`,excerpt:post.excerpt?post.excerpt.slice(0,316).replace(/[\uD800-\uDBFF]$/,"")+(post.excerpt.length>316?"…":""):null,publishedAt:post.publishedAt,image});
 }}finally{await iterator.return(undefined);}
 return {timeZone,...relatedResultSchema.parse({type:"post",items,cursor:args.cursor,nextCursor:more?JSON.stringify({version:1,binding,key}):null})};
}
