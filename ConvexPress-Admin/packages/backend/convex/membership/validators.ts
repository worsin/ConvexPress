/**
 * Membership — Shared Argument Validators
 *
 * Consolidated inline arg validators referenced from mutations and queries.
 * Mutations may still declare args inline, but common unions are centralized
 * here for consistency.
 */

import { v } from "convex/values";

// ─── Resource Type Validator (all restrictable resource kinds) ─────────────
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const membershipResourceTypeValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("page"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("post"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("route"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("product"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("course"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("block"),
);

// ─── Teaser Mode Validator ─────────────────────────────────────────────────
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const membershipTeaserModeValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("hide"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("excerpt"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("custom_message"),
);

// ─── Grant Source Validator ────────────────────────────────────────────────
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const membershipGrantSourceValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("manual"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("subscription"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("purchase"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("import"),
);

// ─── Grant Mode Validator (plan's grant mode) ──────────────────────────────
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const membershipGrantModeValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("manual"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("subscription"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("purchase"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("hybrid"),
);

// ─── Plan Create Validator (starter, not yet wired) ───────────────────────
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const membershipPlanCreateValidator = v.object({
  title: v.string(),
  slug: v.string(),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  description: v.optional(v.string()),
  grantMode: membershipGrantModeValidator,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  linkedSubscriptionCode: v.optional(v.string()),
  priority: v.number(),
});

// ─── Benefit Input Validator (with Wave 1 displayAsFeature) ───────────────
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const membershipBenefitInputValidator = v.object({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  _id: v.optional(v.id("membership_plan_benefits")),
  code: v.string(),
  label: v.string(),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  description: v.optional(v.string()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  displayAsFeature: v.optional(v.boolean()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  metadata: v.optional(v.any()),
});

// ─── Restriction Rule Payload (for upsert-by-resource) ────────────────────
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const membershipRestrictionRulePayloadValidator = v.object({
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  ruleMode: v.union(
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.literal("allow_only"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.literal("deny_if_missing"),
  ),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  planIds: v.array(v.id("membership_plans")),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  requiredCapabilities: v.optional(v.array(v.string())),
  teaserMode: membershipTeaserModeValidator,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  customMessage: v.optional(v.string()),
  loginRequired: v.boolean(),
});
