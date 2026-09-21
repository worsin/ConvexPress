import { z } from "zod";
import { streamQuery } from "convex-helpers/server/pagination";
import { sha256Hex } from "@convexpress/site-contract";
import schema from "../schema";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isPluginEnabled } from "../helpers/plugins";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { evaluateMembershipAccess } from "../membership/access";
import { readProductRatingSummary } from "../commerceReviews/ratingIndex";
import { SOURCE_LIMITS, SourceByteLedger } from "./sourceBudget";
import { CanonicalDataError, encodedBytes, stableKey, type DataScope } from "./foundation/contracts";
import { reviewsArgsSchema, reviewsResultSchema, summarizeReviewPage, type ReviewsResult } from "./foundation/reviewsContracts";

const positionSchema=z.tuple([z.number().finite().min(0),z.number().finite().min(0),z.string().min(1).max(256)]);
const cursorSchema=z.strictObject({version:z.literal(1),binding:z.string().regex(/^[a-f0-9]{64}$/),after:positionSchema});
const clip=(value:string,max:number)=>value.slice(0,max).replace(/[\uD800-\uDBFF]$/,"");
type Product=NonNullable<ReviewsResult["product"]>;

/** Invoked only by the canonical document resolver after installation/document
 * authorization. The cursor selects a position, never a viewer or authority. */
export async function readReviews(ctx:QueryCtx,input:unknown,scope:DataScope,documentId:string,
  budget=new RequestReadLedger(),sources=new SourceByteLedger(),now=Date.now()):Promise<ReviewsResult> {
  const args=reviewsArgsSchema.parse(input),selection=args.source==="product"?args.product:null;
  const binding=sha256Hex(stableKey({scope,documentId,source:args.source,selection,limit:args.limit,minRating:args.minRating}));
  let after:z.infer<typeof positionSchema>|null=null;
  if(args.cursor){
    let cursor:z.infer<typeof cursorSchema>;
    try{cursor=cursorSchema.parse(JSON.parse(args.cursor));}catch{throw new CanonicalDataError("REVIEWS_CURSOR_FORMAT","cursor","Invalid review page cursor");}
    if(cursor.binding!==binding || cursor.after[0]>now || !ctx.db.normalizeId("commerce_review_items",cursor.after[2]))
      throw new CanonicalDataError("REVIEWS_CURSOR_SCOPE","cursor","Review page belongs to another selection, document or environment");
    after=cursor.after;
  }
  const unavailable:ReviewsResult={source:args.source,selection,availability:"unavailable",product:null,cursor:args.cursor,nextCursor:null,summary:null,items:[]};
  if(!(await isPluginEnabled(ctx,"commerce",budget)) || !(await isPluginEnabled(ctx,"commerceReviews",budget)))return unavailable;
  const products=new Map<Id<"commerce_products">,Product|null>(),authors=new Map<Id<"users">,string>();
  async function publicProduct(id:Id<"commerce_products">):Promise<Product|null>{
    if(products.has(id))return products.get(id)!;
    products.set(id,null);sources.beforeRead();budget.beforeRead();
    const row=budget.record(await ctx.db.get("commerce_products",id));if(row)sources.record("product",row);
    if(!row || row.status!=="publish" || !row.slug || row.slug.length>256 || (row.publishedAt!==undefined && (!Number.isFinite(row.publishedAt)||row.publishedAt>now)))return null;
    for(const resource of [{resourceType:"product" as const,resourceIdOrKey:String(id)},{resourceType:"route" as const,resourceIdOrKey:`/products/${encodeURIComponent(row.slug)}`}])
      if(!(await evaluateMembershipAccess(ctx,resource,budget)).allowed)return null;
    const product={id:String(id),title:clip(row.title||"Product",180),slug:row.slug,href:`/products/${encodeURIComponent(row.slug)}`};products.set(id,product);return product;
  }
  const productId=args.source==="product"?ctx.db.normalizeId("commerce_products",args.product):null;
  const product=productId?await publicProduct(productId):null;
  if(args.source==="product" && !product)return unavailable;
  let summary:ReviewsResult["summary"]=null;
  if(productId){const rating=await readProductRatingSummary(ctx,productId,budget);if(rating)summary={scope:"product",count:rating.count,average:rating.average,distribution:[rating.distribution[1],rating.distribution[2],rating.distribution[3],rating.distribution[4],rating.distribution[5]]};}
  const prefix=productId?[productId,"approved"]:["approved"];
  const iterator=streamQuery(ctx,{schema,table:"commerce_review_items",index:productId?"by_product_status_created":"by_status_created",order:"desc",
    startIndexKey:after?[...prefix,...after]:[...prefix,now],startInclusive:after===null,endIndexKey:[...prefix,0],endInclusive:true});
  const items:ReviewsResult["items"]=[];let scanned=0,more=false;
  try{
    while(true){
      if(scanned && (scanned>=64 || budget.queries>=budget.limits.queries-32 || budget.documents>=budget.limits.documents-96 ||
        budget.bytes>budget.limits.bytes-1024*1024 || encodedBytes(items)>32000 || sources.usedBytes>SOURCE_LIMITS.total-SOURCE_LIMITS.review-SOURCE_LIMITS.product)){more=true;break;}
      sources.beforeRead();budget.beforeRead();const next=await iterator.next();if(next.done)break;
      const [review,key]=next.value;budget.record(review);sources.record("review",review);
      if(items.length===args.limit){more=true;break;}
      after=positionSchema.parse(key.slice(prefix.length));scanned++;
      if(review.status!=="approved" || !Number.isInteger(review.rating) || review.rating<args.minRating || review.rating>5 || review.createdAt>now)continue;
      const reviewedProduct=await publicProduct(review.productId);if(!reviewedProduct)continue;
      if(!authors.has(review.userId)){budget.beforeRead();const author=budget.record(await ctx.db.get("users",review.userId));authors.set(review.userId,clip(author?.displayName?.trim()||"A reader",80));}
      items.push({id:review._id,product:reviewedProduct,rating:review.rating,title:review.title?clip(review.title,200):null,
        body:review.content?clip(review.content,640):null,bodyTruncated:(review.content?.length??0)>640,
        author:authors.get(review.userId)!,verifiedPurchase:review.isVerifiedPurchase,createdAt:review.createdAt});
    }
  }finally{await iterator.return(undefined);}
  if(args.source==="site")summary=summarizeReviewPage(items);
  return reviewsResultSchema.parse({source:args.source,selection,availability:"available",product,items,summary,cursor:args.cursor,
    nextCursor:more?JSON.stringify({version:1,binding,after}):null});
}
