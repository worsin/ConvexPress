import { v } from "convex/values";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const subscriptionIntervalValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("week"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("month"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("year"),
);

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const subscriptionTemplateCreateValidator = v.object({
  title: v.string(),
  slug: v.string(),
  billingInterval: subscriptionIntervalValidator,
  billingIntervalCount: v.number(),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  trialDays: v.optional(v.number()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  gracePeriodDays: v.optional(v.number()),
  pausable: v.boolean(),
  cancelAtPeriodEndDefault: v.boolean(),
});
