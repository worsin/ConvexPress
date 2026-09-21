import { z } from "zod";
import { renderMediaSchema } from "./renderResources";
import { safeLinkSchema } from "./generated/field-runtime.mjs";
const cursor = z.string().min(1).max(4096).nullable();
export const relatedArgsSchema = z.strictObject({
  type:z.enum(["post","page"]).default("post"), limit:z.number().int().min(1).max(48).default(3), cursor:cursor.default(null),
});
export const relatedResultSchema = z.strictObject({
  type:z.enum(["post","page"]), cursor, nextCursor:cursor,
  items:z.array(z.strictObject({
    id:z.string().min(1).max(256), title:z.string().min(1).max(500),
    href:safeLinkSchema(z,["relative"]).max(2048), excerpt:z.string().max(320).nullable(),
    publishedAt:z.number().finite().min(0), image:renderMediaSchema.safeExtend({alt:z.string().max(512)}).nullable(),
  })).max(48),
}).superRefine((value,ctx)=>{
  if(value.nextCursor !== null && value.nextCursor === value.cursor) ctx.addIssue({code:"custom",message:"Related content pagination must advance"});
  if(new Set(value.items.map(item=>item.id)).size !== value.items.length) ctx.addIssue({code:"custom",message:"Duplicate related content"});
  for(const item of value.items) if(!item.href.startsWith(value.type === "post" ? "/blog/" : "/page/")) ctx.addIssue({code:"custom",message:"Related content route mismatch"});
  if(value.items.some((item,index)=>index>0 && item.publishedAt>value.items[index-1]!.publishedAt)) ctx.addIssue({code:"custom",message:"Related content must be newest first"});
});
export type RelatedArgs = z.infer<typeof relatedArgsSchema>;
export type RelatedResult = z.infer<typeof relatedResultSchema>;
export function relatedMatchesArgs(args:RelatedArgs,result:RelatedResult) {
  return result.type===args.type && result.cursor===args.cursor && result.items.length<=args.limit;
}
