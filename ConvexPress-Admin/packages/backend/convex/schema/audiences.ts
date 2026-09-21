import {defineTable} from "convex/server";
import {v} from "convex/values";
export const mailingListStatus=v.union(v.literal("draft"),v.literal("active"),v.literal("archived"));
export const audienceStatus=v.union(v.literal("subscribed"),v.literal("unsubscribed"),v.literal("bounced"));
/** Each deployment owns its audience. Copying a list does not authorize the
 * receiving installation to reuse its consent or subscriber records. */
export const audienceTables={
 mailingLists:defineTable({
  websiteKey:v.string(),instanceKey:v.string(),name:v.string(),description:v.string(),
  consentText:v.string(),privacyUrl:v.string(),status:mailingListStatus,revision:v.number(),
  createdBy:v.id("users"),updatedBy:v.id("users"),createdAt:v.number(),updatedAt:v.number(),
 }).index("by_installation_name",["websiteKey","instanceKey","name"])
 .index("by_installation_status_name",["websiteKey","instanceKey","status","name"]),
 mailingListSubscribers:defineTable({
  listId:v.id("mailingLists"),email:v.string(),status:audienceStatus,
  consentText:v.string(),privacyUrl:v.string(),consentedAt:v.number(),
  sourcePostId:v.id("posts"),sourceBlockId:v.string(),sourceRevision:v.number(),
  unsubscribedAt:v.optional(v.number()),updatedAt:v.number(),
 }).index("by_list_email",["listId","email"]).index("by_list_status",["listId","status"]),
};
