import {z} from "zod";
import {v,ConvexError} from "convex/values";
import type {RegisteredQuery,RegisteredMutation} from "convex/server";
import {query,mutation,type QueryCtx} from "../_generated/server";
import {canonicalJson,sha256Hex} from "@convexpress/site-contract";
import {readAppearance} from "../settings/appearanceMigration";
import {ownedMailingList,listFieldsSchema} from "./policy";
import {timingSafeEquals} from "../helpers/timingSafe";

type Offer={name:string;consentText:string;privacyUrl:string;digest:string};
type Subscribe={audienceId:string;offerDigest:string;email:string;consent:boolean;secret:string;startedAt:number;honeypot:string};
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const deny=():never=>{throw new ConvexError({code:"FOOTER_NEWSLETTER_UNAVAILABLE",message:"This signup is unavailable. Refresh the page and try again."});};
const request=z.strictObject({audienceId:z.string().min(1).max(256),offerDigest:z.string().regex(/^[a-f0-9]{64}$/),email:z.string().trim().toLowerCase().max(254).email(),consent:z.literal(true),secret:z.string().regex(/^[a-f0-9]{64}$/),startedAt:z.number().int().nonnegative(),honeypot:z.literal("")});
/** A client-selected ID is never sufficient: the active, published footer must
 * expose this list. Draft/inactive packs and hidden Minimal footers confer no authority. */
async function source(ctx:QueryCtx,audienceId:string){
 const listId=ctx.db.normalizeId("mailingLists",audienceId);if(!listId)return null;
 const {values}=await readAppearance(ctx);if(values.variants["chrome.footer"]==="minimal")return null;
 const footer=record(values.settings[values.active]?.footer),rows=footer.rows;
 if(!Array.isArray(rows)||rows.length>100)return null;
 let location:{rowId:string;columnId:string}|null=null;
 for(const rawRow of rows){const row=record(rawRow);if(typeof row.id!=="string"||!Array.isArray(row.columns)||row.columns.length>100)continue;
  for(const rawColumn of row.columns){const column=record(rawColumn),cell=record(column.cell);if(typeof column.id==="string"&&cell.type==="newsletter"&&cell.audienceId===audienceId){location={rowId:row.id,columnId:column.id};break;}}if(location)break;
 }
 if(!location)return null;
 const list=await ownedMailingList(ctx,listId);if(!list||list.status!=="active"||!listFieldsSchema.safeParse({name:list.name,description:list.description,consentText:list.consentText,privacyUrl:list.privacyUrl,status:list.status}).success)return null;
 const digest=sha256Hex(canonicalJson({version:1,websiteKey:list.websiteKey,instanceKey:list.instanceKey,appearance:values,listId,listRevision:list.revision,consentText:list.consentText,privacyUrl:list.privacyUrl}));
 return {list,footer:{packId:values.active,...location,digest},offer:{name:list.name,consentText:list.consentText,privacyUrl:list.privacyUrl,digest}};
}
export const offer:RegisteredQuery<"public",{audienceId:string},Promise<Offer|null>>=query({args:{audienceId:v.string()},returns:v.union(v.null(),v.object({name:v.string(),consentText:v.string(),privacyUrl:v.string(),digest:v.string()})),handler:async(ctx,args)=>args.audienceId.length>256?null:(await source(ctx,args.audienceId))?.offer??null});
export const subscribe:RegisteredMutation<"public",Subscribe,Promise<{ok:true}>>=mutation({
 args:{audienceId:v.string(),offerDigest:v.string(),email:v.string(),consent:v.boolean(),secret:v.string(),startedAt:v.number(),honeypot:v.string()},returns:v.object({ok:v.literal(true)}),handler:async(ctx,raw)=>{
  const parsed=request.safeParse(raw);if(!parsed.success)return deny();const args=parsed.data,now=Date.now(),age=now-args.startedAt;
  if(age<1000||age>3600000)return deny();
  const current=await source(ctx,args.audienceId);if(!current||current.offer.digest!==args.offerDigest)return deny();
  const emailHash=sha256Hex(args.email);
  const [emailAttempts,totalAttempts]=await Promise.all([
   ctx.db.query("mailingListConsentEvents").withIndex("by_email_created",q=>q.eq("emailHash",emailHash).gt("createdAt",now-3600000)).take(5),
   ctx.db.query("mailingListConsentEvents").withIndex("by_created",q=>q.gt("createdAt",now-3600000)).take(100),
  ]);if(emailAttempts.length>=5||totalAttempts.length>=100)return deny();
  const existing=await ctx.db.query("mailingListSubscribers").withIndex("by_list_email",q=>q.eq("listId",current.list._id).eq("email",args.email)).unique();
  // Never refresh existing consent, rotate an existing opt-out capability, or
  // re-enable a bounced/unsubscribed address through anonymous signup.
  if (!existing && await ctx.db.query("mailingListSubscribers").withIndex("by_unsubscribe_secret", q => q.eq("unsubscribeSecretHash", sha256Hex(args.secret))).first()) return deny();
  const subscriberId=existing?._id??await ctx.db.insert("mailingListSubscribers",{listId:current.list._id,email:args.email,status:"subscribed",consentText:current.list.consentText,privacyUrl:current.list.privacyUrl,consentedAt:now,sourceFooter:current.footer,sourceBlockId:`${current.footer.rowId}/${current.footer.columnId}`,sourceRevision:current.list.revision,unsubscribeSecretHash:sha256Hex(args.secret),updatedAt:now});
  await ctx.db.insert("mailingListConsentEvents",{listId:current.list._id,subscriberId,emailHash,event:existing&&existing.status!=="subscribed"?"suppressed":"subscribed",consentText:current.list.consentText,privacyUrl:current.list.privacyUrl,sourceRevision:current.list.revision,sourceFooter:current.footer,createdAt:now});
  // Same receipt for new, existing and suppressed addresses; no enumeration.
  return {ok:true as const};
 },
});
export const unsubscribe:RegisteredMutation<"public",{secret:string},Promise<null>>=mutation({args:{secret:v.string()},returns:v.null(),handler:async(ctx,{secret})=>{
 if(!/^[a-f0-9]{64}$/.test(secret))return null;const hash=sha256Hex(secret);
 const member=await ctx.db.query("mailingListSubscribers").withIndex("by_unsubscribe_secret",q=>q.eq("unsubscribeSecretHash",hash)).first();
 if(!member?.unsubscribeSecretHash||!timingSafeEquals(hash,member.unsubscribeSecretHash)||member.status!=="subscribed"||!await ownedMailingList(ctx,member.listId))return null;
 const now=Date.now();await ctx.db.patch("mailingListSubscribers",member._id,{status:"unsubscribed",unsubscribedAt:now,updatedAt:Math.max(now,member.updatedAt+1)});
 await ctx.db.insert("mailingListConsentEvents",{listId:member.listId,subscriberId:member._id,emailHash:sha256Hex(member.email),event:"unsubscribed",consentText:member.consentText,privacyUrl:member.privacyUrl,sourceRevision:member.sourceRevision,...(member.sourceFooter?{sourceFooter:member.sourceFooter}:{}),createdAt:now});return null;
}});
