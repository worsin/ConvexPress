import {z} from "zod";
import {safeLinkSchema} from "./generated/field-runtime.mjs";
// The dot prevents collisions with canonical block IDs; the key must also pass the Convex transport codec.
export const SEARCH_QUERY_REQUEST_KEY = "search.query";
export const searchQuerySchema = z.string().trim().max(500).refine(value => (value.match(/[\p{L}\p{N}]+/gu) ?? []).length <= 16, "Search supports at most 16 terms");
export const searchKindSchema=z.enum(["post","page","product","course","event"]);
export const searchArgsSchema=z.strictObject({query:searchQuerySchema.default(""),kinds:z.array(searchKindSchema).max(5).default([]),pageSize:z.number().int().min(1).max(48).default(12),cursor:z.string().min(1).max(4096).nullable().default(null)});
export const searchResultSchema=z.strictObject({
 query:searchQuerySchema,state:z.enum(["idle","ready"]),items:z.array(z.strictObject({
  id:z.string().min(1).max(256),kind:searchKindSchema,title:z.string().max(512),href:safeLinkSchema(z,["relative"]).max(2048),excerpt:z.string().max(1000),author:z.string().max(256).nullable(),publishedAt:z.number().int().nonnegative().nullable(),
 })).max(48),cursor:z.string().min(1).max(4096).nullable(),nextCursor:z.string().min(1).max(4096).nullable(),
}).superRefine((value,ctx)=>{
 if(new Set(value.items.map(item=>`${item.kind}:${item.id}`)).size!==value.items.length)ctx.addIssue({code:"custom",message:"Duplicate search result"});
 if(value.nextCursor!==null&&value.nextCursor===value.cursor)ctx.addIssue({code:"custom",message:"Search pagination must advance"});
 if(value.state==="idle"&&(value.query!==""||value.items.length||value.cursor||value.nextCursor))ctx.addIssue({code:"custom",message:"Idle search must be empty"});
});
export type SearchArgs=z.infer<typeof searchArgsSchema>;
export type SearchResult=z.infer<typeof searchResultSchema>;
export function searchMatchesArgs(args:SearchArgs,result:SearchResult):boolean{return args.query===result.query&&args.cursor===result.cursor&&result.items.length<=args.pageSize&&result.items.every(item=>args.kinds.length===0||args.kinds.includes(item.kind));}
