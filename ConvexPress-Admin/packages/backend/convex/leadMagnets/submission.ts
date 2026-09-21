import {z} from "zod";
import {v,ConvexError,type Validator} from "convex/values";
import {makeFunctionReference,type RegisteredMutation} from "convex/server";
import {internalMutation,type QueryCtx} from "../_generated/server";
import type {Id,Doc} from "../_generated/dataModel";
import {sha256Hex,canonicalJson} from "../canonicalDocuments/foundation/shared/fingerprints";
import {getCurrentUser} from "../helpers/permissions";
import {timingSafeEquals} from "../helpers/timingSafe";
import {readLeadMagnetSource,type LeadMagnetSource} from "./source";
import type {SubmitRequest,Reservation,DeliveryResult,Proof} from "./types";
export const requestSchema:z.ZodType<SubmitRequest>=z.strictObject({postId:z.string().min(1).max(256),blockId:z.string().min(1).max(128),password:z.string().max(1024).optional(),offerDigest:z.string().regex(/^[a-f0-9]{64}$/),email:z.string().trim().toLowerCase().max(254).email(),marketingConsent:z.boolean(),requestId:z.string().regex(/^[a-zA-Z0-9_-]{16,80}$/),secret:z.string().regex(/^[a-f0-9]{64}$/),startedAt:z.number().int().nonnegative(),honeypot:z.string().max(1024),captchaToken:z.string().max(4096).optional()});
export const requestValidator={postId:v.string(),blockId:v.string(),password:v.optional(v.string()),offerDigest:v.string(),email:v.string(),marketingConsent:v.boolean(),requestId:v.string(),secret:v.string(),startedAt:v.number(),honeypot:v.string(),captchaToken:v.optional(v.string())};
export const resultValidator:Validator<DeliveryResult,"required",string>=v.object({leaseId:v.string(),expiresAt:v.number(),fileName:v.string(),fileSize:v.number()});
export const deny=():never=>{throw new ConvexError({code:"LEAD_MAGNET_UNAVAILABLE",message:"This download request is unavailable. Refresh the page and try again."});};
const lifetime=15*60*1000;
export const DELIVERY_RETENTION_MS=24*60*60*1000;
const payload=(args:SubmitRequest)=>sha256Hex(canonicalJson({postId:args.postId,blockId:args.blockId,offerDigest:args.offerDigest,email:args.email,marketingConsent:args.marketingConsent,requestId:args.requestId,secretHash:sha256Hex(args.secret)}));
export async function authorizedDelivery(ctx:QueryCtx,proof:Proof,allowPending=false):Promise<{delivery:Doc<"leadMagnetDeliveries">;source:LeadMagnetSource}>{
 if(!/^[a-f0-9]{64}$/.test(proof.secret))return deny();
 const id=ctx.db.normalizeId("leadMagnetDeliveries",proof.leaseId);if(!id)return deny();
 const delivery=await ctx.db.get("leadMagnetDeliveries",id),now=Date.now();
 if(!delivery||!timingSafeEquals(delivery.secretHash,sha256Hex(proof.secret))||delivery.expiresAt<=now||delivery.createdAt>now||delivery.expiresAt-delivery.createdAt>lifetime||(!allowPending&&delivery.status!=="ready"))return deny();
 // Only a verified, server-stored identity is used for a resumed capability.
 // No public parameter selects a viewer. Current user/session and membership
 // authority are resolved again by the regular source reader on every chunk.
 const ownedCtx:QueryCtx={...ctx,auth:{...ctx.auth,getUserIdentity:async()=>delivery.identity??null}};
 if(delivery.identity){const viewer=await getCurrentUser(ownedCtx);if(!viewer||viewer.status!=="active")return deny();}
 const source=await readLeadMagnetSource(ownedCtx,{postId:delivery.postId,blockId:delivery.blockId},undefined,delivery.passwordHash);
 if(!source||source.offer.digest!==delivery.offerDigest||source.list._id!==delivery.listId||source.site.websiteKey!==delivery.websiteKey||source.site.instanceKey!==delivery.instanceKey||source.site.deploymentOrigin!==delivery.deploymentOrigin)return deny();
 return {delivery,source};
}
export const reserve:RegisteredMutation<"internal",SubmitRequest,Promise<Reservation>>=internalMutation({
 args:requestValidator,returns:v.object({deliveryId:v.id("leadMagnetDeliveries"),ready:v.boolean(),offerDigest:v.string(),captchaEnabled:v.boolean(),captchaProvider:v.union(v.literal("none"),v.literal("turnstile"),v.literal("hcaptcha"),v.literal("recaptcha")),recaptchaMinScore:v.number(),failClosed:v.boolean()}),
 handler:async(ctx,raw)=>{
  const args=requestSchema.parse(raw),source=await readLeadMagnetSource(ctx,{postId:args.postId,blockId:args.blockId,...(args.password!==undefined?{password:args.password}:{})});if(!source||source.offer.digest!==args.offerDigest)return deny();
  const hash=payload(args),secretHash=sha256Hex(args.secret),identity=await ctx.auth.getUserIdentity();
  const existing=await ctx.db.query("leadMagnetDeliveries").withIndex("by_post_request",q=>q.eq("postId",source.post._id).eq("requestId",args.requestId)).unique();
  const result=(id:Id<"leadMagnetDeliveries">,ready:boolean):Reservation=>({deliveryId:id,ready,offerDigest:source.offer.digest,captchaEnabled:source.security.captchaEnabled,captchaProvider:source.security.captchaProvider,recaptchaMinScore:source.security.recaptchaMinScore,failClosed:source.security.failClosed});
  if(existing){if(existing.payloadHash!==hash||existing.identity?.tokenIdentifier!==identity?.tokenIdentifier)return deny();await authorizedDelivery(ctx,{leaseId:existing._id,secret:args.secret},true);if(existing.status==="pending"){if(existing.verificationAttempts>=3)return deny();await ctx.db.patch("leadMagnetDeliveries",existing._id,{verificationAttempts:existing.verificationAttempts+1});}return result(existing._id,existing.status==="ready");}
  const now=Date.now(),age=now-args.startedAt;
  if(age<source.security.minFillMs||age>source.security.maxFormAgeMs||(source.security.honeypotEnabled&&args.honeypot!==""))return deny();
  const emailHash=sha256Hex(args.email);
  const windowMs=Math.max(1000,Math.min(DELIVERY_RETENTION_MS,source.security.windowMs));
  // Always retain a bounded floor, even if general Forms rate limits are off.
  const [postAttempts,emailAttempts]=await Promise.all([
   ctx.db.query("leadMagnetDeliveries").withIndex("by_post_created",q=>q.eq("postId",source.post._id).gt("createdAt",now-windowMs)).take(100),
   ctx.db.query("leadMagnetDeliveries").withIndex("by_email_created",q=>q.eq("emailHash",emailHash).gt("createdAt",now-windowMs)).take(5),
  ]);
  if(postAttempts.length>=Math.min(100,source.security.perFormLimit??100)||emailAttempts.length>=5)return deny();
  const expiresAt=now+lifetime;
  const deliveryId=await ctx.db.insert("leadMagnetDeliveries",{postId:source.post._id,blockId:args.blockId,requestId:args.requestId,payloadHash:hash,secretHash,offerDigest:args.offerDigest,emailHash,listId:source.list._id,websiteKey:source.site.websiteKey,instanceKey:source.site.instanceKey,deploymentOrigin:source.site.deploymentOrigin,...(identity?{identity:{subject:identity.subject,issuer:identity.issuer,tokenIdentifier:identity.tokenIdentifier}}:{}),...(source.post.visibility==="password"&&source.post.password?{passwordHash:sha256Hex(source.post.password)}:{}),verificationAttempts:1,status:"pending",createdAt:now,expiresAt});
  await ctx.scheduler.runAfter(DELIVERY_RETENTION_MS,makeFunctionReference<"mutation",{deliveryId:Id<"leadMagnetDeliveries">},null>("leadMagnets/delivery:expire"),{deliveryId});
  return result(deliveryId,false);
 },
});
export const finalize:RegisteredMutation<"internal",SubmitRequest&{deliveryId:Id<"leadMagnetDeliveries">;captchaVerified:boolean},Promise<DeliveryResult>>=internalMutation({
 args:{...requestValidator,deliveryId:v.id("leadMagnetDeliveries"),captchaVerified:v.boolean()},returns:resultValidator,
 handler:async(ctx,raw)=>{
  const {deliveryId,captchaVerified,...input}=raw,args=requestSchema.parse(input);
  const {delivery,source}=await authorizedDelivery(ctx,{leaseId:deliveryId,secret:args.secret},true);
  if(delivery.payloadHash!==payload(args))return deny();
  const identity=await ctx.auth.getUserIdentity();if(identity?.tokenIdentifier!==delivery.identity?.tokenIdentifier)return deny();
  const result:DeliveryResult={leaseId:deliveryId,expiresAt:delivery.expiresAt,fileName:source.offer.file.name,fileSize:source.offer.file.bytes};
  if(delivery.status==="ready")return result;
  if(source.security.captchaEnabled&&!captchaVerified)return deny();
  const now=Date.now();let subscriberId:Id<"mailingListSubscribers">|undefined,event:"download_requested"|"subscribed"|"suppressed"="download_requested";
  if(args.marketingConsent){
   const existing=await ctx.db.query("mailingListSubscribers").withIndex("by_list_email",q=>q.eq("listId",source.list._id).eq("email",args.email)).unique();
   if(existing){subscriberId=existing._id;event=existing.status==="subscribed"?"subscribed":"suppressed";}
   else {subscriberId=await ctx.db.insert("mailingListSubscribers",{listId:source.list._id,email:args.email,status:"subscribed",consentText:source.list.consentText,privacyUrl:source.list.privacyUrl,consentedAt:now,sourcePostId:source.post._id,sourceBlockId:args.blockId,sourceRevision:source.offer.revision,updatedAt:now});event="subscribed";}
  }
  await ctx.db.patch("leadMagnetDeliveries",deliveryId,{status:"ready",email:args.email,marketingConsent:args.marketingConsent,...(subscriberId?{subscriberId}:{})});
  await ctx.db.insert("mailingListConsentEvents",{listId:source.list._id,deliveryId,...(args.marketingConsent?{secretHash:delivery.secretHash}:{}),emailHash:delivery.emailHash,...(subscriberId?{subscriberId}:{}),event,consentText:source.list.consentText,privacyUrl:source.list.privacyUrl,sourceRevision:source.offer.revision,createdAt:now});
  return result;
 },
});
