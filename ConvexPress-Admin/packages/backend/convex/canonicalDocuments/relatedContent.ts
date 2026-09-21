/** Related content uses the authorized current document, never an authored ID. */
import { z } from "zod";
import { streamQuery } from "convex-helpers/server/pagination";
import { sha256Hex } from "@convexpress/site-contract";
import schema from "../schema";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { canDiscoverContent } from "../helpers/publicContent";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import type { NavigationSource } from "./navigation";
import { SOURCE_LIMITS, SourceByteLedger } from "./sourceBudget";
import { CanonicalDataError, encodedBytes, stableKey, type DataScope } from "./foundation/contracts";
import { relatedArgsSchema, relatedResultSchema, type RelatedResult } from "./foundation/relatedContracts";
const positionSchema=z.tuple([z.number().finite().min(0),z.number().finite().min(0),z.string().min(1).max(256)]);
const cursorSchema=z.strictObject({version:z.literal(1),binding:z.string().regex(/^[a-f0-9]{64}$/),after:positionSchema});

export async function readRelatedContent(ctx:QueryCtx,input:unknown,scope:DataScope,document:NavigationSource["document"],
  budget=new RequestReadLedger(),sources=new SourceByteLedger(),now=Date.now()):Promise<RelatedResult> {
  const args=relatedArgsSchema.parse(input);
  // Refuse oversized classifications explicitly instead of silently choosing
  // whichever topics happened to fall inside a truncated relationship query.
  async function relationships(postId:Id<"posts">) {
    budget.beforeRead();
    const rows=await ctx.db.query("termRelationships").withIndex("by_post",q=>q.eq("postId",postId)).take(65);
    for(const row of rows)budget.record(row);
    if(rows.length>64)throw new CanonicalDataError("RELATED_TOPIC_BUDGET","topics","Related content supports up to 64 topic relationships per document");
    return rows;
  }
  const topics=new Set<Id<"terms">>();
  for(const row of await relationships(document._id)) {
    if(topics.has(row.termId))continue;
    budget.beforeRead();const term=budget.record(await ctx.db.get("terms",row.termId));
    if(term && (term.taxonomy==="category" || term.taxonomy==="post_tag"))topics.add(term._id);
  }
  const siblings=args.type==="page" && document.type==="page";
  const binding=sha256Hex(stableKey({scope,documentId:document._id,type:args.type,limit:args.limit,
    topics:[...topics].sort(),siblings,parent:document.parentId ?? null}));
  let after:z.infer<typeof positionSchema>|null=null;
  if(args.cursor) {
    let cursor:z.infer<typeof cursorSchema>;
    try {cursor=cursorSchema.parse(JSON.parse(args.cursor));}
    catch {throw new CanonicalDataError("RELATED_CURSOR_FORMAT","cursor","Invalid related content cursor");}
    if(cursor.binding!==binding || !ctx.db.normalizeId("posts",cursor.after[2]) || cursor.after[0]>now)
      throw new CanonicalDataError("RELATED_CURSOR_SCOPE","cursor","Related content cursor belongs to another document, topic selection or environment");
    after=cursor.after;
  }
  const items:RelatedResult["items"]=[];
  if(!topics.size && !siblings)return {type:args.type,items,cursor:args.cursor,nextCursor:null};
  const prefix=[args.type,"publish","public"];
  const iterator=streamQuery(ctx,{schema,table:"posts",index:"by_public_discovery",order:"desc",
    startIndexKey:after?[...prefix,...after]:[...prefix,now],startInclusive:after===null,endIndexKey:[...prefix,0],endInclusive:true});
  let scanned=0,more=false;
  try {
    while(true) {
      // Shared page budgets include other blocks. Continue before the next
      // candidate can exhaust them; a filtered page may contain no cards.
      if(scanned && (scanned>=64 || budget.queries>=budget.limits.queries-32 ||
        budget.documents>=budget.limits.documents-96 || encodedBytes(items)>32000 ||
        sources.usedBytes>SOURCE_LIMITS.total-SOURCE_LIMITS.post-SOURCE_LIMITS.media)) {more=true;break;}
      sources.beforeRead();budget.beforeRead();const next=await iterator.next();
      if(next.done)break;
      const [post,key]=next.value;budget.record(post);sources.record("post",post);
      if(items.length===args.limit){more=true;break;}
      after=positionSchema.parse(key.slice(prefix.length));scanned++;
      if(post._id===document._id || post.type!==args.type || post.status!=="publish" || post.visibility!=="public" ||
        post.publishedAt===undefined || post.publishedAt>now)continue;
      let related=siblings && post.parentId===document.parentId;
      if(!related && topics.size)related=(await relationships(post._id)).some(row=>topics.has(row.termId));
      if(!related || !await canDiscoverContent(ctx,post,budget))continue;
      let image:RelatedResult["items"][number]["image"]=null;
      if(post.featuredImageId) {
        sources.beforeRead();budget.beforeRead();const media=budget.record(await ctx.db.get("media",post.featuredImageId));
        if(media)sources.record("media",media);
        if(media?.status==="active" && media.mediaType==="image" && media.mimeType.startsWith("image/")) {
          let src:string|null=null;
          if(media.storageId){budget.beforeRead();src=await ctx.storage.getUrl(media.storageId);}
          src??=media.url??null;
          if(src)image={src,alt:(media.altText??"").slice(0,512).replace(/[\uD800-\uDBFF]$/,"")};
        }
      }
      items.push({id:post._id,title:post.title || (args.type==="post"?"Untitled post":"Untitled page"),
        href:args.type==="post"?`/blog/${encodeURIComponent(post.slug)}`:`/page${post.path??`/${encodeURIComponent(post.slug)}`}`,
        excerpt:post.excerpt ? post.excerpt.slice(0,316).replace(/[\uD800-\uDBFF]$/,"")+(post.excerpt.length>316?"…":"") : null,
        publishedAt:post.publishedAt,image});
    }
  } finally {await iterator.return(undefined);}
  return relatedResultSchema.parse({type:args.type,items,cursor:args.cursor,nextCursor:more?JSON.stringify({version:1,binding,after}):null});
}
