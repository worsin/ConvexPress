import type {MailingListFields} from "./types";
import {z} from "zod";
import {ConvexError} from "convex/values";
import type {QueryCtx} from "../_generated/server";
import type {Doc,Id} from "../_generated/dataModel";
export const listFieldsSchema:z.ZodType<MailingListFields>=z.strictObject({
 name:z.string().trim().min(1).max(160),description:z.string().trim().max(1000),
 consentText:z.string().trim().min(1).max(1000),privacyUrl:z.string().trim().min(1).max(2048).refine(value=>{
  if(/[\s\\\u0000-\u001f\u007f]/.test(value))return false;
  try{const url=new URL(value,"https://local.invalid");return !url.username&&!url.password&&(value.startsWith("/")&&!value.startsWith("//")||url.protocol==="https:"&&value.startsWith("https://"));}catch{return false;}
 },"Use a site-relative or HTTPS privacy-policy address"),
 status:z.enum(["draft","active","archived"]),
});
export const fail=(message:string):never=>{throw new ConvexError({code:"AUDIENCE_VALIDATION",message});};
export async function audienceInstallation(ctx:QueryCtx):Promise<{websiteKey:string;instanceKey:string}>{
 const site=await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key",q=>q.eq("identityKey","site-identity")).unique();
 if(!site)fail("Set up the website before managing its audience");return {websiteKey:site!.websiteKey,instanceKey:site!.instanceKey};
}
export async function ownedMailingList(ctx:QueryCtx,listId:Id<"mailingLists">):Promise<Doc<"mailingLists">|null>{
 const scope=await audienceInstallation(ctx),list=await ctx.db.get("mailingLists",listId);
 return list&&list.websiteKey===scope.websiteKey&&list.instanceKey===scope.instanceKey?list:null;
}
export function boundedAudiencePage(size:number){if(!Number.isInteger(size)||size<1||size>50)fail("Choose between 1 and 50 records per page");}
