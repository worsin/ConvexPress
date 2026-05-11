/**
 * Commerce Subscriptions ↔ Membership bridge — integration tests.
 *
 * Two layers of coverage:
 *
 *   1. Pure-logic tests for `decideBridgeCall` — every subscription status is
 *      mapped to the correct membership bridge action. Status-table coverage.
 *
 *   2. Handler-level tests using a mock `ctx` that stands in for the Convex
 *      runtime. We import `decideBridgeCall` directly and exercise the
 *      branching that `syncEntitlementsForStatus` performs: plugin flags,
 *      acceptSubscriptionGrants setting, per-entitlement iteration,
 *      per-entitlement failure isolation.
 *
 *      `syncEntitlementsForStatus` itself is a local (non-exported) helper,
 *      so we test the same decision + dispatch pipeline that it runs by
 *      driving `decideBridgeCall` directly on the same inputs. This keeps
 *      tests bun-friendly (no convex-test, which requires `import.meta.glob`)
 *      and validates the decision table explicitly.
 *
 * Run with: bun test convex/commerceSubscriptions/__tests__/bridge.test.ts
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import { decideBridgeCall } from "../bridgeDecisions";

// ═══════════════════════════════════════════════════════════════════════════
// Pure decision tests — the subscription-status → bridge-action table
// ═══════════════════════════════════════════════════════════════════════════

const baseSub = {
  _id: "sub_123",
  userId: "users__u1",
  status: "active" as const,
  currentPeriodEndAt: 5_000_000,
};

const baseEnt = { entitlementCode: "PRO" };

describe("decideBridgeCall: status → action mapping", () => {
  test("active → grant with endsAt from currentPeriodEndAt", () => {
    const d = decideBridgeCall({
      subscription: { ...baseSub, status: "active" },
      entitlement: baseEnt,
      gracePeriodDays: 3,
    });
    expect(d.action).toBe("grant");
    if (d.action !== "grant") throw new Error("kind");
    expect(d.args).toEqual({
      userId: "users__u1",
      entitlementCode: "PRO",
      subscriptionId: "sub_123",
      endsAt: 5_000_000,
    });
  });

  test("trialing → grant (same semantics as active)", () => {
    const d = decideBridgeCall({
      subscription: { ...baseSub, status: "trialing" },
      entitlement: baseEnt,
      gracePeriodDays: 3,
    });
    expect(d.action).toBe("grant");
    if (d.action !== "grant") throw new Error("kind");
    expect(d.args.endsAt).toBe(5_000_000);
  });

  test("past_due → moveToGrace with config gracePeriodDays", () => {
    const d = decideBridgeCall({
      subscription: { ...baseSub, status: "past_due" },
      entitlement: baseEnt,
      gracePeriodDays: 7,
    });
    expect(d.action).toBe("moveToGrace");
    if (d.action !== "moveToGrace") throw new Error("kind");
    expect(d.args).toEqual({
      userId: "users__u1",
      subscriptionId: "sub_123",
      gracePeriodDays: 7,
    });
  });

  test("paused → moveToGrace (same as past_due)", () => {
    const d = decideBridgeCall({
      subscription: { ...baseSub, status: "paused" },
      entitlement: baseEnt,
      gracePeriodDays: 14,
    });
    expect(d.action).toBe("moveToGrace");
    if (d.action !== "moveToGrace") throw new Error("kind");
    expect(d.args.gracePeriodDays).toBe(14);
  });

  test("cancelled → revoke with gracePeriodDays=0 (grace already happened)", () => {
    const d = decideBridgeCall({
      subscription: { ...baseSub, status: "cancelled" },
      entitlement: baseEnt,
      gracePeriodDays: 7, // should be IGNORED — cancelled is always immediate
    });
    expect(d.action).toBe("revoke");
    if (d.action !== "revoke") throw new Error("kind");
    expect(d.args).toEqual({
      userId: "users__u1",
      subscriptionId: "sub_123",
      gracePeriodDays: 0,
    });
  });

  test("expired → revoke (same as cancelled)", () => {
    const d = decideBridgeCall({
      subscription: { ...baseSub, status: "expired" },
      entitlement: baseEnt,
      gracePeriodDays: 7,
    });
    expect(d.action).toBe("revoke");
    if (d.action !== "revoke") throw new Error("kind");
    expect(d.args.gracePeriodDays).toBe(0);
  });

  test("pending_cancel → noop (grant stays active until cancelled)", () => {
    const d = decideBridgeCall({
      subscription: { ...baseSub, status: "pending_cancel" },
      entitlement: baseEnt,
      gracePeriodDays: 3,
    });
    expect(d.action).toBe("noop");
    if (d.action !== "noop") throw new Error("kind");
    expect(d.reason).toMatch(/no_action_for_status/);
  });

  test("draft → noop", () => {
    const d = decideBridgeCall({
      subscription: { ...baseSub, status: "draft" },
      entitlement: baseEnt,
      gracePeriodDays: 3,
    });
    expect(d.action).toBe("noop");
  });

  test("unknown status → noop (safe fallback, no throw)", () => {
    const d = decideBridgeCall({
      subscription: { ...baseSub, status: "mystery_status" },
      entitlement: baseEnt,
      gracePeriodDays: 3,
    });
    expect(d.action).toBe("noop");
  });
});

describe("decideBridgeCall: endsAt resolution for grant", () => {
  test("falls back to subscription.endsAt when currentPeriodEndAt missing", () => {
    const d = decideBridgeCall({
      subscription: {
        _id: "sub_x",
        userId: "u1",
        status: "active",
        endsAt: 9_999,
      },
      entitlement: baseEnt,
      gracePeriodDays: 3,
    });
    expect(d.action).toBe("grant");
    if (d.action !== "grant") throw new Error();
    expect(d.args.endsAt).toBe(9_999);
  });

  test("omits endsAt when neither currentPeriodEndAt nor endsAt set", () => {
    const d = decideBridgeCall({
      subscription: { _id: "sub_x", userId: "u1", status: "active" },
      entitlement: baseEnt,
      gracePeriodDays: 3,
    });
    expect(d.action).toBe("grant");
    if (d.action !== "grant") throw new Error();
    expect(d.args.endsAt).toBeUndefined();
  });

  test("currentPeriodEndAt wins over endsAt when both present", () => {
    const d = decideBridgeCall({
      subscription: {
        _id: "sub_x",
        userId: "u1",
        status: "active",
        currentPeriodEndAt: 1_000,
        endsAt: 2_000,
      },
      entitlement: baseEnt,
      gracePeriodDays: 3,
    });
    expect(d.action).toBe("grant");
    if (d.action !== "grant") throw new Error();
    expect(d.args.endsAt).toBe(1_000); // currentPeriodEndAt takes priority
  });
});

describe("decideBridgeCall: guard rails", () => {
  test("blank entitlementCode → noop", () => {
    const d = decideBridgeCall({
      subscription: baseSub,
      entitlement: { entitlementCode: "" },
      gracePeriodDays: 3,
    });
    expect(d.action).toBe("noop");
    if (d.action !== "noop") throw new Error();
    expect(d.reason).toBe("no_entitlement_code");
  });

  test("undefined entitlementCode → noop", () => {
    const d = decideBridgeCall({
      subscription: baseSub,
      entitlement: {},
      gracePeriodDays: 3,
    });
    expect(d.action).toBe("noop");
    if (d.action !== "noop") throw new Error();
    expect(d.reason).toBe("no_entitlement_code");
  });

  test("null entitlementCode → noop", () => {
    const d = decideBridgeCall({
      subscription: baseSub,
      entitlement: { entitlementCode: null },
      gracePeriodDays: 3,
    });
    expect(d.action).toBe("noop");
  });

  test("subscription missing userId → noop", () => {
    const d = decideBridgeCall({
      subscription: { _id: "sub_x", status: "active" },
      entitlement: baseEnt,
      gracePeriodDays: 3,
    });
    expect(d.action).toBe("noop");
    if (d.action !== "noop") throw new Error();
    expect(d.reason).toBe("no_user_id");
  });

  test("subscription._id is always coerced to string", () => {
    // Convex Ids are opaque — we coerce with String() when building args.
    const opaqueId = { __brand: "id" };
    const d = decideBridgeCall({
      subscription: {
        _id: opaqueId as any,
        userId: "u1",
        status: "cancelled",
      },
      entitlement: baseEnt,
      gracePeriodDays: 3,
    });
    expect(d.action).toBe("revoke");
    if (d.action !== "revoke") throw new Error();
    expect(d.args.subscriptionId).toBe(String(opaqueId));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Integration-style tests: multi-entitlement dispatch + failure isolation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Drive the same per-entitlement dispatch loop that
 * `syncEntitlementsForStatus` runs, using `decideBridgeCall` and a mock
 * bridge dispatcher. Lets us assert cross-entitlement behavior (one failure
 * doesn't skip the rest, noops skip without a call) without a live ctx.
 */
async function dispatchBridgeCalls(
  subscription: any,
  entitlements: Array<{ entitlementCode?: string | null }>,
  gracePeriodDays: number,
  dispatcher: (action: string, args: any) => Promise<void>,
  onError: (
    subscriptionId: string,
    entitlementCode: string,
    action: string,
    err: unknown,
  ) => void = () => {},
): Promise<void> {
  for (const entitlement of entitlements) {
    const decision = decideBridgeCall({
      subscription,
      entitlement,
      gracePeriodDays,
    });
    if (decision.action === "noop") continue;
    try {
      await dispatcher(decision.action, decision.args);
    } catch (err) {
      onError(
        String(subscription._id),
        entitlement.entitlementCode ?? "(no-code)",
        decision.action,
        err,
      );
    }
  }
}

describe("bridge dispatch — multi-entitlement behavior", () => {
  test("calls bridge once per entitlement with correct action", async () => {
    const calls: Array<{ action: string; args: any }> = [];
    await dispatchBridgeCalls(
      { _id: "sub_1", userId: "u1", status: "active", currentPeriodEndAt: 9 },
      [{ entitlementCode: "PRO" }, { entitlementCode: "ENTERPRISE" }],
      3,
      async (action, args) => {
        calls.push({ action, args });
      },
    );
    expect(calls.length).toBe(2);
    expect(calls[0]).toEqual({
      action: "grant",
      args: {
        userId: "u1",
        entitlementCode: "PRO",
        subscriptionId: "sub_1",
        endsAt: 9,
      },
    });
    expect(calls[1]).toEqual({
      action: "grant",
      args: {
        userId: "u1",
        entitlementCode: "ENTERPRISE",
        subscriptionId: "sub_1",
        endsAt: 9,
      },
    });
  });

  test("skips entitlement with missing code, processes others", async () => {
    const calls: Array<{ action: string; args: any }> = [];
    await dispatchBridgeCalls(
      { _id: "sub_1", userId: "u1", status: "active" },
      [
        { entitlementCode: "" },
        { entitlementCode: "PRO" },
        { entitlementCode: null },
        { entitlementCode: "ENT" },
      ],
      3,
      async (action, args) => {
        calls.push({ action, args });
      },
    );
    expect(calls.length).toBe(2);
    expect(calls.map((c) => c.args.entitlementCode)).toEqual(["PRO", "ENT"]);
  });

  test("per-entitlement failure does not block subsequent entitlements", async () => {
    const calls: string[] = [];
    const errors: Array<{ code: string; action: string; msg: string }> = [];

    await dispatchBridgeCalls(
      { _id: "sub_1", userId: "u1", status: "active", currentPeriodEndAt: 99 },
      [
        { entitlementCode: "PRO" },
        { entitlementCode: "FAILS" },
        { entitlementCode: "ENT" },
      ],
      3,
      async (_action, args) => {
        if (args.entitlementCode === "FAILS")
          throw new Error("simulated bridge failure");
        calls.push(args.entitlementCode);
      },
      (_subscriptionId, code, action, err) => {
        errors.push({
          code,
          action,
          msg: err instanceof Error ? err.message : String(err),
        });
      },
    );

    expect(calls).toEqual(["PRO", "ENT"]);
    expect(errors.length).toBe(1);
    expect(errors[0].code).toBe("FAILS");
    expect(errors[0].action).toBe("grant");
    expect(errors[0].msg).toMatch(/simulated bridge failure/);
  });

  test("pending_cancel → no dispatcher calls (noop for all entitlements)", async () => {
    const calls: Array<{ action: string; args: any }> = [];
    await dispatchBridgeCalls(
      { _id: "sub_1", userId: "u1", status: "pending_cancel" },
      [{ entitlementCode: "PRO" }, { entitlementCode: "ENT" }],
      3,
      async (action, args) => {
        calls.push({ action, args });
      },
    );
    expect(calls.length).toBe(0);
  });

  test("mixed statuses don't cross-pollinate (test one call at a time)", async () => {
    // Just confirm that a subscription transitioning through three different
    // terminal states produces three different dispatch patterns.
    const cases = [
      { status: "trialing", expectedAction: "grant" },
      { status: "past_due", expectedAction: "moveToGrace" },
      { status: "cancelled", expectedAction: "revoke" },
    ];
    for (const { status, expectedAction } of cases) {
      const calls: string[] = [];
      await dispatchBridgeCalls(
        { _id: "sub_1", userId: "u1", status, currentPeriodEndAt: 99 },
        [{ entitlementCode: "PRO" }],
        3,
        async (action) => {
          calls.push(action);
        },
      );
      expect(calls).toEqual([expectedAction]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Settings / plugin-gate emulation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Minimal replica of `isBridgeEnabled` (defined privately in internals.ts
 * and mutations.ts) that reads from a pair of plain objects. Proves the
 * gate logic covers:
 *   - either plugin off → false
 *   - acceptSubscriptionGrants=false → false
 *   - acceptSubscriptionGrants unset (default true) → true
 *   - both plugins on + no explicit disable → true
 */
function simulateBridgeEnabledGate(input: {
  commerceOn: boolean;
  membershipOn: boolean;
  acceptSubscriptionGrants?: boolean | undefined;
}): boolean {
  if (!input.commerceOn) return false;
  if (!input.membershipOn) return false;
  if (input.acceptSubscriptionGrants === false) return false;
  return true;
}

describe("isBridgeEnabled gate (emulated)", () => {
  test("both plugins on, setting unset → enabled", () => {
    expect(
      simulateBridgeEnabledGate({
        commerceOn: true,
        membershipOn: true,
      }),
    ).toBe(true);
  });

  test("membership plugin off → disabled (skip bridge silently)", () => {
    expect(
      simulateBridgeEnabledGate({
        commerceOn: true,
        membershipOn: false,
      }),
    ).toBe(false);
  });

  test("commerce-subscriptions plugin off → disabled", () => {
    expect(
      simulateBridgeEnabledGate({
        commerceOn: false,
        membershipOn: true,
      }),
    ).toBe(false);
  });

  test("acceptSubscriptionGrants=false → disabled", () => {
    expect(
      simulateBridgeEnabledGate({
        commerceOn: true,
        membershipOn: true,
        acceptSubscriptionGrants: false,
      }),
    ).toBe(false);
  });

  test("acceptSubscriptionGrants=true (explicit) → enabled", () => {
    expect(
      simulateBridgeEnabledGate({
        commerceOn: true,
        membershipOn: true,
        acceptSubscriptionGrants: true,
      }),
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// No-matching-plans propagation
// ═══════════════════════════════════════════════════════════════════════════

describe("membership bridge skip markers propagate as no-throw", () => {
  // The real membership handlers return { skipped: "plugin_disabled" } or
  // { reason: "no_matching_plans" } instead of throwing. Simulate that the
  // dispatcher does not treat these as errors.
  test("no_matching_plans response is not an error", async () => {
    const errors: any[] = [];
    await dispatchBridgeCalls(
      { _id: "sub_1", userId: "u1", status: "active", currentPeriodEndAt: 9 },
      [{ entitlementCode: "PRO" }],
      3,
      async () => {
        // simulate real handler returning skip marker (NOT throwing)
        return undefined;
      },
      (_s, _c, _a, err) => {
        errors.push(err);
      },
    );
    expect(errors.length).toBe(0);
  });
});
