// @ts-nocheck
/**
 * Membership — Internal Functions
 *
 * NOT client-callable. Invoked by schedulers, cron jobs, or other internal
 * functions (e.g., subscription lifecycle hooks).
 *
 * Functions:
 *   - expireGrants                         Expire grants past their end date
 *   - grantFromSubscription                Auto-grant on active subscription
 *   - revokeFromSubscription               Auto-revoke on subscription cancel
 *   - moveGrantToGrace                     Move active grants to grace (past_due/paused)
 *   - recordAccessCheck                    Write a row to membership_access_log
 *   - getCapabilitiesForUser               Collect caps from active+grace grants
 *   - getPlansByLinkedSubscriptionCode     Plans matching an entitlement code
 */

import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";
import { requirePluginEnabled, isPluginEnabled } from "../helpers/plugins";
import {
  decideGrant,
  decideMoveToGrace,
  decideRevoke,
  filterGrantsBySubscription,
  selectBridgeablePlans,
} from "./bridgeLogic";

// ─── Settings-reader helper (local to internals) ──────────────────────────
// Returns the membership.general settings object with Wave-2 defaults.
// Defaults: logAccessChecks=true, accessLogRetentionDays=30.
async function getMembershipSettings(ctx: any): Promise<{
  logAccessChecks: boolean;
  accessLogRetentionDays: number;
}> {
  const defaults = {
    logAccessChecks: true,
    accessLogRetentionDays: 30,
  };
  try {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_section", (q: any) =>
        q.eq("section", "membership.general"),
      )
      .unique();
    return {
      ...defaults,
      ...(row?.values ?? {}),
    };
  } catch {
    return defaults;
  }
}

// ─── Bridge-event access log helper (local) ───────────────────────────────
// Writes a `membership_access_log` entry for a bridge-driven grant mutation
// (grant_created / grant_refreshed / grant_revoked / grant_moved_to_grace).
// Honors the `logAccessChecks` setting just like `recordAccessCheck` does.
async function writeBridgeAccessLog(
  ctx: any,
  input: {
    userId: any;
    planId: any;
    grantId: any;
    reason:
      | "bridge_grant_created"
      | "bridge_grant_refreshed"
      | "bridge_grant_revoked"
      | "bridge_grant_moved_to_grace";
  },
): Promise<void> {
  const settings = await getMembershipSettings(ctx);
  if (!settings.logAccessChecks) return;
  await ctx.db.insert("membership_access_log", {
    userId: input.userId,
    resourceType: "grant",
    resourceIdOrKey: String(input.grantId),
    allowed: true,
    reason: input.reason,
    matchingPlanIds: [input.planId],
    createdAt: Date.now(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// expireGrants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Expire membership grants that have passed their end date.
 *
 * Two-step transition (respects the status mirror):
 *   1. active + endsAt past + graceEndsAt future  → grace
 *   2. active + endsAt past + graceEndsAt past    → expired
 *   3. active + endsAt past + plan.gracePeriodDays > 0 (no graceEndsAt yet)
 *      → grace (and set graceEndsAt = now + days)
 *   4. active + endsAt past + no grace at all     → expired directly
 *   5. grace  + graceEndsAt past                  → expired
 *
 * Intended to be called by a daily cron.
 */
export const expireGrants = internalMutation({
  args: {},
  handler: async (ctx: any) => {
    await requirePluginEnabled(ctx, "membership");
    const now = Date.now();
    let expiredCount = 0;
    let movedToGraceCount = 0;

    // Scan all grants (filter in memory — admin sweeps are daily, low volume).
    const allGrants = await ctx.db.query("membership_grants").collect();

    // Cache plans by id to read gracePeriodDays without repeated fetches.
    const planCache = new Map<string, any>();
    const getPlan = async (planId: string) => {
      if (planCache.has(planId)) return planCache.get(planId);
      const plan = await ctx.db.get(planId);
      planCache.set(planId, plan);
      return plan;
    };

    for (const grant of allGrants) {
      // Active with past endsAt → expire or move to grace
      if (grant.status === "active" && grant.endsAt && grant.endsAt < now) {
        if (grant.graceEndsAt && grant.graceEndsAt > now) {
          // Already has a future grace window — step down to grace.
          await ctx.db.patch(grant._id, { status: "grace", updatedAt: now });
          movedToGraceCount++;
        } else if (grant.graceEndsAt && grant.graceEndsAt <= now) {
          // Existing grace window already passed — expire.
          await ctx.db.patch(grant._id, { status: "expired", updatedAt: now });
          expiredCount++;
        } else {
          // No graceEndsAt set yet — consult the plan's per-plan grace window.
          const plan = await getPlan(grant.planId);
          const planGraceDays =
            typeof plan?.gracePeriodDays === "number" && plan.gracePeriodDays > 0
              ? plan.gracePeriodDays
              : 0;

          if (planGraceDays > 0) {
            // Two-step transition: active → grace first.
            const graceEndsAt = now + planGraceDays * 24 * 60 * 60 * 1000;
            await ctx.db.patch(grant._id, {
              status: "grace",
              graceEndsAt,
              updatedAt: now,
            });
            movedToGraceCount++;
          } else {
            // No grace window configured — expire directly.
            await ctx.db.patch(grant._id, {
              status: "expired",
              updatedAt: now,
            });
            expiredCount++;
          }
        }
      } else if (
        grant.status === "grace" &&
        grant.graceEndsAt &&
        grant.graceEndsAt < now
      ) {
        // Grace window closed — expire.
        await ctx.db.patch(grant._id, { status: "expired", updatedAt: now });
        expiredCount++;
      }
    }

    return { expiredCount, movedToGraceCount, processedAt: now };
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
 * Idempotency:
 *   - If an active grant already exists for (userId, planId), the grant is
 *     REFRESHED (sourceRef + updatedAt always, endsAt only if later) rather
 *     than a duplicate inserted. This keeps the bridge safe to re-run.
 *
 * Plugin gate:
 *   - Soft no-op when membership plugin is disabled — must NOT throw, or the
 *     subscription flow breaks. Returns `{ skipped: "plugin_disabled" }`.
 *
 * Archived plans:
 *   - Double-checked at iteration time (defensive against index-visibility
 *     race where by_status returned a plan that became archived between the
 *     query and the handler). Skipped silently.
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
    if (!(await isPluginEnabled(ctx, "membership"))) {
      return { grantedPlanIds: [], skipped: "plugin_disabled" };
    }

    const now = Date.now();
    const grantedPlanIds: string[] = [];
    const refreshedPlanIds: string[] = [];
    const skippedArchivedPlanIds: string[] = [];

    // Find plans linked to this entitlement code (active-only index).
    const allPlans = await ctx.db
      .query("membership_plans")
      .withIndex("by_status", (q: any) => q.eq("status", "active"))
      .collect();

    const matchingPlans = selectBridgeablePlans(allPlans, args.entitlementCode);

    if (matchingPlans.length === 0) {
      return { grantedPlanIds: [], reason: "no_matching_plans" };
    }

    // Fetch active grants once per call; we'll filter per plan in memory.
    const existingActiveGrants = await ctx.db
      .query("membership_grants")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .collect();

    for (const plan of matchingPlans) {
      // Race-safe re-read: plan may have been archived between the index
      // query and this iteration. Skip silently if so.
      const fresh = await ctx.db.get(plan._id);
      if (!fresh || fresh.status !== "active") {
        skippedArchivedPlanIds.push(plan._id);
        continue;
      }

      const decision = decideGrant({
        existingActiveGrantsForUserPlan: existingActiveGrants,
        userId: args.userId,
        planId: plan._id,
        subscriptionId: args.subscriptionId,
        endsAt: args.endsAt,
        now,
      });

      if (decision.kind === "create") {
        const grantId = await ctx.db.insert("membership_grants", decision.doc);
        await writeBridgeAccessLog(ctx, {
          userId: args.userId,
          planId: plan._id,
          grantId,
          reason: "bridge_grant_created",
        });
        grantedPlanIds.push(plan._id);
      } else {
        await ctx.db.patch(decision.grantId, decision.patch);
        await writeBridgeAccessLog(ctx, {
          userId: args.userId,
          planId: plan._id,
          grantId: decision.grantId,
          reason: "bridge_grant_refreshed",
        });
        refreshedPlanIds.push(plan._id);
      }
    }

    return {
      grantedPlanIds,
      refreshedPlanIds,
      skippedArchivedPlanIds,
    };
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
 * Idempotency:
 *   - Only targets grants currently in `active` or `grace` status; already
 *     `revoked`/`expired` grants are ignored, so calling this twice is safe.
 *   - Returns `{ revokedCount: 0, skipped: "no_grants" }` when no targets
 *     match (e.g. subscription has never granted anything, or all prior
 *     grants have already been revoked).
 *
 * Plugin gate:
 *   - Soft no-op when membership plugin is disabled.
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
    if (!(await isPluginEnabled(ctx, "membership"))) {
      return { revokedCount: 0, skipped: "plugin_disabled" };
    }

    const now = Date.now();
    const gracePeriodDays = args.gracePeriodDays ?? 0;

    // Find active + grace grants for this user, then narrow to this
    // subscription's sourceRef. (Already `revoked`/`expired` grants are
    // excluded by the index predicate — that IS the idempotency guard.)
    const activeGrants = await ctx.db
      .query("membership_grants")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .collect();

    const graceGrants = await ctx.db
      .query("membership_grants")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", args.userId).eq("status", "grace"),
      )
      .collect();

    const allTargetGrants = [
      ...filterGrantsBySubscription(activeGrants, args.subscriptionId),
      ...filterGrantsBySubscription(graceGrants, args.subscriptionId),
    ];

    if (allTargetGrants.length === 0) {
      return { revokedCount: 0, skipped: "no_grants", processedAt: now };
    }

    let revokedCount = 0;
    let movedToGraceCount = 0;

    for (const grant of allTargetGrants) {
      const decision = decideRevoke({ grant, gracePeriodDays, now });
      await ctx.db.patch(decision.grantId, decision.patch);
      await writeBridgeAccessLog(ctx, {
        userId: args.userId,
        planId: grant.planId,
        grantId: decision.grantId,
        reason:
          decision.kind === "grace"
            ? "bridge_grant_moved_to_grace"
            : "bridge_grant_revoked",
      });
      if (decision.kind === "grace") movedToGraceCount++;
      else revokedCount++;
    }

    return { revokedCount, movedToGraceCount, processedAt: now };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// recordAccessCheck (access log writer)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Persist an access decision to `membership_access_log`.
 *
 * Writes IFF the plugin setting `logAccessChecks` is true (defaults to true
 * if the setting is absent). Callers typically invoke this immediately after
 * `checkAccess` on high-value routes. Low-traffic callers can log every hit;
 * high-traffic callers may sample client-side before dispatching.
 *
 * This internal is a no-op when the membership plugin is disabled so callers
 * don't need to gate their own dispatch.
 */
export const recordAccessCheck = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    resourceType: v.string(),
    resourceIdOrKey: v.string(),
    allowed: v.boolean(),
    reason: v.optional(v.string()),
    matchingPlanIds: v.optional(v.array(v.id("membership_plans"))),
  },
  handler: async (ctx: any, args: any) => {
    // Soft no-op when plugin is off.
    if (!(await isPluginEnabled(ctx, "membership"))) return { logged: false };

    const settings = await getMembershipSettings(ctx);
    if (!settings.logAccessChecks) return { logged: false };

    const now = Date.now();
    await ctx.db.insert("membership_access_log", {
      userId: args.userId,
      resourceType: args.resourceType,
      resourceIdOrKey: args.resourceIdOrKey,
      allowed: args.allowed,
      reason: args.reason,
      matchingPlanIds: args.matchingPlanIds ?? [],
      createdAt: now,
    });
    return { logged: true, at: now };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// getCapabilitiesForUser (capability augmentation feed)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Collect the union of `plan.linkedCapabilities` strings across a user's
 * ACTIVE and GRACE grants. Expired/revoked grants contribute nothing.
 *
 * Used by `helpers/permissions.ts` to augment role-based capability checks
 * with plan-granted capabilities. Wrap calls in a plugin-enabled guard; this
 * internal itself returns [] when the plugin is disabled so callers don't
 * need to gate.
 *
 * Grace-period grants still contribute capabilities — they represent a
 * payment hiccup, not a permission revocation. Cut-off happens when the
 * expire cron moves the grant to `expired`.
 */
export const getCapabilitiesForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "membership"))) return [];

    const now = Date.now();

    const activeGrants = await ctx.db
      .query("membership_grants")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .collect();

    const graceGrants = await ctx.db
      .query("membership_grants")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", args.userId).eq("status", "grace"),
      )
      .collect();

    const validGrants = [...activeGrants, ...graceGrants].filter((g: any) => {
      if (g.status === "grace" && g.graceEndsAt && g.graceEndsAt < now)
        return false;
      if (g.endsAt && g.endsAt < now && g.status !== "grace") return false;
      return true;
    });

    const capSet = new Set<string>();
    for (const grant of validGrants) {
      const plan = await ctx.db.get(grant.planId);
      if (!plan) continue;
      if (plan.status !== "active") continue;
      const caps: string[] = Array.isArray(plan.linkedCapabilities)
        ? plan.linkedCapabilities
        : [];
      for (const cap of caps) {
        if (typeof cap === "string" && cap.length > 0) capSet.add(cap);
      }
    }

    return Array.from(capSet);
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// getPlansByLinkedSubscriptionCode (bridge lookup)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Return every plan whose `linkedSubscriptionCode === code`.
 *
 * Used by the Commerce Subscriptions bridge when a subscription entitlement
 * code needs to resolve to one or more membership plans. The bridge already
 * filters to active plans with compatible grantMode inside
 * `grantFromSubscription`, but this helper exposes the raw code → plan[]
 * mapping for admin diagnostics and for a future reconciliation cron.
 *
 * Returns an ARRAY (possibly empty). Never returns null, never throws on a
 * missing match.
 *
 * No-op when the plugin is disabled — returns [] so callers don't branch.
 */
export const getPlansByLinkedSubscriptionCode = internalQuery({
  args: {
    code: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "membership"))) return [];

    // No dedicated index on linkedSubscriptionCode — the string is optional
    // and low-cardinality globally. Full scan is fine at expected volumes;
    // if this ever grows hot, add .index("by_linkedSubscriptionCode").
    const allPlans = await ctx.db.query("membership_plans").collect();
    return allPlans.filter(
      (plan: any) => plan.linkedSubscriptionCode === args.code,
    );
  },
});
