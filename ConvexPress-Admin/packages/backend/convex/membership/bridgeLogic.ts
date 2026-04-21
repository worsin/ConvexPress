/**
 * Membership — Bridge Logic (pure functions)
 *
 * Runtime-free helpers extracted from the Commerce-Subscriptions → Membership
 * bridge internals. These functions take plain objects (grants, plans, args)
 * and return decisions (action + patch payload). The internalMutations in
 * `internals.ts` are thin wrappers that do I/O (db reads/writes, logging) and
 * delegate the decisions here so they can be unit-tested without a full
 * Convex runtime.
 *
 * Scope:
 *   - grant decisions (create | refresh | skip)
 *   - revoke decisions (immediate | grace | no-op)
 *   - grace-transition decisions
 *
 * Shape contract:
 *   Every helper is a pure function of (inputs) → (decision object).
 *   No side effects, no throws, no clock reads (caller passes `now`).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ───────────────────────── Plan filtering ─────────────────────────

export type BridgePlan = {
  _id: string;
  status: "draft" | "active" | "archived" | string;
  linkedSubscriptionCode?: string | null;
  grantMode: "manual" | "subscription" | "purchase" | "hybrid" | string;
};

/**
 * Pick the plans that should receive a subscription-driven grant for the
 * given entitlement code. Filters both the grantMode and status invariants —
 * archived plans are silently dropped even if the upstream query accidentally
 * included them (race-safe double-check).
 */
export function selectBridgeablePlans<P extends BridgePlan>(
  plans: readonly P[],
  entitlementCode: string,
): P[] {
  return plans.filter(
    (p) =>
      p.status === "active" &&
      p.linkedSubscriptionCode === entitlementCode &&
      (p.grantMode === "subscription" || p.grantMode === "hybrid"),
  );
}

// ───────────────────────── Grant decisions ─────────────────────────

export type BridgeGrant = {
  _id: string;
  userId: string;
  planId: string;
  sourceType: "manual" | "subscription" | "purchase" | "import" | string;
  sourceRef?: string | null;
  status: "active" | "grace" | "revoked" | "expired" | string;
  startsAt: number;
  endsAt?: number | null;
  graceEndsAt?: number | null;
  revokedAt?: number | null;
  updatedAt?: number;
};

export type GrantDecision =
  | {
      kind: "create";
      doc: {
        userId: string;
        planId: string;
        sourceType: "subscription";
        sourceRef: string;
        status: "active";
        startsAt: number;
        endsAt?: number;
        createdAt: number;
        updatedAt: number;
      };
    }
  | {
      kind: "refresh";
      grantId: string;
      patch: {
        sourceRef: string;
        updatedAt: number;
        endsAt?: number;
      };
    };

/**
 * Decide whether a new grant should be inserted or an existing one refreshed
 * for a given (userId, planId) pair.
 *
 * Idempotency contract:
 *   - No existing active grant → create a new one.
 *   - Existing active grant:
 *     - Always refresh sourceRef + updatedAt (bridge must record the latest
 *       subscription even if no expiry extension is warranted).
 *     - Only extend endsAt if incoming endsAt is strictly later (or existing
 *       grant has no endsAt at all). Never shrink an end date on refresh.
 */
export function decideGrant(input: {
  existingActiveGrantsForUserPlan: readonly BridgeGrant[];
  userId: string;
  planId: string;
  subscriptionId: string;
  endsAt: number | undefined;
  now: number;
}): GrantDecision {
  const { existingActiveGrantsForUserPlan, userId, planId, subscriptionId, endsAt, now } =
    input;

  const existing = existingActiveGrantsForUserPlan.find(
    (g) => g.userId === userId && g.planId === planId && g.status === "active",
  );

  if (!existing) {
    const doc: GrantDecision = {
      kind: "create",
      doc: {
        userId,
        planId,
        sourceType: "subscription",
        sourceRef: subscriptionId,
        status: "active",
        startsAt: now,
        endsAt,
        createdAt: now,
        updatedAt: now,
      },
    };
    // Remove undefined endsAt from the doc if not provided (cleaner output,
    // matches legacy behavior where field was omitted).
    if (endsAt === undefined) delete (doc.doc as any).endsAt;
    return doc;
  }

  const patch: { sourceRef: string; updatedAt: number; endsAt?: number } = {
    sourceRef: subscriptionId,
    updatedAt: now,
  };
  if (
    endsAt !== undefined &&
    (existing.endsAt === null ||
      existing.endsAt === undefined ||
      endsAt > existing.endsAt)
  ) {
    patch.endsAt = endsAt;
  }
  return { kind: "refresh", grantId: existing._id, patch };
}

// ───────────────────────── Revoke decisions ─────────────────────────

export type RevokePatch =
  | {
      kind: "revoke";
      grantId: string;
      patch: { status: "revoked"; revokedAt: number; updatedAt: number };
    }
  | {
      kind: "grace";
      grantId: string;
      patch: { status: "grace"; graceEndsAt: number; updatedAt: number };
    };

/**
 * Decide the per-grant transition when a subscription is being revoked.
 *
 * Rules:
 *   - Grant already in grace → revoke immediately (the grace period started
 *     on first cancel attempt; a second cancel means hard-revoke now).
 *   - gracePeriodDays > 0 → move to grace with `graceEndsAt = now + days`.
 *   - Otherwise → revoke immediately.
 */
export function decideRevoke(input: {
  grant: BridgeGrant;
  gracePeriodDays: number;
  now: number;
}): RevokePatch {
  const { grant, gracePeriodDays, now } = input;

  if (grant.status === "grace") {
    return {
      kind: "revoke",
      grantId: grant._id,
      patch: { status: "revoked", revokedAt: now, updatedAt: now },
    };
  }

  if (gracePeriodDays > 0) {
    return {
      kind: "grace",
      grantId: grant._id,
      patch: {
        status: "grace",
        graceEndsAt: now + gracePeriodDays * MS_PER_DAY,
        updatedAt: now,
      },
    };
  }

  return {
    kind: "revoke",
    grantId: grant._id,
    patch: { status: "revoked", revokedAt: now, updatedAt: now },
  };
}

/**
 * Filter grants down to those sourced from a specific subscription.
 * Used by both revoke and move-to-grace flows.
 */
export function filterGrantsBySubscription<G extends BridgeGrant>(
  grants: readonly G[],
  subscriptionId: string,
): G[] {
  return grants.filter(
    (g) => g.sourceType === "subscription" && g.sourceRef === subscriptionId,
  );
}

// ───────────────────────── Move-to-grace decisions ─────────────────────────

export type MoveToGraceDecision =
  | {
      kind: "move";
      grantId: string;
      patch: { status: "grace"; graceEndsAt: number; updatedAt: number };
    }
  | { kind: "skip"; grantId: string; reason: "already_grace" | "not_active" };

/**
 * Decide the transition for `moveGrantToGrace`.
 *
 * Called when a subscription enters past_due or paused status. Moves active
 * grants to grace; leaves already-grace grants untouched (do NOT reset
 * graceEndsAt — that would extend the grace window every time the
 * subscription status re-transitions, which is wrong).
 */
export function decideMoveToGrace(input: {
  grant: BridgeGrant;
  gracePeriodDays: number;
  now: number;
}): MoveToGraceDecision {
  const { grant, gracePeriodDays, now } = input;

  if (grant.status === "grace") {
    return { kind: "skip", grantId: grant._id, reason: "already_grace" };
  }
  if (grant.status !== "active") {
    return { kind: "skip", grantId: grant._id, reason: "not_active" };
  }

  return {
    kind: "move",
    grantId: grant._id,
    patch: {
      status: "grace",
      graceEndsAt: now + gracePeriodDays * MS_PER_DAY,
      updatedAt: now,
    },
  };
}
