// @ts-nocheck
/**
 * Membership — Mutations
 *
 * ConvexPress membership runtime. Plan CRUD, grant lifecycle, and
 * restriction rule management.
 *
 * Functions:
 *   Plan CRUD:
 *   - createPlan              Create membership plan (admin)
 *   - updatePlan              Update membership plan (admin)
 *   - deletePlan              Delete plan (admin, only if no active grants)
 *
 *   Grant Lifecycle:
 *   - grantMembership         Manually grant membership to user (admin)
 *   - revokeMembership        Revoke grant (admin)
 *   - extendGrant             Extend a grant's expiry with a recorded reason (admin)
 *
 *   Restriction Rules:
 *   - createRestrictionRule              Create content restriction rule (admin)
 *   - updateRestrictionRule              Update rule (admin)
 *   - deleteRestrictionRule              Delete rule (admin)
 *   - upsertRestrictionRuleForResource   Create-or-update a rule scoped to a resource (admin)
 */

import { ConvexError, v } from "convex/values";

import { mutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { requireMembershipEnabled } from "./helpers";
import {
  membershipPlanStatusValidator,
  membershipRestrictionModeValidator,
} from "../schema/membership";
import { requirePluginEnabled } from "../helpers/plugins";
import { membershipResourceTypeValidator } from "./validators";
import { syncMembershipPlanCourseEnrollmentsHandler } from "../lms/enrollment/internals";

// ═══════════════════════════════════════════════════════════════════════════
// PLAN CRUD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a membership plan (admin).
 */
export const createPlan = mutation({
  args: {
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
    linkedRoleId: v.optional(v.id("roles")),
    linkedCapabilities: v.optional(v.array(v.string())),
    priority: v.number(),
    benefits: v.optional(
      v.array(
        v.object({
          code: v.string(),
          label: v.string(),
          description: v.optional(v.string()),
          displayAsFeature: v.optional(v.boolean()),
          metadata: v.optional(v.any()),
        }),
      ),
    ),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "membership");
    await requireMembershipEnabled(ctx);
    await requireCan(ctx, "manage_options");

    // Check slug uniqueness
    const existing = await ctx.db
      .query("membership_plans")
      .withIndex("by_slug", (q: any) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      throw new ConvexError({
        code: "DUPLICATE_SLUG",
        message: `A plan with slug "${args.slug}" already exists.`,
      });
    }

    const now = Date.now();

    const planId = await ctx.db.insert("membership_plans", {
      title: args.title,
      slug: args.slug,
      description: args.description,
      status: "draft",
      grantMode: args.grantMode,
      linkedSubscriptionCode: args.linkedSubscriptionCode,
      linkedRoleId: args.linkedRoleId,
      linkedCapabilities: args.linkedCapabilities,
      priority: args.priority,
      createdAt: now,
      updatedAt: now,
    });

    // Create benefits if provided
    if (args.benefits && args.benefits.length > 0) {
      for (const benefit of args.benefits) {
        await ctx.db.insert("membership_plan_benefits", {
          planId,
          code: benefit.code,
          label: benefit.label,
          description: benefit.description,
          displayAsFeature: benefit.displayAsFeature,
          metadata: benefit.metadata,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return planId;
  },
});

/**
 * Update membership plan (admin).
 */
export const updatePlan = mutation({
  args: {
    planId: v.id("membership_plans"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(membershipPlanStatusValidator),
    grantMode: v.optional(
      v.union(
        v.literal("manual"),
        v.literal("subscription"),
        v.literal("purchase"),
        v.literal("hybrid"),
      ),
    ),
    linkedSubscriptionCode: v.optional(v.string()),
    linkedRoleId: v.optional(v.id("roles")),
    linkedCapabilities: v.optional(v.array(v.string())),
    priority: v.optional(v.number()),
    benefits: v.optional(
      v.array(
        v.object({
          _id: v.optional(v.id("membership_plan_benefits")),
          code: v.string(),
          label: v.string(),
          description: v.optional(v.string()),
          displayAsFeature: v.optional(v.boolean()),
          metadata: v.optional(v.any()),
        }),
      ),
    ),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "membership");
    await requireMembershipEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const plan = await ctx.db.get(args.planId);
    if (!plan) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Membership plan not found.",
      });
    }

    // Check slug uniqueness if changing
    if (args.slug && args.slug !== plan.slug) {
      const existing = await ctx.db
        .query("membership_plans")
        .withIndex("by_slug", (q: any) => q.eq("slug", args.slug))
        .first();

      if (existing) {
        throw new ConvexError({
          code: "DUPLICATE_SLUG",
          message: `A plan with slug "${args.slug}" already exists.`,
        });
      }
    }

    const now = Date.now();

    // Build patch — only include provided fields
    const patch: any = { updatedAt: now };
    if (args.title !== undefined) patch.title = args.title;
    if (args.slug !== undefined) patch.slug = args.slug;
    if (args.description !== undefined) patch.description = args.description;
    if (args.status !== undefined) patch.status = args.status;
    if (args.grantMode !== undefined) patch.grantMode = args.grantMode;
    if (args.linkedSubscriptionCode !== undefined)
      patch.linkedSubscriptionCode = args.linkedSubscriptionCode;
    if (args.linkedRoleId !== undefined) patch.linkedRoleId = args.linkedRoleId;
    if (args.linkedCapabilities !== undefined)
      patch.linkedCapabilities = args.linkedCapabilities;
    if (args.priority !== undefined) patch.priority = args.priority;

    await ctx.db.patch(args.planId, patch);

    // Sync benefits if provided (full replace strategy)
    if (args.benefits !== undefined) {
      // Delete existing benefits
      const existingBenefits = await ctx.db
        .query("membership_plan_benefits")
        .withIndex("by_plan", (q: any) => q.eq("planId", args.planId))
        .collect();

      for (const benefit of existingBenefits) {
        await ctx.db.delete(benefit._id);
      }

      // Insert new benefits
      for (const benefit of args.benefits) {
        await ctx.db.insert("membership_plan_benefits", {
          planId: args.planId,
          code: benefit.code,
          label: benefit.label,
          description: benefit.description,
          displayAsFeature: benefit.displayAsFeature,
          metadata: benefit.metadata,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return args.planId;
  },
});

/**
 * Delete membership plan (admin).
 * Only allowed if there are no active or grace-period grants.
 */
export const deletePlan = mutation({
  args: {
    planId: v.id("membership_plans"),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "membership");
    await requireMembershipEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const plan = await ctx.db.get(args.planId);
    if (!plan) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Membership plan not found.",
      });
    }

    // Check for active grants
    const grants = await ctx.db
      .query("membership_grants")
      .withIndex("by_plan", (q: any) => q.eq("planId", args.planId))
      .collect();

    const activeGrants = grants.filter(
      (g: any) => g.status === "active" || g.status === "grace",
    );

    if (activeGrants.length > 0) {
      throw new ConvexError({
        code: "HAS_ACTIVE_GRANTS",
        message: `Cannot delete plan with ${activeGrants.length} active grant(s). Revoke or expire them first.`,
      });
    }

    // Delete benefits
    const benefits = await ctx.db
      .query("membership_plan_benefits")
      .withIndex("by_plan", (q: any) => q.eq("planId", args.planId))
      .collect();

    for (const benefit of benefits) {
      await ctx.db.delete(benefit._id);
    }

    // Delete restriction rules referencing this plan
    const rules = await ctx.db
      .query("membership_restriction_rules")
      .collect();

    for (const rule of rules) {
      const filteredPlanIds = (rule.planIds ?? []).filter(
        (pid: string) => pid !== args.planId,
      );
      if (filteredPlanIds.length === 0) {
        // No plans left in rule — delete the rule entirely
        await ctx.db.delete(rule._id);
      } else if (filteredPlanIds.length !== (rule.planIds ?? []).length) {
        // Remove this plan from the rule
        await ctx.db.patch(rule._id, {
          planIds: filteredPlanIds,
          updatedAt: Date.now(),
        });
      }
    }

    // Delete remaining grants (expired/revoked)
    for (const grant of grants) {
      await ctx.db.delete(grant._id);
    }

    // Delete the plan
    await ctx.db.delete(args.planId);

    return { deleted: true };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// GRANT LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Manually grant membership to a user (admin).
 */
export const grantMembership = mutation({
  args: {
    userId: v.id("users"),
    planId: v.id("membership_plans"),
    sourceType: v.optional(
      v.union(
        v.literal("manual"),
        v.literal("subscription"),
        v.literal("purchase"),
        v.literal("import"),
      ),
    ),
    sourceRef: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "membership");
    await requireMembershipEnabled(ctx);
    await requireCan(ctx, "manage_options");

    // Verify plan exists and is active
    const plan = await ctx.db.get(args.planId);
    if (!plan) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Membership plan not found.",
      });
    }

    if (plan.status !== "active") {
      throw new ConvexError({
        code: "PLAN_NOT_ACTIVE",
        message: "Cannot grant membership on a non-active plan.",
      });
    }

    // Verify user exists
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "User not found.",
      });
    }

    // Check for duplicate active grant on same plan
    const existingGrants = await ctx.db
      .query("membership_grants")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .collect();

    const duplicateGrant = existingGrants.find(
      (g: any) => g.planId === args.planId,
    );

    if (duplicateGrant) {
      throw new ConvexError({
        code: "DUPLICATE_GRANT",
        message: "User already has an active grant for this plan.",
      });
    }

    const now = Date.now();

    const grantId = await ctx.db.insert("membership_grants", {
      userId: args.userId,
      planId: args.planId,
      sourceType: args.sourceType ?? "manual",
      sourceRef: args.sourceRef,
      status: "active",
      startsAt: args.startsAt ?? now,
      endsAt: args.endsAt,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });

    await syncMembershipPlanCourseEnrollmentsHandler(ctx, {
      userId: args.userId,
      planId: args.planId,
      status: "active",
      expiresAt: args.endsAt,
      sourceRef: args.sourceRef,
    });

    return grantId;
  },
});

/**
 * Revoke a membership grant (admin).
 */
export const revokeMembership = mutation({
  args: {
    grantId: v.id("membership_grants"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "membership");
    await requireMembershipEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const grant = await ctx.db.get(args.grantId);
    if (!grant) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Membership grant not found.",
      });
    }

    if (grant.status === "revoked") {
      throw new ConvexError({
        code: "ALREADY_REVOKED",
        message: "Grant is already revoked.",
      });
    }

    if (grant.status === "expired") {
      throw new ConvexError({
        code: "ALREADY_EXPIRED",
        message: "Grant is already expired. Cannot revoke.",
      });
    }

    const now = Date.now();

    await ctx.db.patch(args.grantId, {
      status: "revoked",
      revokedAt: now,
      metadata: {
        ...grant.metadata,
        revokeReason: args.reason,
        revokedAt: now,
      },
      updatedAt: now,
    });

    await syncMembershipPlanCourseEnrollmentsHandler(ctx, {
      userId: grant.userId,
      planId: grant.planId,
      status: "revoked",
      sourceRef: grant.sourceRef,
    });

    return { revoked: true };
  },
});

/**
 * Extend a grant's expiry (admin).
 *
 * Pushes `endsAt` forward to `newExpiresAt`, appending an entry to the grant's
 * metadata history trail. Requires a non-empty reason (accountability).
 * Refuses to operate on revoked or expired grants — those are terminal states;
 * create a new grant instead.
 */
export const extendGrant = mutation({
  args: {
    grantId: v.id("membership_grants"),
    newExpiresAt: v.number(),
    reason: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "membership");
    await requireMembershipEnabled(ctx);
    await requireCan(ctx, "manage_options");

    // Reason must be non-empty (trim-aware)
    if (!args.reason || args.reason.trim().length === 0) {
      throw new ConvexError({
        code: "REASON_REQUIRED",
        message: "A non-empty reason is required when extending a grant.",
      });
    }

    const grant = await ctx.db.get(args.grantId);
    if (!grant) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Membership grant not found.",
      });
    }

    if (grant.status === "revoked") {
      throw new ConvexError({
        code: "GRANT_REVOKED",
        message: "Cannot extend a revoked grant.",
      });
    }

    if (grant.status === "expired") {
      throw new ConvexError({
        code: "GRANT_EXPIRED",
        message: "Cannot extend an expired grant. Create a new grant instead.",
      });
    }

    const now = Date.now();
    const priorEndsAt = grant.endsAt ?? null;

    // Append to metadata.history (audit trail — never overwrite).
    const existingHistory = Array.isArray(grant.metadata?.history)
      ? grant.metadata.history
      : [];

    const historyEntry = {
      action: "extend",
      at: now,
      priorEndsAt,
      newEndsAt: args.newExpiresAt,
      reason: args.reason,
    };

    await ctx.db.patch(args.grantId, {
      endsAt: args.newExpiresAt,
      metadata: {
        ...grant.metadata,
        history: [...existingHistory, historyEntry],
        lastExtendReason: args.reason,
        lastExtendedAt: now,
      },
      updatedAt: now,
    });

    return { extended: true, grantId: args.grantId, newExpiresAt: args.newExpiresAt };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// RESTRICTION RULES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a content restriction rule (admin).
 */
export const createRestrictionRule = mutation({
  args: {
    resourceType: membershipResourceTypeValidator,
    resourceIdOrKey: v.string(),
    ruleMode: membershipRestrictionModeValidator,
    planIds: v.array(v.id("membership_plans")),
    requiredCapabilities: v.optional(v.array(v.string())),
    teaserMode: v.union(
      v.literal("hide"),
      v.literal("excerpt"),
      v.literal("custom_message"),
    ),
    customMessage: v.optional(v.string()),
    loginRequired: v.boolean(),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "membership");
    await requireMembershipEnabled(ctx);
    await requireCan(ctx, "manage_options");

    // Validate plan IDs exist
    for (const planId of args.planIds) {
      const plan = await ctx.db.get(planId);
      if (!plan) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: `Plan ${planId} not found.`,
        });
      }
    }

    const now = Date.now();

    const ruleId = await ctx.db.insert("membership_restriction_rules", {
      resourceType: args.resourceType,
      resourceIdOrKey: args.resourceIdOrKey,
      ruleMode: args.ruleMode,
      planIds: args.planIds,
      requiredCapabilities: args.requiredCapabilities,
      teaserMode: args.teaserMode,
      customMessage: args.customMessage,
      loginRequired: args.loginRequired,
      createdAt: now,
      updatedAt: now,
    });

    return ruleId;
  },
});

/**
 * Update a restriction rule (admin).
 */
export const updateRestrictionRule = mutation({
  args: {
    ruleId: v.id("membership_restriction_rules"),
    resourceType: v.optional(membershipResourceTypeValidator),
    resourceIdOrKey: v.optional(v.string()),
    ruleMode: v.optional(membershipRestrictionModeValidator),
    planIds: v.optional(v.array(v.id("membership_plans"))),
    requiredCapabilities: v.optional(v.array(v.string())),
    teaserMode: v.optional(
      v.union(
        v.literal("hide"),
        v.literal("excerpt"),
        v.literal("custom_message"),
      ),
    ),
    customMessage: v.optional(v.string()),
    loginRequired: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "membership");
    await requireMembershipEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const rule = await ctx.db.get(args.ruleId);
    if (!rule) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Restriction rule not found.",
      });
    }

    // Validate plan IDs if provided
    if (args.planIds) {
      for (const planId of args.planIds) {
        const plan = await ctx.db.get(planId);
        if (!plan) {
          throw new ConvexError({
            code: "NOT_FOUND",
            message: `Plan ${planId} not found.`,
          });
        }
      }
    }

    const now = Date.now();

    const patch: any = { updatedAt: now };
    if (args.resourceType !== undefined) patch.resourceType = args.resourceType;
    if (args.resourceIdOrKey !== undefined)
      patch.resourceIdOrKey = args.resourceIdOrKey;
    if (args.ruleMode !== undefined) patch.ruleMode = args.ruleMode;
    if (args.planIds !== undefined) patch.planIds = args.planIds;
    if (args.requiredCapabilities !== undefined)
      patch.requiredCapabilities = args.requiredCapabilities;
    if (args.teaserMode !== undefined) patch.teaserMode = args.teaserMode;
    if (args.customMessage !== undefined)
      patch.customMessage = args.customMessage;
    if (args.loginRequired !== undefined)
      patch.loginRequired = args.loginRequired;

    await ctx.db.patch(args.ruleId, patch);

    return args.ruleId;
  },
});

/**
 * Delete a restriction rule (admin).
 */
export const deleteRestrictionRule = mutation({
  args: {
    ruleId: v.id("membership_restriction_rules"),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "membership");
    await requireMembershipEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const rule = await ctx.db.get(args.ruleId);
    if (!rule) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Restriction rule not found.",
      });
    }

    await ctx.db.delete(args.ruleId);

    return { deleted: true };
  },
});

/**
 * Upsert a restriction rule scoped to a specific resource (admin).
 *
 * If any existing rule targets the (resourceType, resourceIdOrKey) pair, it is
 * patched in place. Otherwise a fresh rule is created. Used by the Wave-3
 * metabox Save button (post/page right rail) where the UI contract is
 * "one rule per resource".
 *
 * Handles all 5 resource types: page, post, route, product, block.
 */
export const upsertRestrictionRuleForResource = mutation({
  args: {
    resourceType: membershipResourceTypeValidator,
    resourceIdOrKey: v.string(),
    ruleMode: membershipRestrictionModeValidator,
    planIds: v.array(v.id("membership_plans")),
    requiredCapabilities: v.optional(v.array(v.string())),
    teaserMode: v.union(
      v.literal("hide"),
      v.literal("excerpt"),
      v.literal("custom_message"),
    ),
    customMessage: v.optional(v.string()),
    loginRequired: v.boolean(),
  },
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "membership");
    await requireMembershipEnabled(ctx);
    await requireCan(ctx, "manage_options");

    // Validate plan IDs exist
    for (const planId of args.planIds) {
      const plan = await ctx.db.get(planId);
      if (!plan) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: `Plan ${planId} not found.`,
        });
      }
    }

    const now = Date.now();

    // Look up existing rule for this exact resource (first match wins — the
    // metabox UI guarantees one rule per resource).
    const existingRule = await ctx.db
      .query("membership_restriction_rules")
      .withIndex("by_resource", (q: any) =>
        q
          .eq("resourceType", args.resourceType)
          .eq("resourceIdOrKey", args.resourceIdOrKey),
      )
      .first();

    if (existingRule) {
      await ctx.db.patch(existingRule._id, {
        ruleMode: args.ruleMode,
        planIds: args.planIds,
        requiredCapabilities: args.requiredCapabilities,
        teaserMode: args.teaserMode,
        customMessage: args.customMessage,
        loginRequired: args.loginRequired,
        updatedAt: now,
      });
      return { ruleId: existingRule._id, created: false };
    }

    const ruleId = await ctx.db.insert("membership_restriction_rules", {
      resourceType: args.resourceType,
      resourceIdOrKey: args.resourceIdOrKey,
      ruleMode: args.ruleMode,
      planIds: args.planIds,
      requiredCapabilities: args.requiredCapabilities,
      teaserMode: args.teaserMode,
      customMessage: args.customMessage,
      loginRequired: args.loginRequired,
      createdAt: now,
      updatedAt: now,
    });

    return { ruleId, created: true };
  },
});
