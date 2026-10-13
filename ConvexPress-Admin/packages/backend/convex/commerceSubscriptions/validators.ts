import { v } from "convex/values";

export const subscriptionIntervalValidator = v.union(
  v.literal("week"),
  v.literal("month"),
  v.literal("year"),
);

export const subscriptionTemplateCreateValidator = v.object({
  title: v.string(),
  slug: v.string(),
  billingInterval: subscriptionIntervalValidator,
  billingIntervalCount: v.number(),
  trialDays: v.optional(v.number()),
  gracePeriodDays: v.optional(v.number()),
  pausable: v.boolean(),
  cancelAtPeriodEndDefault: v.boolean(),
});
