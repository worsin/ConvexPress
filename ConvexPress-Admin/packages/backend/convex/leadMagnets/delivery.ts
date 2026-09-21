import {v} from "convex/values";
import type {RegisteredMutation,RegisteredQuery} from "convex/server";
import {internalMutation,internalQuery,mutation} from "../_generated/server";
import type {Id} from "../_generated/dataModel";
import {authorizedDelivery,deny,DELIVERY_RETENTION_MS} from "./submission";
import type {Proof} from "./types";
import type {LeaseRead} from "../commerceDigital/delivery";
import {ownedMailingList} from "../audiences/policy";
import {sha256Hex} from "../canonicalDocuments/foundation/shared/fingerprints";
import {timingSafeEquals} from "../helpers/timingSafe";
const proofValidator={leaseId:v.string(),secret:v.string()};
export const readLease:RegisteredQuery<"internal",Proof&{requestTime:number},Promise<LeaseRead>>=internalQuery({
 args:{...proofValidator,requestTime:v.number()},returns:v.object({fileName:v.string(),mimeType:v.string(),fileSize:v.number(),etag:v.string(),expiresAt:v.number(),url:v.string()}),
 handler:async(ctx,args)=>{const {delivery,source}=await authorizedDelivery(ctx,args);const url=await ctx.storage.getUrl(source.media.storageId!);if(!url)return deny();return {fileName:source.offer.file.name,mimeType:source.offer.file.mimeType,fileSize:source.offer.file.bytes,etag:`"${source.fileFingerprint}"`,expiresAt:delivery.expiresAt,url};},
});
export const startLease:RegisteredMutation<"internal",Proof,Promise<null>>=internalMutation({
 args:proofValidator,returns:v.null(),handler:async(ctx,args)=>{const {delivery}=await authorizedDelivery(ctx,args);if(delivery.startedAt===undefined)await ctx.db.patch("leadMagnetDeliveries",delivery._id,{startedAt:Date.now()});return null;},
});
export const expire:RegisteredMutation<"internal",{deliveryId:Id<"leadMagnetDeliveries">},Promise<null>>=internalMutation({
 args:{deliveryId:v.id("leadMagnetDeliveries")},returns:v.null(),handler:async(ctx,args)=>{const row=await ctx.db.get("leadMagnetDeliveries",args.deliveryId);if(row&&row.createdAt+DELIVERY_RETENTION_MS<=Date.now())await ctx.db.delete("leadMagnetDeliveries",row._id);return null;},
});
/** Opt-out survives download expiry and page removal. The original consent
 * receipt proves its exact list/subscriber; responses do not reveal existence. */
export const unsubscribe:RegisteredMutation<"public",Proof,Promise<null>>=mutation({
 args:proofValidator,returns:v.null(),handler:async(ctx,args)=>{
  if(!/^[a-f0-9]{64}$/.test(args.secret))return null;
  const id=ctx.db.normalizeId("leadMagnetDeliveries",args.leaseId);if(!id)return null;
  const events=await ctx.db.query("mailingListConsentEvents").withIndex("by_delivery",q=>q.eq("deliveryId",id)).take(3);
  const receipt=events.find(row=>row.event!=="unsubscribed"&&row.secretHash!==undefined);
  if(!receipt?.secretHash||!receipt.subscriberId||!timingSafeEquals(receipt.secretHash,sha256Hex(args.secret)))return null;
  if(!await ownedMailingList(ctx,receipt.listId))return null;
  const subscriber=await ctx.db.get("mailingListSubscribers",receipt.subscriberId);
  if(!subscriber||subscriber.listId!==receipt.listId||sha256Hex(subscriber.email)!==receipt.emailHash||subscriber.status!=="subscribed")return null;
  const now=Date.now();await ctx.db.patch("mailingListSubscribers",subscriber._id,{status:"unsubscribed",unsubscribedAt:now,updatedAt:Math.max(now,subscriber.updatedAt+1)});
  await ctx.db.insert("mailingListConsentEvents",{listId:receipt.listId,deliveryId:id,emailHash:receipt.emailHash,subscriberId:subscriber._id,event:"unsubscribed",consentText:receipt.consentText,privacyUrl:receipt.privacyUrl,sourceRevision:receipt.sourceRevision,createdAt:now});return null;
 },
});
