import { ConvexError } from "convex/values";

import type { QueryCtx, MutationCtx } from "../_generated/server";
import { isMembershipPluginEnabled } from "../commerce/helpers";

type MembershipCtx = QueryCtx | MutationCtx;

export interface MembershipAccessDecision {
  allowed: boolean;
  reason: string;
  matchingPlanIds: string[];
}

export async function requireMembershipEnabled(
  ctx: MembershipCtx,
): Promise<void> {
  if (!(await isMembershipPluginEnabled(ctx))) {
    throw new ConvexError({
      code: "membership_disabled",
      message: "Membership plugin is disabled.",
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Benefit display helpers (Wave 6 — pricing page enrichment)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Shape of a displayable plan benefit for pricing surfaces.
 */
export interface DisplayableBenefit {
  _id: string;
  label: string;
  description?: string;
  sourcePlanId: string;
}

/**
 * Return displayable benefits for a single plan.
 *
 * A benefit is "displayable" when `displayAsFeature !== false` — absence of
 * the field is treated as TRUE per Wave 1 schema convention.
 *
 * Uses direct `ctx.db` reads so this helper can be called from both the
 * membership queries module and the commerce subscriptions offers query
 * without any cross-query overhead.
 */
export async function getDisplayableBenefitsForPlanHelper(
  ctx: { db: any },
  planId: string,
): Promise<DisplayableBenefit[]> {
  const benefits = await ctx.db
    .query("membership_plan_benefits")
    .withIndex("by_plan", (q: any) => q.eq("planId", planId))
    .collect();

  return (benefits as any[])
    .filter((b: any) => b.displayAsFeature !== false)
    .map((b: any) => ({
      _id: b._id,
      label: b.label,
      ...(b.description !== undefined ? { description: b.description } : {}),
      sourcePlanId: planId,
    }));
}

/**
 * Return displayable benefits for a set of entitlement codes.
 *
 * For each code, resolves the linked `membership_plans` where
 * `linkedSubscriptionCode === code` AND `status === "active"`.
 * Collects all displayable benefits, then dedupes by `label` (case-sensitive),
 * preserving the first occurrence's description and sourcePlanId.
 * Iterates codes in input order for deterministic output.
 *
 * Returns `[]` when:
 *   - `codes` is empty
 *   - No active plans match any code
 *   - All benefits have `displayAsFeature === false`
 */
export async function getDisplayableBenefitsForCodesHelper(
  ctx: { db: any },
  codes: string[],
): Promise<DisplayableBenefit[]> {
  if (codes.length === 0) return [];

  // Full scan — no dedicated index on linkedSubscriptionCode (low cardinality).
  const allPlans = await ctx.db.query("membership_plans").collect();

  const seen = new Map<string, DisplayableBenefit>(); // label → first occurrence

  for (const code of codes) {
    const matchingPlans = (allPlans as any[]).filter(
      (p: any) =>
        p.linkedSubscriptionCode === code && p.status === "active",
    );

    for (const plan of matchingPlans) {
      const benefits = await getDisplayableBenefitsForPlanHelper(ctx, plan._id);
      for (const benefit of benefits) {
        if (!seen.has(benefit.label)) {
          seen.set(benefit.label, benefit);
        }
      }
    }
  }

  return Array.from(seen.values());
}
