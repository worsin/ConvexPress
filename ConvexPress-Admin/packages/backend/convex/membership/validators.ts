import { v } from "convex/values";

export const membershipPlanCreateValidator = v.object({
  title: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  grantMode: v.union(
    v.literal("manual"),
    v.literal("subscription"),
    v.literal("purchase"),
    v.literal("hybrid"),
  ),
  linkedSubscriptionCode: v.optional(v.string()),
  priority: v.number(),
});
