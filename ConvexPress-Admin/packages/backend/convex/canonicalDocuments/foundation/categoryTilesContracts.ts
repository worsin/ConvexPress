import { z } from "zod";
import { safeLinkSchema } from "./generated/field_runtime.mjs";
export const categoryTilesArgsSchema = z.strictObject({
  cursor: z.string().min(1).max(4096).nullable().default(null),
  categorySlugs: z.array(z.string().max(160)).max(24).default([]),
  count: z.number().int().min(1).max(24).default(6),
  showCounts: z.boolean().default(true),
  showDescriptions: z.boolean().default(false),
});
export const categoryTilesResultSchema = z.strictObject({
  state:z.enum(["ready","discovering","counting"]).default("ready"),
  cursor:z.string().min(1).max(4096).nullable().default(null),
  nextCursor:z.string().min(1).max(4096).nullable().default(null),
  items:z.array(z.strictObject({
  id:z.string().min(1).max(256),slug:z.string().min(1).max(160),name:z.string().max(512),
  href:safeLinkSchema(z,["relative"]).max(2048),
  description:z.string().max(8192).nullable(),
  image:z.strictObject({src:safeLinkSchema(z,["http","https","relative"]).max(4096),alt:z.string().max(1000)}).nullable(),
  productCount:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
})).max(24)}).superRefine(({items,state,cursor,nextCursor},ctx)=>{
  if ((state === "ready") !== (nextCursor === null) || (nextCursor !== null && nextCursor === cursor)) ctx.addIssue({code:"custom",message:"Continuation must advance until ready"});
  if (state === "discovering" && items.length) ctx.addIssue({code:"custom",message:"Discovery cannot expose a partial category selection"});
  if (state !== "ready" && items.some(item=>item.productCount!==null)) ctx.addIssue({code:"custom",message:"Partial counts cannot be displayed"});
  const seen=new Set<string>();
  for(const [index,item] of items.entries()) {
    if(seen.has(item.id))ctx.addIssue({code:"custom",path:["items",index],message:"Duplicate category identity"});
    seen.add(item.id);
    if(item.href!==`/categories/${encodeURIComponent(item.slug)}`)ctx.addIssue({code:"custom",path:["items",index,"href"],message:"Category link must match its slug"});
  }
});
export type CategoryTilesArgs=z.infer<typeof categoryTilesArgsSchema>;
export type CategoryTilesResult=z.infer<typeof categoryTilesResultSchema>;
export function categoryTilesMatchArgs(args:CategoryTilesArgs,result:CategoryTilesResult):boolean {
  if(result.items.length>args.count || result.cursor!==args.cursor || (!args.showCounts && result.state==="counting"))return false;
  const selected=[...new Set(args.categorySlugs.map(slug=>slug.trim().toLowerCase()))];let previous=-1;
  for(const item of result.items) {
    if((!args.showCounts&&item.productCount!==null)||(args.showCounts&&result.state==="ready"&&item.productCount===null)||(!args.showDescriptions&&item.description!==null))return false;
    if(args.categorySlugs.length){const index=selected.indexOf(item.slug);if(index<=previous)return false;previous=index;}
  }
  return true;
}
