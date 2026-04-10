// @ts-nocheck
/**
 * Membership — Internal Functions
 *
 * NOT client-callable. Invoked by schedulers, cron jobs, or other internal
 * functions (e.g., subscription lifecycle hooks).
 *
 * Functions:
 *   - expireGrants             Expire grants past their end date
 *   - grantFromSubscription    Auto-grant membership when subscription entitlement is active
 *   - revokeFromSubscription   Auto-revoke when subscription cancelled/expired
 */

import { ConvexError, v } from "convex/values";

import { internalMutation } from "../_generated/server";

// ═══════════════════════════════════════════════════════════════════════════
// expireGrants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Expire membership grants that have passed their end date.
 *
 * Scans active grants and moves them to "expired" if endsAt < now.
 * Also moves grace-period grants to "expired" if graceEndsAt < now.
 *
 * Intended to be called by a cron job (e.g., every hour).
 */
export const expireGrants = internalMutation({
  args: {},
  handler: async (ctx: any) => {
    const now = Date.now();
    let expiredCount = 0;

    // Find active grants with an endsAt in the past
    const activeGrants = await ctx.db
      .query("membership_grants")
      .collect();

    for (const grant of activeGrants) {
      if (grant.status === "active" && grant.endsAt && grant.endsAt < now) {
        // Check if plan has a grace period via graceEndsAt on the grant
        if (grant.graceEndsAt && grant.graceEndsAt > now) {
          // Move to grace period
          await ctx.db.patch(grant._id, {
            status: "grace",
            updatedAt: now,
          });
        } else if (grant.graceEndsAt && grant.graceEndsAt <= now) {
          // Grace period also expired
          await ctx.db.patch(grant._id, {
            status: "expired",
            updatedAt: now,
          });
          expiredCount++;
        } else {
          // No grace period — expire directly
          await ctx.db.patch(grant._id, {
            status: "expired",
            updatedAt: now,
          });
          expiredCount++;
        }
      } else if (
        grant.status === "grace" &&
        grant.graceEndsAt &&
        grant.graceEndsAt < now
      ) {
        // Grace period expired
        await ctx.db.patch(grant._id, {
          status: "expired",
          updatedAt: now,
        });
        expiredCount++;
      }
    }

    return { expiredCount, processedAt: now };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// grantFromSubscription
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Auto-grant membership when a subscription entitlement becomes active.
 *
 * Called by the subscription system when an entitlement is created/activated.
 * Looks up membership plans with a matching linkedSubscriptionCode and grants
 * the user membership on all matching plans.
 *
 * @param userId - The user who has the active entitlement
 * @param entitlementCode - The subscription entitlement code
 * @param subscriptionId - Reference to the source subscription
 * @param endsAt - Optional end date from subscription period
 */
export const grantFromSubscription = internalMutation({
  args: {
    userId: v.id("users"),
    entitlementCode: v.string(),
    subscriptionId: v.string(),
    endsAt: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    const now = Date.now();
    const grantedPlanIds: string[] = [];

    // Find plans linked to this entitlement code
    const allPlans = await ctx.db
      .query("membership_plans")
      .withIndex("by_status", (q: any) => q.eq("status", "active"))
      .collect();

    const matchingPlans = allPlans.filter(
      (plan: any) =>
        plan.linkedSubscriptionCode === args.entitlementCode &&
        (plan.grantMode === "subscription" || plan.grantMode === "hybrid"),
    );

    if (matchingPlans.length === 0) {
      return { grantedPlanIds: [], reason: "no_matching_plans" };
    }

    for (const plan of matchingPlans) {
      // Check if user already has an active grant for this plan
      const existingGrants = await ctx.db
        .query("membership_grants")
        .withIndex("by_user_status", (q: any) =>
          q.eq("userId", args.userId).eq("status", "active"),
        )
        .collect();

      const alreadyGranted = existingGrants.some(
        (g: any) => g.planId === plan._id,
      );

      if (alreadyGranted) {
        // Extend the existing grant's endsAt if the new subscription provides a later date
        if (args.endsAt) {
          const existingGrant = existingGrants.find(
            (g: any) => g.planId === plan._id,
          );
          if (existingGrant && (!existingGrant.endsAt || args.endsAt > existingGrant.endsAt)) {
            await ctx.db.patch(existingGrant._id, {
              endsAt: args.endsAt,
              sourceRef: args.subscriptionId,
              updatedAt: now,
            });
          }
        }
        grantedPlanIds.push(plan._id);
        continue;
      }

      // Create new grant
      await ctx.db.insert("membership_grants", {
        userId: args.userId,
        planId: plan._id,
        sourceType: "subscription",
        sourceRef: args.subscriptionId,
        status: "active",
        startsAt: now,
        endsAt: args.endsAt,
        createdAt: now,
        updatedAt: now,
      });

      grantedPlanIds.push(plan._id);
    }

    return { grantedPlanIds };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// revokeFromSubscription
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Auto-revoke membership when a subscription is cancelled or expired.
 *
 * Called by the subscription system when an entitlement is revoked/expired.
 * Finds active grants sourced from the given subscription and moves them
 * to grace period or revoked, depending on plan configuration.
 *
 * @param userId - The user whose subscription was cancelled
 * @param subscriptionId - The source subscription reference
 * @param gracePeriodDays - Optional grace period (default: 0, immediate revoke)
 */
export const revokeFromSubscription = internalMutation({
  args: {
    userId: v.id("users"),
    subscriptionId: v.string(),
    gracePeriodDays: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    const now = Date.now();
    const gracePeriodDays = args.gracePeriodDays ?? 0;
    let revokedCount = 0;

    // Find active grants from this subscription
    const activeGrants = await ctx.db
      .query("membership_grants")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .collect();

    const subscriptionGrants = activeGrants.filter(
      (g: any) =>
        g.sourceType === "subscription" &&
        g.sourceRef === args.subscriptionId,
    );

    // Also check grace-period grants
    const graceGrants = await ctx.db
      .query("membership_grants")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", args.userId).eq("status", "grace"),
      )
      .collect();

    const graceSubscriptionGrants = graceGrants.filter(
      (g: any) =>
        g.sourceType === "subscription" &&
        g.sourceRef === args.subscriptionId,
    );

    const allTargetGrants = [...subscriptionGrants, ...graceSubscriptionGrants];

    for (const grant of allTargetGrants) {
      if (grant.status === "grace") {
        // Already in grace — revoke immediately
        await ctx.db.patch(grant._id, {
          status: "revoked",
          revokedAt: now,
          updatedAt: now,
        });
        revokedCount++;
      } else if (gracePeriodDays > 0) {
        // Move to grace period
        const graceEndsAt = now + gracePeriodDays * 24 * 60 * 60 * 1000;
        await ctx.db.patch(grant._id, {
          status: "grace",
          graceEndsAt,
          updatedAt: now,
        });
        revokedCount++;
      } else {
        // Immediate revoke
        await ctx.db.patch(grant._id, {
          status: "revoked",
          revokedAt: now,
          updatedAt: now,
        });
        revokedCount++;
      }
    }

    return { revokedCount, processedAt: now };
  },
});
