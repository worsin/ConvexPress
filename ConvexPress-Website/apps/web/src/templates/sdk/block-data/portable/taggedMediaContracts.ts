import {z} from "zod";
import {renderMediaSchema} from "./renderResources";
import {safeLinkSchema} from "./generated/field-runtime.mjs";
const id=z.string().min(1).max(256),cursor=z.string().min(1).max(4096).nullable();
export const taggedMediaArgsSchema=z.strictObject({tag:id.optional(),limit:z.number().int().min(1).max(48).default(6),cursor:cursor.default(null)});
export const taggedMediaResultSchema=z.strictObject({
 tag:z.strictObject({id,name:z.string().min(1).max(500)}).nullable(),
 items:z.array(z.strictObject({id,image:renderMediaSchema,caption:z.string().max(1000),credit:z.string().min(1).max(160),creditUrl:safeLinkSchema(z,["https"]).max(2048).nullable()})).max(48),
 cursor,nextCursor:cursor,
}).superRefine((value,ctx)=>{
 if(!value.tag&&(value.items.length||value.nextCursor))ctx.addIssue({code:"custom",message:"Unavailable tags cannot disclose images"});
 if(value.nextCursor!==null&&value.nextCursor===value.cursor)ctx.addIssue({code:"custom",message:"Image pagination must advance"});
 if(new Set(value.items.map(item=>item.id)).size!==value.items.length)ctx.addIssue({code:"custom",message:"Duplicate community image"});
 for(const item of value.items)if(item.creditUrl){try{const url=new URL(item.creditUrl);if(url.username||url.password)ctx.addIssue({code:"custom",message:"Credit links cannot contain credentials"});}catch{ctx.addIssue({code:"custom",message:"Invalid credit link"});}}
});
export type TaggedMediaArgs=z.infer<typeof taggedMediaArgsSchema>;
export type TaggedMediaResult=z.infer<typeof taggedMediaResultSchema>;
export function taggedMediaMatchesArgs(args:TaggedMediaArgs,result:TaggedMediaResult){return args.cursor===result.cursor&&result.items.length<=args.limit&&(!result.tag||result.tag.id===args.tag);}
