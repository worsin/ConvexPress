import { z } from "zod";
import { safeLinkSchema } from "./generated/field-runtime.mjs";
const cursor = z.string().min(1).max(4096).nullable();
export const reviewsArgsSchema = z.strictObject({
  source: z.enum(["site", "product"]).default("site"), product: z.string().max(256).default(""),
  limit: z.number().int().min(1).max(48).default(6), minRating: z.number().int().min(1).max(5).default(1), cursor: cursor.default(null),
});
const productSchema = z.strictObject({ id: z.string().min(1).max(256), title: z.string().min(1).max(180), slug: z.string().min(1).max(256), href: safeLinkSchema(z, ["relative"]).max(3072) })
  .superRefine((value,ctx) => { if(value.href !== `/products/${encodeURIComponent(value.slug)}`)ctx.addIssue({ code:"custom",message:"Review product link must match its slug" }); });
export const reviewCardSchema = z.strictObject({
  id: z.string().min(1).max(256), product: productSchema, rating: z.number().int().min(1).max(5),
  title: z.string().max(200).nullable(), body: z.string().max(640).nullable(), bodyTruncated: z.boolean(),
  author: z.string().min(1).max(80), verifiedPurchase: z.boolean(), createdAt: z.number().finite().min(0).max(8640000000000000),
});
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const reviewSummarySchema = z.strictObject({
  scope: z.enum(["product", "page"]), count, average: z.number().finite().min(0).max(5),
  distribution: z.tuple([count,count,count,count,count]),
}).superRefine((value,ctx) => {
  const total=value.distribution.reduce((sum,n)=>sum+n,0), weighted=value.distribution.reduce((sum,n,i)=>sum+n*(i+1),0);
  if(!Number.isSafeInteger(total) || !Number.isSafeInteger(weighted) || total!==value.count || Math.abs(value.average-(total?weighted/total:0))>1e-10)
    ctx.addIssue({ code:"custom",message:"Review totals and rating distribution must agree" });
});
export const reviewsResultSchema = z.strictObject({
  source: z.enum(["site", "product"]), selection: z.string().max(256).nullable(),
  availability: z.enum(["available", "unavailable"]), product: productSchema.nullable(),
  cursor, nextCursor: cursor, summary: reviewSummarySchema.nullable(), items: z.array(reviewCardSchema).max(48),
}).superRefine((value,ctx) => {
  const refuse=(message:string)=>ctx.addIssue({code:"custom",message});
  if(value.nextCursor!==null && value.nextCursor===value.cursor)refuse("Review pagination must advance");
  if(new Set(value.items.map(item=>item.id)).size!==value.items.length)refuse("Review identities must be unique");
  if(value.items.some((item,i)=>i>0 && item.createdAt>value.items[i-1]!.createdAt))refuse("Reviews must be newest first");
  if(value.availability==="unavailable") { if(value.items.length || value.product || value.summary || value.nextCursor)refuse("Unavailable reviews contain no source data"); return; }
  if(value.source==="product") {
    if(!value.product || value.product.id!==value.selection || value.items.some(item=>item.product.id!==value.selection) || value.summary?.scope==="page")refuse("Product reviews must match their selection");
  } else if(value.product || value.selection!==null || !value.summary || value.summary.scope!=="page")refuse("Site summaries describe the displayed reviews");
  const displayed=[0,0,0,0,0]; for(const item of value.items)displayed[item.rating-1]!++;
  if(value.summary && (value.summary.count<value.items.length || displayed.some((n,i)=>n>value.summary!.distribution[i]!)))refuse("Summary cannot exclude displayed ratings");
  if(value.summary?.scope==="page" && (value.summary.count!==value.items.length || displayed.some((n,i)=>n!==value.summary!.distribution[i])))refuse("Page summaries match exactly the displayed reviews");
});
export type ReviewsArgs = z.infer<typeof reviewsArgsSchema>;
export type ReviewsResult = z.infer<typeof reviewsResultSchema>;
export function summarizeReviewPage(items: readonly {rating:number}[]): z.infer<typeof reviewSummarySchema> {
  const distribution:[number,number,number,number,number]=[0,0,0,0,0]; for(const item of items)distribution[item.rating-1]!++;
  return {scope:"page",count:items.length,average:items.length?items.reduce((sum,item)=>sum+item.rating,0)/items.length:0,distribution};
}
export function reviewsMatchArgs(args:ReviewsArgs,result:ReviewsResult):boolean {
  return result.source===args.source && result.selection===(args.source==="product"?args.product:null) && result.cursor===args.cursor && result.items.length<=args.limit && result.items.every(item=>item.rating>=args.minRating);
}
