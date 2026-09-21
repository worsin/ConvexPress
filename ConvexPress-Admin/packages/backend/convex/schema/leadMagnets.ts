import {defineTable} from "convex/server";
import {v} from "convex/values";
export const leadIdentity=v.object({subject:v.string(),issuer:v.string(),tokenIdentifier:v.string()});
export const leadMagnetTables={
 leadMagnetDeliveries:defineTable({
  postId:v.id("posts"),blockId:v.string(),requestId:v.string(),payloadHash:v.string(),secretHash:v.string(),
  offerDigest:v.string(),emailHash:v.string(),listId:v.id("mailingLists"),
  websiteKey:v.string(),instanceKey:v.string(),deploymentOrigin:v.string(),
  identity:v.optional(leadIdentity),passwordHash:v.optional(v.string()),
  verificationAttempts:v.number(),status:v.union(v.literal("pending"),v.literal("ready")),createdAt:v.number(),expiresAt:v.number(),
  email:v.optional(v.string()),marketingConsent:v.optional(v.boolean()),subscriberId:v.optional(v.id("mailingListSubscribers")),startedAt:v.optional(v.number()),
 }).index("by_post_request",["postId","requestId"]).index("by_post_created",["postId","createdAt"]).index("by_email_created",["emailHash","createdAt"]).index("by_expires",["expiresAt"]),
 mailingListConsentEvents:defineTable({listId:v.id("mailingLists"),deliveryId:v.id("leadMagnetDeliveries"),secretHash:v.optional(v.string()),emailHash:v.string(),subscriberId:v.optional(v.id("mailingListSubscribers")),event:v.union(v.literal("download_requested"),v.literal("subscribed"),v.literal("suppressed"),v.literal("unsubscribed")),consentText:v.string(),privacyUrl:v.string(),sourceRevision:v.number(),createdAt:v.number()}).index("by_delivery",["deliveryId"]).index("by_list_email",["listId","emailHash"]),
};
