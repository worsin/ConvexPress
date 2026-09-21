import {v} from "convex/values";
import {makeFunctionReference} from "convex/server";
import {query,mutation,action,internalQuery,internalMutation} from "../../_generated/server";
import type {Id} from "../../_generated/dataModel";
import type {QueryCtx,MutationCtx} from "../../_generated/server";
import {internal} from "../../_generated/api";
import {rsvpAuthority,ownRsvp,rsvpTotal,refuse,type RsvpTarget,type RsvpAuthority} from "./rsvpAuthority";
import {rsvpSecurity,recordRsvpRate} from "./rsvpSecurity";
import {createRsvpSnapshotValidator,rsvpReceiptValidator} from "./rsvpValidators";
import {rsvpContactSchema,rsvpSnapshotSchema,type RsvpSnapshot,type RsvpReceipt} from "../../canonicalDocuments/foundation/rsvpContracts";
import {sha256Hex,canonicalJson} from "../../canonicalDocuments/foundation/shared/fingerprints";
import {retryPollWrite} from "../../canonicalDocuments/foundation/pollRetry";
import {RequestReadLedger} from "../../helpers/requestReadLedger";
export const targetArgs={postId:v.id("posts"),blockId:v.string(),instanceKey:v.string(),password:v.optional(v.string()),visitorToken:v.optional(v.string())};
const snapshotValidator=createRsvpSnapshotValidator(v.id("extension_events"));
export async function readRsvpSnapshot(ctx:QueryCtx,args:RsvpTarget,budget=new RequestReadLedger()):Promise<(RsvpSnapshot&{postId:Id<"posts">;eventId:Id<"extension_events">})|null>{
 const source=await rsvpAuthority(ctx,args,budget);if(!source)return null;
 const own=await ownRsvp(ctx,source),total=await rsvpTotal(ctx,source),security=await rsvpSecurity(ctx,source),asOf=Date.now();
 if(own?.status==="confirmed"&&(!total||total.confirmed<1))refuse("RSVP_COUNT_UNAVAILABLE","This event's RSVP count needs repair.");
 const remaining=source.settings.capacity===null?null:Math.max(0,source.settings.capacity-(total?.confirmed??0));
 const state=source.event.status==="cancelled"?"cancelled":asOf>=source.closesAt?"closed":source.settings.mode==="signedIn"&&!source.userId?"sign-in-required":remaining===0&&own?.status!=="confirmed"?"full":"open";
 const boundaries=[source.closesAt,source.event.startsAt,source.budget.authorizationRecheckAt].filter((value):value is number=>value!==null&&value>asOf);
 const parsed=rsvpSnapshotSchema.parse({providerId:"events",postId:args.postId,blockId:args.blockId,eventId:source.event._id,definitionVersion:source.definitionVersion,title:source.event.title,href:`/events/${source.event.slug}`,startsAt:source.event.startsAt,endsAt:source.event.endsAt,timeZone:source.event.timeZone,venue:source.event.venue,state,closesAt:source.closesAt,remaining,responsePolicy:source.settings.mode,
 registration:own?{status:own.status,revision:own.revision,name:own.name,email:own.email}:null,canCancel:own?.status==="confirmed"&&asOf<source.event.startsAt,asOf,nextChangeAt:boundaries.length?Math.min(...boundaries):null,security:security.publicSecurity});
 return {...parsed,postId:args.postId,eventId:source.event._id};
}
export const get=query({args:{...targetArgs,refreshKey:v.optional(v.string())},returns:v.union(v.null(),snapshotValidator),handler:(ctx,args)=>args.refreshKey!==undefined&&args.refreshKey.length>128?Promise.resolve(null):readRsvpSnapshot(ctx,args)});
export const writeArgs={...targetArgs,operation:v.union(v.literal("register"),v.literal("cancel")),requestKey:v.string(),definitionVersion:v.string(),expectedRevision:v.number(),contact:v.optional(v.object({name:v.string(),email:v.string()})),honeypot:v.optional(v.string())};
export type Write=RsvpTarget&{operation:"register"|"cancel";requestKey:string;definitionVersion:string;expectedRevision:number;contact?:{name:string;email:string};honeypot?:string};
type Proof={fingerprint:string;verifiedAt:number};
function normalize(args:Write){
 if(!/^[A-Za-z0-9_-]{16,128}$/.test(args.requestKey)||!/^[a-f0-9]{64}$/.test(args.definitionVersion)||!Number.isSafeInteger(args.expectedRevision)||args.expectedRevision<0||args.expectedRevision>=Number.MAX_SAFE_INTEGER-1||(args.honeypot?.length??0)>1024)refuse("RSVP_REQUEST","Invalid RSVP request. Refresh before trying again.");
 const parsed=rsvpContactSchema.safeParse(args.contact);
 if(args.operation==="register"&&!parsed.success || args.operation==="cancel"&&args.contact!==undefined)refuse("RSVP_CONTACT","Enter your name and a valid email address.");
 const contact=args.operation==="register"&&parsed.success?parsed.data:null;
 const fingerprint=sha256Hex(canonicalJson([args.postId,args.blockId,args.instanceKey,args.operation,args.definitionVersion,args.expectedRevision,contact]));
 return {contact,fingerprint};
}
async function previousOperation(ctx:QueryCtx,args:Write,source:RsvpAuthority,fingerprint:string){
 source.budget.beforeRead();const prior=source.budget.record(await ctx.db.query("event_rsvp_operations").withIndex("by_event_actor_key",q=>q.eq("eventId",source.event._id).eq("actorHash",source.actorHash!).eq("requestKey",args.requestKey)).unique());
 if(prior&&prior.fingerprint!==fingerprint)refuse("RSVP_REQUEST_REUSED","This request was already used for different RSVP details. Refresh before trying again.");return prior?.receipt??null;
}
async function prepare(ctx:QueryCtx,args:Write){
 const payload=normalize(args),source=await rsvpAuthority(ctx,args);if(!source||!source.actorHash)refuse();
 const prior=await previousOperation(ctx,args,source,payload.fingerprint);if(prior)return {source,payload,prior};
 if(source.definitionVersion!==args.definitionVersion)refuse("RSVP_CHANGED","Event details changed. Refresh before sending your RSVP.");
 const now=Date.now();if(args.operation==="register"&&(source.event.status!=="published"||now>=source.closesAt))refuse("RSVP_CLOSED","Registration is closed for this event.");
 if(args.operation==="cancel"&&now>=source.event.startsAt)refuse("RSVP_STARTED","This event has started. Contact the organizer to change your RSVP.");
 return {source,payload,prior:null};
}
export async function writeRsvp(ctx:MutationCtx,args:Write,proof?:Proof):Promise<RsvpReceipt>{
 const {source,payload,prior}=await prepare(ctx,args);if(prior)return prior;
 const own=await ownRsvp(ctx,source);if((own?.revision??0)!==args.expectedRevision)refuse("RSVP_CONFLICT","Your RSVP changed in another tab. Refresh before trying again.");
 if(args.operation==="cancel"&&own?.status!=="confirmed")refuse("RSVP_NOT_REGISTERED","There is no confirmed RSVP to cancel.");
 if(args.operation==="register"){
  const policy=await rsvpSecurity(ctx,source);
  if(policy.publicSecurity.honeypotEnabled&&args.honeypot?.trim())refuse();
  if(policy.required&&(!proof||proof.fingerprint!==policy.fingerprint||proof.verifiedAt>Date.now()||Date.now()-proof.verifiedAt>30000))refuse("RSVP_VERIFICATION_REQUIRED","Complete the verification challenge before sending your RSVP.");
  await recordRsvpRate(ctx,source,policy);
 }
 const total=await rsvpTotal(ctx,source),confirmed=total?.confirmed??0;
 if(own?.status==="confirmed"&&(!total||confirmed<1))refuse("RSVP_COUNT_UNAVAILABLE","This event's RSVP count needs repair.");
 const delta=args.operation==="cancel"?-1:own?.status==="confirmed"?0:1;
 if(delta>0&&source.settings.capacity!==null&&confirmed>=source.settings.capacity)refuse("RSVP_FULL","This event is full. A place may become available if someone cancels.");
 const status=args.operation==="register"?"confirmed" as const:"cancelled" as const,revision=(own?.revision??0)+1,now=Date.now();
 const contact=payload.contact??(own?{name:own.name,email:own.email}:null);if(!contact)refuse();
 const fields={...contact,status,revision,updatedAt:now};
 if(own)await ctx.db.patch("event_rsvp_entries",own._id,fields);
 else await ctx.db.insert("event_rsvp_entries",{eventId:source.event._id,actorHash:source.actorHash!,...(source.userId?{userId:source.userId}:{}),...fields,createdAt:now});
 if(total)await ctx.db.patch("event_rsvp_totals",total._id,{confirmed:confirmed+delta,updatedAt:now});
 else await ctx.db.insert("event_rsvp_totals",{eventId:source.event._id,confirmed:confirmed+delta,updatedAt:now});
 const receipt={status,revision};
 await ctx.db.insert("event_rsvp_operations",{eventId:source.event._id,actorHash:source.actorHash!,requestKey:args.requestKey,fingerprint:payload.fingerprint,receipt,createdAt:now});
 return receipt;
}
export const submit=mutation({args:writeArgs,returns:rsvpReceiptValidator,handler:(ctx,args)=>writeRsvp(ctx,args)});
export const submitVerified=internalMutation({args:{...writeArgs,verification:v.object({fingerprint:v.string(),verifiedAt:v.number()})},returns:rsvpReceiptValidator,handler:(ctx,{verification,...args})=>writeRsvp(ctx,args,verification)});
const preparationValidator=v.object({prior:v.union(v.null(),rsvpReceiptValidator),fingerprint:v.string(),required:v.boolean(),provider:v.union(v.literal("none"),v.literal("turnstile"),v.literal("hcaptcha"),v.literal("recaptcha")),minScore:v.number(),failClosed:v.boolean()});
type Preparation={prior:RsvpReceipt|null;fingerprint:string;required:boolean;provider:"none"|"turnstile"|"hcaptcha"|"recaptcha";minScore:number;failClosed:boolean};
export const prepareVerification=internalQuery({args:writeArgs,returns:preparationValidator,handler:async(ctx,args):Promise<Preparation>=>{
 const {source,prior}=await prepare(ctx,args);if(prior||args.operation==="cancel")return {prior,fingerprint:"",required:false,provider:"none",minScore:.5,failClosed:true};
 const policy=await rsvpSecurity(ctx,source);if(policy.publicSecurity.honeypotEnabled&&args.honeypot?.trim())refuse();
 return {prior:null,fingerprint:policy.fingerprint,required:policy.required,provider:policy.provider,minScore:policy.minScore,failClosed:policy.failClosed};
}});
export const submitWithVerification=action({args:{...writeArgs,captchaToken:v.optional(v.string())},returns:rsvpReceiptValidator,handler:async(ctx,{captchaToken,...args}):Promise<RsvpReceipt>=>{
 if(captchaToken!==undefined&&(!captchaToken.trim()||captchaToken.length>8192))refuse();
 const prepared=await ctx.runQuery(makeFunctionReference<"query",Write,Preparation>("extensions/events/rsvp:prepareVerification"),args);if(prepared.prior)return prepared.prior;
 if(prepared.required){
  if(!captchaToken||prepared.provider==="none")refuse("RSVP_VERIFICATION_REQUIRED","Complete the verification challenge before sending your RSVP.");
  const result=await ctx.runAction(internal.extensions.forms.spam.runCaptchaVerification,{provider:prepared.provider,token:captchaToken,recaptchaMinScore:prepared.minScore,failClosed:prepared.failClosed});
  if(result.block)refuse("RSVP_VERIFICATION_REQUIRED","Verification failed. Please try again.");
 }
 const verified={...args,verification:{fingerprint:prepared.fingerprint,verifiedAt:Date.now()}};
 return retryPollWrite(()=>ctx.runMutation(makeFunctionReference<"mutation",Write&{verification:Proof},RsvpReceipt>("extensions/events/rsvp:submitVerified"),verified));
}});
