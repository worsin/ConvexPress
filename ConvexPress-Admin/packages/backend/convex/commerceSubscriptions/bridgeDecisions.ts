/**
 * Commerce Subscriptions — Bridge Decisions (pure functions)
 *
 * Runtime-free helper that decides what membership bridge action (if any) to
 * invoke when a subscription's status changes. Mirrors the pattern in
 * `membership/bridgeLogic.ts`: given a subscription + entitlement, return a
 * `{ action, args }` tuple. No db reads, no clock reads — tests can exercise
 * every branch without booting Convex.
 *
 * The real I/O-bound wiring lives in `syncEntitlementsForStatus`
 * (commerceSubscriptions/internals.ts AND commerceSubscriptions/mutations.ts).
 */

// Subscription status → bridge action mapping per the design spec (§ 2.3):
//   active, trialing        → grantFromSubscription (endsAt = period end)
//   past_due, paused        → moveGrantToGrace     (uses config.gracePeriodDays)
//   cancelled, expired      → revokeFromSubscription (gracePeriodDays=0 — grace already happened on past_due)
//   pending_cancel, draft   → no-op (grant stays active until contract reaches cancelled at period end)

export type SubscriptionStatus =
  | "draft"
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "pending_cancel"
  | "cancelled"
  | "expired"
  | string;

export type BridgeInputSubscription = {
  _id: unknown;
  status: SubscriptionStatus;
  userId?: unknown;
  currentPeriodEndAt?: number;
  endsAt?: number; // not on the schema, but fall-back-compatible
};

export type BridgeInputEntitlement = {
  entitlementCode?: string | null;
};

export type BridgeDecision =
  | {
      action: "grant";
      args: {
        userId: unknown;
        entitlementCode: string;
        subscriptionId: string;
        endsAt?: number;
      };
    }
  | {
      action: "moveToGrace";
      args: {
        userId: unknown;
        subscriptionId: string;
        gracePeriodDays: number;
      };
    }
  | {
      action: "revoke";
      args: {
        userId: unknown;
        subscriptionId: string;
        gracePeriodDays: number; // always 0 — grace already happened on past_due
      };
    }
  | { action: "noop"; reason: string };

/**
 * Decide the single bridge call (if any) for one (subscription, entitlement)
 * pair. Callers iterate entitlements and dispatch each decision.
 *
 * Returns `{ action: "noop" }` (never throws) when:
 *   - the subscription status does not map to any bridge action
 *   - the entitlement has no `entitlementCode` (blank/undefined)
 *   - the subscription has no `userId` (can't target a grant without it)
 */
export function decideBridgeCall(input: {
  subscription: BridgeInputSubscription;
  entitlement: BridgeInputEntitlement;
  gracePeriodDays: number;
}): BridgeDecision {
  const { subscription, entitlement, gracePeriodDays } = input;

  const code = entitlement.entitlementCode;
  if (!code) {
    return { action: "noop", reason: "no_entitlement_code" };
  }
  if (!subscription.userId) {
    return { action: "noop", reason: "no_user_id" };
  }

  const subscriptionId = String(subscription._id);
  const status = subscription.status;

  if (status === "active" || status === "trialing") {
    const endsAt = subscription.currentPeriodEndAt ?? subscription.endsAt;
    return {
      action: "grant",
      args: {
        userId: subscription.userId,
        entitlementCode: code,
        subscriptionId,
        ...(endsAt !== undefined ? { endsAt } : {}),
      },
    };
  }

  if (status === "past_due" || status === "paused") {
    return {
      action: "moveToGrace",
      args: {
        userId: subscription.userId,
        subscriptionId,
        gracePeriodDays,
      },
    };
  }

  if (status === "cancelled" || status === "expired") {
    return {
      action: "revoke",
      args: {
        userId: subscription.userId,
        subscriptionId,
        gracePeriodDays: 0, // immediate — grace already happened on past_due
      },
    };
  }

  // pending_cancel, draft, or any unknown status → no bridge action
  return { action: "noop", reason: `no_action_for_status:${status}` };
}
