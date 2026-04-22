// @ts-nocheck
/**
 * Membership — Queries
 *
 * ConvexPress membership runtime. Unlike commerce subscriptions (ported from
 * VexCart), membership is ConvexPress's own design. It uses the subscription
 * system's `checkEntitlement` for subscription-linked plans.
 *
 * Functions:
 *   - listPlans                    List all membership plans (admin)
 *   - listPublicPlans              List published plans for public display
 *   - getPlan                      Single plan detail with benefits
 *   - listGrants                   List membership grants (admin, with user enrichment)
 *   - getMember                    Single member detail with grants (admin)
 *   - getMyMembership              Current user's active membership
 *   - listRestrictions             List content restriction rules (admin)
 *   - listRestrictionsByResource   Rules attached to a specific resource (admin)
 *   - checkAccess                  Pure read: access decision (no writes)
 *   - getStats                     Membership dashboard stats
 */

import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import {
  requireMembershipEnabled,
  getDisplayableBenefitsForPlanHelper,
  getDisplayableBenefitsForCodesHelper,
} from "./helpers";
import {
  membershipPlanStatusValidator,
  membershipGrantStatusValidator,
} from "../schema/membership";
import { isPluginEnabled } from "../helpers/plugins";
import { membershipResourceTypeValidator } from "./validators";

// ═══════════════════════════════════════════════════════════════════════════
// PLAN QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List all membership plans (admin).
 * Supports optional status filter. Returns plans sorted by priority (asc).
 */
export const listPlans = query({
  args: {
    status: v.optional(membershipPlanStatusValidator),
  },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "membership"))) return null;
    await requireMembershipEnabled(ctx);
    await requireCan(ctx, "manage_options");

    let plans: any[];

    if (args.status) {
      plans = await ctx.db
        .query("membership_plans")
        .withIndex("by_status", (q: any) => q.eq("status", args.status))
        .collect();
    } else {
      plans = await ctx.db.query("membership_plans").collect();
    }

    // Enrich with benefit count and active grant count
    const enriched = await Promise.all(
      plans.map(async (plan: any) => {
        const benefits = await ctx.db
          .query("membership_plan_benefits")
          .withIndex("by_plan", (q: any) => q.eq("planId", plan._id))
          .collect();

        const grants = await ctx.db
          .query("membership_grants")
          .withIndex("by_plan", (q: any) => q.eq("planId", plan._id))
          .collect();

        const activeGrants = grants.filter(
          (g: any) => g.status === "active" || g.status === "grace",
        );

        return {
          ...plan,
          benefitCount: benefits.length,
          activeGrantCount: activeGrants.length,
        };
      }),
    );

    return enriched.sort((a: any, b: any) => a.priority - b.priority);
  },
});

/**
 * List published (active) plans for public display.
 * Returns plans with their benefits, sorted by priority.
 * No auth required — this is for the public-facing membership page.
 */
export const listPublicPlans = query({
  args: {},
  handler: async (ctx: any) => {
    if (!(await isPluginEnabled(ctx, "membership"))) return null;
    await requireMembershipEnabled(ctx);

    const plans = await ctx.db
      .query("membership_plans")
      .withIndex("by_status", (q: any) => q.eq("status", "active"))
      .collect();

    const enriched = await Promise.all(
      plans.map(async (plan: any) => {
        const benefits = await ctx.db
          .query("membership_plan_benefits")
          .withIndex("by_plan", (q: any) => q.eq("planId", plan._id))
          .collect();

        return {
          _id: plan._id,
          title: plan.title,
          slug: plan.slug,
          description: plan.description,
          grantMode: plan.grantMode,
          linkedSubscriptionCode: plan.linkedSubscriptionCode,
          priority: plan.priority,
          benefits: benefits.map((b: any) => ({
            _id: b._id,
            code: b.code,
            label: b.label,
            description: b.description,
            displayAsFeature: b.displayAsFeature,
          })),
        };
      }),
    );

    return enriched.sort((a: any, b: any) => a.priority - b.priority);
  },
});

/**
 * Get single plan detail with benefits.
 */
export const getPlan = query({
  args: {
    planId: v.id("membership_plans"),
  },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "membership"))) return null;
    await requireMembershipEnabled(ctx);

    const plan = await ctx.db.get(args.planId);
    if (!plan) return null;

    const benefits = await ctx.db
      .query("membership_plan_benefits")
      .withIndex("by_plan", (q: any) => q.eq("planId", plan._id))
      .collect();

    // Resolve linked role if present
    let linkedRole = null;
    if (plan.linkedRoleId) {
      const role = await ctx.db.get(plan.linkedRoleId);
      if (role) {
        linkedRole = {
          _id: role._id,
          name: role.name,
          slug: role.slug,
        };
      }
    }

    return {
      ...plan,
      benefits,
      linkedRole,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// GRANT QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List membership grants (admin, with user and plan enrichment).
 */
export const listGrants = query({
  args: {
    planId: v.optional(v.id("membership_plans")),
    status: v.optional(membershipGrantStatusValidator),
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "membership"))) return [];
    await requireMembershipEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const limit = args.limit ?? 100;
    let grants: any[] = [];

    if (args.userId) {
      grants = await ctx.db
        .query("membership_grants")
        .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
        .collect();
    } else if (args.planId) {
      grants = await ctx.db
        .query("membership_grants")
        .withIndex("by_plan", (q: any) => q.eq("planId", args.planId))
        .collect();
    } else {
      grants = await ctx.db.query("membership_grants").collect();
    }

    // Apply status filter
    if (args.status) {
      grants = grants.filter((g: any) => g.status === args.status);
    }

    // Sort by creation date descending and limit
    grants = grants
      .sort((a: any, b: any) => b.createdAt - a.createdAt)
      .slice(0, limit);

    // Enrich with user and plan data
    return Promise.all(
      grants.map(async (grant: any) => {
        const user = await ctx.db.get(grant.userId);
        const plan = await ctx.db.get(grant.planId);

        return {
          ...grant,
          user: user
            ? {
                _id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl ?? user.profilePictureUrl,
              }
            : null,
          plan: plan
            ? {
                _id: plan._id,
                title: plan.title,
                slug: plan.slug,
              }
            : null,
        };
      }),
    );
  },
});

/**
 * Get current user's active membership grant(s).
 * Returns active and grace-period grants with plan details.
 */
export const getMyMembership = query({
  args: {},
  handler: async (ctx: any) => {
    if (!(await isPluginEnabled(ctx, "membership"))) return null;
    await requireMembershipEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) return null;

    // Get active + grace grants
    const activeGrants = await ctx.db
      .query("membership_grants")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", user._id).eq("status", "active"),
      )
      .collect();

    const graceGrants = await ctx.db
      .query("membership_grants")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", user._id).eq("status", "grace"),
      )
      .collect();

    const allGrants = [...activeGrants, ...graceGrants];

    if (allGrants.length === 0) return null;

    // Filter out expired grace-period grants
    const now = Date.now();
    const validGrants = allGrants.filter((g: any) => {
      if (g.status === "grace" && g.graceEndsAt && g.graceEndsAt < now) {
        return false;
      }
      if (g.endsAt && g.endsAt < now && g.status !== "grace") {
        return false;
      }
      return true;
    });

    if (validGrants.length === 0) return null;

    // Enrich with plan details and benefits
    const enriched = await Promise.all(
      validGrants.map(async (grant: any) => {
        const plan = await ctx.db.get(grant.planId);
        let benefits: any[] = [];
        if (plan) {
          benefits = await ctx.db
            .query("membership_plan_benefits")
            .withIndex("by_plan", (q: any) => q.eq("planId", plan._id))
            .collect();
        }

        return {
          ...grant,
          plan: plan
            ? {
                _id: plan._id,
                title: plan.title,
                slug: plan.slug,
                description: plan.description,
                priority: plan.priority,
              }
            : null,
          benefits: benefits.map((b: any) => ({
            _id: b._id,
            code: b.code,
            label: b.label,
            description: b.description,
            displayAsFeature: b.displayAsFeature,
          })),
        };
      }),
    );

    // Return the highest-priority plan's grant first
    enriched.sort(
      (a: any, b: any) => (a.plan?.priority ?? 999) - (b.plan?.priority ?? 999),
    );

    return {
      primaryGrant: enriched[0],
      allGrants: enriched,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE MEMBER DETAIL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a single member's detail (admin).
 * Returns the user with all their membership grants and plan info.
 */
export const getMember = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "membership"))) return null;
    await requireMembershipEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const grants = await ctx.db
      .query("membership_grants")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .collect();

    // Enrich grants with plan details
    const enrichedGrants = await Promise.all(
      grants.map(async (grant: any) => {
        const plan = await ctx.db.get(grant.planId);
        return {
          ...grant,
          plan: plan
            ? {
                _id: plan._id,
                title: plan.title,
                slug: plan.slug,
                priority: plan.priority,
              }
            : null,
        };
      }),
    );

    const activeGrants = enrichedGrants.filter(
      (g: any) => g.status === "active" || g.status === "grace",
    );

    return {
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? user.profilePictureUrl,
      status: user.status,
      grants: enrichedGrants.sort(
        (a: any, b: any) => b.createdAt - a.createdAt,
      ),
      activeGrants,
      totalGrants: grants.length,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// RESTRICTION RULES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List content restriction rules (admin).
 * Returns rules with enriched plan names.
 */
export const listRestrictions = query({
  args: {
    resourceType: v.optional(
      v.union(
        v.literal("page"),
        v.literal("post"),
        v.literal("route"),
        v.literal("product"),
        v.literal("block"),
      ),
    ),
  },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "membership"))) return null;
    await requireMembershipEnabled(ctx);
    await requireCan(ctx, "manage_options");

    let rules: any[];

    if (args.resourceType) {
      // Filter by resource type — scan by_resource index prefix
      rules = await ctx.db
        .query("membership_restriction_rules")
        .collect();
      rules = rules.filter(
        (r: any) => r.resourceType === args.resourceType,
      );
    } else {
      rules = await ctx.db
        .query("membership_restriction_rules")
        .collect();
    }

    // Enrich with plan titles
    const enriched = await Promise.all(
      rules.map(async (rule: any) => {
        const plans = await Promise.all(
          (rule.planIds ?? []).map(async (pid: any) => {
            const plan = await ctx.db.get(pid);
            return plan
              ? { _id: plan._id, title: plan.title, slug: plan.slug }
              : null;
          }),
        );

        return {
          ...rule,
          plans: plans.filter(Boolean),
        };
      }),
    );

    return enriched.sort((a: any, b: any) => b.createdAt - a.createdAt);
  },
});

/**
 * List restriction rules attached to a specific resource (admin).
 *
 * Returns every rule indexed by (resourceType, resourceIdOrKey). Used by the
 * post/page metabox to prefill the rule editor and by the rule list to show
 * per-resource badges. Handles all 5 resource types.
 */
export const listRestrictionsByResource = query({
  args: {
    resourceType: membershipResourceTypeValidator,
    resourceIdOrKey: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "membership"))) return null;
    await requireMembershipEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const rules = await ctx.db
      .query("membership_restriction_rules")
      .withIndex("by_resource", (q: any) =>
        q
          .eq("resourceType", args.resourceType)
          .eq("resourceIdOrKey", args.resourceIdOrKey),
      )
      .collect();

    // Enrich with plan summaries
    const enriched = await Promise.all(
      rules.map(async (rule: any) => {
        const plans = await Promise.all(
          (rule.planIds ?? []).map(async (pid: any) => {
            const plan = await ctx.db.get(pid);
            return plan
              ? { _id: plan._id, title: plan.title, slug: plan.slug }
              : null;
          }),
        );

        return {
          ...rule,
          plans: plans.filter(Boolean),
        };
      }),
    );

    return enriched.sort((a: any, b: any) => a.createdAt - b.createdAt);
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// ACCESS CHECK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a user has access to a specific resource.
 *
 * Looks up restriction rules for the given resource. If no rules exist,
 * access is allowed by default. If rules exist, checks the user's active
 * membership grants against the required plans.
 *
 * Pure read — does NOT write to the access log. Callers that want to record
 * the check should also dispatch `recordAccessCheck` (internal mutation).
 *
 * Returns an access decision with teaser mode info for gated content.
 */
export const checkAccess = query({
  args: {
    resourceType: v.union(
      v.literal("page"),
      v.literal("post"),
      v.literal("route"),
      v.literal("product"),
      v.literal("block"),
    ),
    resourceIdOrKey: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "membership"))) return { allowed: false, reason: "", teaserMode: null, customMessage: null, matchingPlanIds: null };
    await requireMembershipEnabled(ctx);

    // Look up restriction rules for this resource
    const rules = await ctx.db
      .query("membership_restriction_rules")
      .withIndex("by_resource", (q: any) =>
        q
          .eq("resourceType", args.resourceType)
          .eq("resourceIdOrKey", args.resourceIdOrKey),
      )
      .collect();

    // No rules = unrestricted
    if (rules.length === 0) {
      return {
        allowed: true,
        reason: "no_restriction",
        teaserMode: null,
        customMessage: null,
        matchingPlanIds: [],
      };
    }

    // Get current user
    const user = await getCurrentUser(ctx);

    // Check if any rule requires login
    const loginRequired = rules.some((r: any) => r.loginRequired);
    if (loginRequired && !user) {
      const firstRule = rules[0];
      return {
        allowed: false,
        reason: "login_required",
        teaserMode: firstRule.teaserMode,
        customMessage: firstRule.customMessage ?? null,
        matchingPlanIds: [],
      };
    }

    // If no user and login not required, check rule modes
    if (!user) {
      // For deny_if_missing rules, deny unauthenticated users
      const denyRules = rules.filter(
        (r: any) => r.ruleMode === "deny_if_missing",
      );
      if (denyRules.length > 0) {
        return {
          allowed: false,
          reason: "membership_required",
          teaserMode: denyRules[0].teaserMode,
          customMessage: denyRules[0].customMessage ?? null,
          matchingPlanIds: [],
        };
      }
      // allow_only with no user — deny
      return {
        allowed: false,
        reason: "membership_required",
        teaserMode: rules[0].teaserMode,
        customMessage: rules[0].customMessage ?? null,
        matchingPlanIds: [],
      };
    }

    // Get user's active membership grants
    const activeGrants = await ctx.db
      .query("membership_grants")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", user._id).eq("status", "active"),
      )
      .collect();

    const graceGrants = await ctx.db
      .query("membership_grants")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", user._id).eq("status", "grace"),
      )
      .collect();

    const now = Date.now();
    const allValidGrants = [...activeGrants, ...graceGrants].filter(
      (g: any) => {
        if (g.status === "grace" && g.graceEndsAt && g.graceEndsAt < now)
          return false;
        if (g.endsAt && g.endsAt < now && g.status !== "grace") return false;
        return true;
      },
    );

    const userPlanIds = allValidGrants.map((g: any) => g.planId);

    // Evaluate each rule
    for (const rule of rules) {
      const requiredPlanIds: string[] = rule.planIds ?? [];

      if (rule.ruleMode === "allow_only") {
        // User must have at least one of the required plans
        const hasMatchingPlan = requiredPlanIds.some((pid: string) =>
          userPlanIds.includes(pid),
        );
        if (hasMatchingPlan) {
          const matchingIds = requiredPlanIds.filter((pid: string) =>
            userPlanIds.includes(pid),
          );
          return {
            allowed: true,
            reason: "plan_match",
            teaserMode: null,
            customMessage: null,
            matchingPlanIds: matchingIds,
          };
        }
      } else if (rule.ruleMode === "deny_if_missing") {
        // Deny if user does NOT have any of the required plans
        const hasMatchingPlan = requiredPlanIds.some((pid: string) =>
          userPlanIds.includes(pid),
        );
        if (!hasMatchingPlan) {
          return {
            allowed: false,
            reason: "missing_required_plan",
            teaserMode: rule.teaserMode,
            customMessage: rule.customMessage ?? null,
            matchingPlanIds: [],
          };
        }
      }
    }

    // If we have allow_only rules but no match, deny
    const allowOnlyRules = rules.filter(
      (r: any) => r.ruleMode === "allow_only",
    );
    if (allowOnlyRules.length > 0) {
      return {
        allowed: false,
        reason: "no_matching_plan",
        teaserMode: allowOnlyRules[0].teaserMode,
        customMessage: allowOnlyRules[0].customMessage ?? null,
        matchingPlanIds: [],
      };
    }

    // All deny_if_missing rules passed — allow access
    return {
      allowed: true,
      reason: "all_rules_passed",
      teaserMode: null,
      customMessage: null,
      matchingPlanIds: userPlanIds,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// PRICING PAGE — BENEFIT DISPLAY QUERIES (Wave 6)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Return displayable benefits for a single membership plan.
 *
 * A benefit is included when `displayAsFeature !== false`; absence of the
 * field is treated as TRUE per Wave 1 schema convention.
 *
 * Public — no auth required. Plugin-gated: returns [] when membership is
 * disabled so pricing pages degrade gracefully.
 *
 * Shape: Array<{ _id, label, description?, sourcePlanId }>
 */
export const getDisplayableBenefitsForPlan = query({
  args: {
    planId: v.id("membership_plans"),
  },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "membership"))) return [];
    return getDisplayableBenefitsForPlanHelper(ctx, args.planId);
  },
});

/**
 * Return displayable benefits for a set of subscription entitlement codes.
 *
 * For each code, resolves `membership_plans` where `linkedSubscriptionCode
 * === code` AND `status === "active"`. Collects displayable benefits from all
 * matching plans, then dedupes by `label` (first occurrence wins; codes are
 * iterated in input order for determinism).
 *
 * Public — no auth required. Plugin-gated: returns [] when membership is
 * disabled. Returns [] on empty input without touching the DB.
 *
 * Shape: Array<{ _id, label, description?, sourcePlanId }>
 */
export const getDisplayableBenefitsForEntitlementCodes = query({
  args: {
    codes: v.array(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "membership"))) return [];
    return getDisplayableBenefitsForCodesHelper(ctx, args.codes);
  },
});

/**
 * Membership dashboard stats (admin).
 */
export const getStats = query({
  args: {},
  handler: async (ctx: any) => {
    if (!(await isPluginEnabled(ctx, "membership"))) return null;
    await requireMembershipEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const now = Date.now();
    const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;

    // Plans
    const plans = await ctx.db.query("membership_plans").collect();
    const activePlans = plans.filter((p: any) => p.status === "active");

    // Grants
    const grants = await ctx.db.query("membership_grants").collect();
    const activeGrants = grants.filter((g: any) => g.status === "active");
    const graceGrants = grants.filter((g: any) => g.status === "grace");
    const revokedGrants = grants.filter((g: any) => g.status === "revoked");
    const expiredGrants = grants.filter((g: any) => g.status === "expired");

    // Expiring soon: active grants with endsAt within 30 days
    const expiringSoon = activeGrants.filter(
      (g: any) => g.endsAt && g.endsAt > now && g.endsAt <= thirtyDaysFromNow,
    );

    // Restriction rules
    const rules = await ctx.db
      .query("membership_restriction_rules")
      .collect();

    // Plans breakdown
    const planBreakdown = await Promise.all(
      activePlans.map(async (plan: any) => {
        const planGrants = grants.filter(
          (g: any) =>
            g.planId === plan._id &&
            (g.status === "active" || g.status === "grace"),
        );
        return {
          planId: plan._id,
          title: plan.title,
          slug: plan.slug,
          activeMembers: planGrants.length,
        };
      }),
    );

    return {
      totalPlans: plans.length,
      activePlans: activePlans.length,
      totalGrants: grants.length,
      activeGrants: activeGrants.length,
      graceGrants: graceGrants.length,
      revokedGrants: revokedGrants.length,
      expiredGrants: expiredGrants.length,
      expiringSoon: expiringSoon.length,
      totalRestrictionRules: rules.length,
      planBreakdown,
    };
  },
});
