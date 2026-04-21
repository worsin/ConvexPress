/**
 * Membership — Shared Argument Validators
 *
 * Consolidated inline arg validators referenced from mutations and queries.
 * Mutations may still declare args inline, but common unions are centralized
 * here for consistency.
 */

import { v } from "convex/values";

// ─── Resource Type Validator (all 5 restrictable resource kinds) ───────────
export const membershipResourceTypeValidator = v.union(
  v.literal("page"),
  v.literal("post"),
  v.literal("route"),
  v.literal("product"),
  v.literal("block"),
);

// ─── Teaser Mode Validator ─────────────────────────────────────────────────
export const membershipTeaserModeValidator = v.union(
  v.literal("hide"),
  v.literal("excerpt"),
  v.literal("custom_message"),
);

// ─── Grant Source Validator ────────────────────────────────────────────────
export const membershipGrantSourceValidator = v.union(
  v.literal("manual"),
  v.literal("subscription"),
  v.literal("purchase"),
  v.literal("import"),
);

// ─── Grant Mode Validator (plan's grant mode) ──────────────────────────────
export const membershipGrantModeValidator = v.union(
  v.literal("manual"),
  v.literal("subscription"),
  v.literal("purchase"),
  v.literal("hybrid"),
);

// ─── Plan Create Validator (starter, not yet wired) ───────────────────────
export const membershipPlanCreateValidator = v.object({
  title: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  grantMode: membershipGrantModeValidator,
  linkedSubscriptionCode: v.optional(v.string()),
  priority: v.number(),
});

// ─── Benefit Input Validator (with Wave 1 displayAsFeature) ───────────────
export const membershipBenefitInputValidator = v.object({
  _id: v.optional(v.id("membership_plan_benefits")),
  code: v.string(),
  label: v.string(),
  description: v.optional(v.string()),
  displayAsFeature: v.optional(v.boolean()),
  metadata: v.optional(v.any()),
});

// ─── Restriction Rule Payload (for upsert-by-resource) ────────────────────
export const membershipRestrictionRulePayloadValidator = v.object({
  ruleMode: v.union(
    v.literal("allow_only"),
    v.literal("deny_if_missing"),
  ),
  planIds: v.array(v.id("membership_plans")),
  requiredCapabilities: v.optional(v.array(v.string())),
  teaserMode: membershipTeaserModeValidator,
  customMessage: v.optional(v.string()),
  loginRequired: v.boolean(),
});
