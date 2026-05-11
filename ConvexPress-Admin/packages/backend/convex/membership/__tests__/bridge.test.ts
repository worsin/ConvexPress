/**
 * Membership bridge — integration tests.
 *
 * Tests the grant/revoke/moveGrantToGrace handler bodies against an
 * in-memory mock of `ctx.db` that implements the minimal query/get/insert/
 * patch surface the handlers touch. convex-test isn't used because it
 * requires `import.meta.glob` (Vite-specific) and the monorepo runs on bun.
 *
 * What's covered:
 *   - Decision logic via exported pure helpers (bridgeLogic.ts)
 *   - Handler wiring (plugin-gate short-circuit, access-log writes,
 *     idempotency on repeated calls, archived-plan skip, end-date extension)
 *
 * Run with: bun test convex/membership/__tests__/bridge.test.ts
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { beforeEach, describe, expect, test } from "bun:test";

import {
  _grantFromSubscriptionHandler,
  _moveGrantToGraceHandler,
  _revokeFromSubscriptionHandler,
} from "../internals";
import {
  decideGrant,
  decideMoveToGrace,
  decideRevoke,
  filterGrantsBySubscription,
  selectBridgeablePlans,
} from "../bridgeLogic";

// ═══════════════════════════════════════════════════════════════════════════
// Pure-logic tests (bridgeLogic.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe("selectBridgeablePlans", () => {
  test("keeps only active + matching-code + subscription|hybrid plans", () => {
    const plans = [
      { _id: "p1", status: "active", linkedSubscriptionCode: "PRO", grantMode: "subscription" },
      { _id: "p2", status: "active", linkedSubscriptionCode: "PRO", grantMode: "hybrid" },
      { _id: "p3", status: "active", linkedSubscriptionCode: "PRO", grantMode: "manual" },
      { _id: "p4", status: "archived", linkedSubscriptionCode: "PRO", grantMode: "subscription" },
      { _id: "p5", status: "active", linkedSubscriptionCode: "BASIC", grantMode: "subscription" },
    ];
    const result = selectBridgeablePlans(plans, "PRO");
    expect(result.map((p) => p._id)).toEqual(["p1", "p2"]);
  });
});

describe("decideGrant", () => {
  test("creates a new grant when none exists", () => {
    const out = decideGrant({
      existingActiveGrantsForUserPlan: [],
      userId: "u1",
      planId: "p1",
      subscriptionId: "sub_abc",
      endsAt: 2_000,
      now: 1_000,
    });
    expect(out.kind).toBe("create");
    if (out.kind !== "create") throw new Error("kind");
    expect(out.doc).toMatchObject({
      userId: "u1",
      planId: "p1",
      sourceType: "subscription",
      sourceRef: "sub_abc",
      status: "active",
      startsAt: 1_000,
      endsAt: 2_000,
    });
  });

  test("refreshes sourceRef + updatedAt even when endsAt is not extended", () => {
    const out = decideGrant({
      existingActiveGrantsForUserPlan: [
        {
          _id: "g1",
          userId: "u1",
          planId: "p1",
          sourceType: "subscription",
          sourceRef: "sub_OLD",
          status: "active",
          startsAt: 0,
          endsAt: 5_000,
        },
      ],
      userId: "u1",
      planId: "p1",
      subscriptionId: "sub_NEW",
      endsAt: 3_000, // earlier than existing endsAt
      now: 1_000,
    });
    expect(out.kind).toBe("refresh");
    if (out.kind !== "refresh") throw new Error("kind");
    expect(out.grantId).toBe("g1");
    expect(out.patch.sourceRef).toBe("sub_NEW");
    expect(out.patch.updatedAt).toBe(1_000);
    expect(out.patch.endsAt).toBeUndefined(); // not extended
  });

  test("extends endsAt when incoming is strictly later", () => {
    const out = decideGrant({
      existingActiveGrantsForUserPlan: [
        {
          _id: "g1",
          userId: "u1",
          planId: "p1",
          sourceType: "subscription",
          sourceRef: "sub",
          status: "active",
          startsAt: 0,
          endsAt: 5_000,
        },
      ],
      userId: "u1",
      planId: "p1",
      subscriptionId: "sub",
      endsAt: 10_000,
      now: 1_000,
    });
    expect(out.kind).toBe("refresh");
    if (out.kind !== "refresh") throw new Error("kind");
    expect(out.patch.endsAt).toBe(10_000);
  });

  test("refreshes when existing grant has no endsAt — always extends", () => {
    const out = decideGrant({
      existingActiveGrantsForUserPlan: [
        {
          _id: "g1",
          userId: "u1",
          planId: "p1",
          sourceType: "subscription",
          sourceRef: "sub",
          status: "active",
          startsAt: 0,
          // no endsAt
        },
      ],
      userId: "u1",
      planId: "p1",
      subscriptionId: "sub",
      endsAt: 10_000,
      now: 1_000,
    });
    expect(out.kind).toBe("refresh");
    if (out.kind !== "refresh") throw new Error("kind");
    expect(out.patch.endsAt).toBe(10_000);
  });
});

describe("decideRevoke", () => {
  const baseGrant = {
    _id: "g1",
    userId: "u1",
    planId: "p1",
    sourceType: "subscription" as const,
    sourceRef: "sub",
    startsAt: 0,
  };

  test("already-grace grant → immediate revoke", () => {
    const out = decideRevoke({
      grant: { ...baseGrant, status: "grace" },
      gracePeriodDays: 7,
      now: 1_000,
    });
    expect(out.kind).toBe("revoke");
    if (out.kind !== "revoke") throw new Error();
    expect(out.patch.status).toBe("revoked");
    expect(out.patch.revokedAt).toBe(1_000);
  });

  test("active grant with gracePeriodDays > 0 → grace", () => {
    const out = decideRevoke({
      grant: { ...baseGrant, status: "active" },
      gracePeriodDays: 7,
      now: 1_000,
    });
    expect(out.kind).toBe("grace");
    if (out.kind !== "grace") throw new Error();
    expect(out.patch.graceEndsAt).toBe(1_000 + 7 * 24 * 60 * 60 * 1000);
  });

  test("active grant with gracePeriodDays = 0 → immediate revoke", () => {
    const out = decideRevoke({
      grant: { ...baseGrant, status: "active" },
      gracePeriodDays: 0,
      now: 1_000,
    });
    expect(out.kind).toBe("revoke");
    if (out.kind !== "revoke") throw new Error();
    expect(out.patch.status).toBe("revoked");
  });
});

describe("decideMoveToGrace", () => {
  const baseGrant = {
    _id: "g1",
    userId: "u1",
    planId: "p1",
    sourceType: "subscription" as const,
    sourceRef: "sub",
    startsAt: 0,
  };

  test("active → grace with correct graceEndsAt", () => {
    const out = decideMoveToGrace({
      grant: { ...baseGrant, status: "active" },
      gracePeriodDays: 3,
      now: 1_000,
    });
    expect(out.kind).toBe("move");
    if (out.kind !== "move") throw new Error();
    expect(out.patch.status).toBe("grace");
    expect(out.patch.graceEndsAt).toBe(1_000 + 3 * 24 * 60 * 60 * 1000);
  });

  test("already-grace → skip (does NOT reset graceEndsAt)", () => {
    const out = decideMoveToGrace({
      grant: { ...baseGrant, status: "grace", graceEndsAt: 99_999 },
      gracePeriodDays: 3,
      now: 1_000,
    });
    expect(out.kind).toBe("skip");
    if (out.kind !== "skip") throw new Error();
    expect(out.reason).toBe("already_grace");
  });

  test("revoked → skip", () => {
    const out = decideMoveToGrace({
      grant: { ...baseGrant, status: "revoked" },
      gracePeriodDays: 3,
      now: 1_000,
    });
    expect(out.kind).toBe("skip");
    if (out.kind !== "skip") throw new Error();
    expect(out.reason).toBe("not_active");
  });
});

describe("filterGrantsBySubscription", () => {
  test("drops grants from other sources or other subscription refs", () => {
    const grants = [
      { _id: "g1", userId: "u1", planId: "p1", sourceType: "subscription", sourceRef: "A", status: "active", startsAt: 0 },
      { _id: "g2", userId: "u1", planId: "p2", sourceType: "subscription", sourceRef: "B", status: "active", startsAt: 0 },
      { _id: "g3", userId: "u1", planId: "p3", sourceType: "manual", sourceRef: "A", status: "active", startsAt: 0 },
    ];
    const out = filterGrantsBySubscription(grants, "A");
    expect(out.map((g) => g._id)).toEqual(["g1"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Mock ctx for handler-level tests
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Minimal in-memory mock of the Convex ctx.db surface used by the bridge
 * handlers. Supports:
 *   - query(table).withIndex(name, q => q.eq(field, val).eq(field, val)).collect()
 *   - query(table).collect()
 *   - get(id)
 *   - insert(table, doc) → id
 *   - patch(id, partial)
 * plus direct `_seed`/`_table` helpers for test setup.
 *
 * IDs are strings of the form `{table}__{n}`.
 */
function makeMockDb() {
  const tables: Record<string, Record<string, any>> = {};
  let idCounter = 0;

  function ensureTable(name: string) {
    if (!tables[name]) tables[name] = {};
    return tables[name];
  }

  function makeId(table: string): string {
    idCounter++;
    return `${table}__${idCounter}`;
  }

  function buildQuery(table: string) {
    const rows = Object.values(ensureTable(table));
    // Ripgrep-light filter builder: `withIndex(_, q => q.eq(f1, v1).eq(f2, v2))`
    // supplies constraints we AND together.
    const state = {
      filters: [] as Array<(row: any) => boolean>,
    };

    const api: any = {
      withIndex: (_name: string, builder: (q: any) => any) => {
        const qB = {
          _pairs: [] as Array<[string, any]>,
          eq(field: string, val: any) {
            this._pairs.push([field, val]);
            return this;
          },
        };
        builder(qB);
        const pairs = qB._pairs;
        state.filters.push((row: any) =>
          pairs.every(([f, v]) => row[f] === v),
        );
        return api;
      },
      filter: (builder: (q: any) => any) => {
        // Not used by bridge handlers, but support minimally.
        // builder receives a q with `eq(field(name), val)` style — we ignore.
        void builder;
        return api;
      },
      collect: async () => {
        if (state.filters.length === 0) return rows.slice();
        return rows.filter((row) => state.filters.every((f) => f(row)));
      },
      unique: async () => {
        const filtered =
          state.filters.length === 0
            ? rows.slice()
            : rows.filter((row) => state.filters.every((f) => f(row)));
        return filtered[0] ?? null;
      },
    };
    return api;
  }

  const db = {
    query(table: string) {
      return buildQuery(table);
    },
    async get(id: string) {
      const [table] = id.split("__");
      return ensureTable(table)[id] ?? null;
    },
    async insert(table: string, doc: any) {
      const id = makeId(table);
      const row = { ...doc, _id: id, _creationTime: Date.now() };
      ensureTable(table)[id] = row;
      return id;
    },
    async patch(id: string, partial: any) {
      const [table] = id.split("__");
      const row = ensureTable(table)[id];
      if (!row) throw new Error(`patch on missing ${id}`);
      Object.assign(row, partial);
      return undefined;
    },
  };

  // Test helpers
  function seedRow(table: string, doc: any) {
    const id = doc._id ?? makeId(table);
    ensureTable(table)[id] = { ...doc, _id: id };
    return id;
  }
  function listTable(table: string) {
    return Object.values(ensureTable(table));
  }

  return {
    db,
    _seedRow: seedRow,
    _listTable: listTable,
    _tables: tables,
  };
}

/**
 * Set the `plugins` / `membership.general` settings rows to control the
 * plugin gate and logAccessChecks flag for a test. Defaults: membership
 * enabled, logAccessChecks=true.
 */
function seedMembershipSettings(
  mock: ReturnType<typeof makeMockDb>,
  opts: { membershipEnabled?: boolean; logAccessChecks?: boolean } = {},
) {
  const enabled = opts.membershipEnabled ?? true;
  const logAccess = opts.logAccessChecks ?? true;
  mock._seedRow("settings", {
    section: "plugins",
    values: { membershipEnabled: enabled },
  });
  mock._seedRow("settings", {
    section: "membership.general",
    values: { logAccessChecks: logAccess, accessLogRetentionDays: 30 },
  });
}

function seedPlan(
  mock: ReturnType<typeof makeMockDb>,
  over: Partial<{
    _id: string;
    status: string;
    linkedSubscriptionCode: string;
    grantMode: string;
  }> = {},
) {
  return mock._seedRow("membership_plans", {
    title: "Plan",
    slug: "plan",
    status: "active",
    grantMode: "subscription",
    linkedSubscriptionCode: "PRO",
    priority: 10,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Handler-level tests
// ═══════════════════════════════════════════════════════════════════════════

describe("_grantFromSubscriptionHandler", () => {
  test("creates a grant when none exists", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock);
    const planId = seedPlan(mock);

    const result = await _grantFromSubscriptionHandler(mock, {
      userId: "users__user1",
      entitlementCode: "PRO",
      subscriptionId: "sub_1",
      endsAt: 2_000_000,
    });

    expect(result.grantedPlanIds).toEqual([planId]);
    const grants = mock._listTable("membership_grants");
    expect(grants.length).toBe(1);
    expect(grants[0]).toMatchObject({
      userId: "users__user1",
      planId,
      sourceType: "subscription",
      sourceRef: "sub_1",
      status: "active",
      endsAt: 2_000_000,
    });

    const logs = mock._listTable("membership_access_log");
    expect(logs.length).toBe(1);
    expect(logs[0].reason).toBe("bridge_grant_created");
    expect(logs[0].matchingPlanIds).toEqual([planId]);
  });

  test("is idempotent — second call refreshes existing grant, no duplicate", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock);
    const planId = seedPlan(mock);

    await _grantFromSubscriptionHandler(mock, {
      userId: "users__user1",
      entitlementCode: "PRO",
      subscriptionId: "sub_1",
      endsAt: 2_000_000,
    });
    const result2 = await _grantFromSubscriptionHandler(mock, {
      userId: "users__user1",
      entitlementCode: "PRO",
      subscriptionId: "sub_1b", // new subscription ref for same plan (renewal)
      endsAt: 2_000_000, // same endsAt — no extension
    });

    expect(result2.refreshedPlanIds).toEqual([planId]);
    expect(result2.grantedPlanIds).toEqual([]);

    const grants = mock._listTable("membership_grants");
    expect(grants.length).toBe(1); // no duplicate
    // sourceRef must be refreshed to the latest even with no endsAt extension
    expect(grants[0].sourceRef).toBe("sub_1b");

    const logs = mock._listTable("membership_access_log");
    expect(logs.length).toBe(2);
    expect(logs[0].reason).toBe("bridge_grant_created");
    expect(logs[1].reason).toBe("bridge_grant_refreshed");
  });

  test("extension path: later endsAt replaces earlier endsAt", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock);
    const planId = seedPlan(mock);

    await _grantFromSubscriptionHandler(mock, {
      userId: "users__user1",
      entitlementCode: "PRO",
      subscriptionId: "sub_1",
      endsAt: 2_000_000,
    });
    await _grantFromSubscriptionHandler(mock, {
      userId: "users__user1",
      entitlementCode: "PRO",
      subscriptionId: "sub_1",
      endsAt: 5_000_000,
    });

    const grants = mock._listTable("membership_grants");
    expect(grants.length).toBe(1);
    expect(grants[0].endsAt).toBe(5_000_000);
  });

  test("plan archived mid-flight: grant not created, no throw", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock);
    const planId = seedPlan(mock, { status: "active" });

    // Simulate race: the index-level filter sees active, but by the time
    // the handler re-reads, the plan is archived. We emulate by letting the
    // index scan happen first, then flipping the plan before the handler's
    // per-plan re-read. Easiest: seed as active (index scan sees it), then
    // patch to archived inside a wrapper db that flips after query completes.
    //
    // Simpler representative check: directly archive the plan BEFORE the
    // call; the by_status("active") query returns zero matches AND if one
    // sneaks through (race), the re-read skips it. To test the re-read
    // skip path specifically, we shim db.get to return an archived plan.
    const db = mock.db;
    const originalGet = db.get;
    db.get = async (id: string) => {
      const row = await originalGet.call(db, id);
      if (row && id === planId) {
        return { ...row, status: "archived" };
      }
      return row;
    };

    const result = await _grantFromSubscriptionHandler(mock, {
      userId: "users__user1",
      entitlementCode: "PRO",
      subscriptionId: "sub_1",
      endsAt: 2_000_000,
    });

    expect(result.grantedPlanIds).toEqual([]);
    expect(result.skippedArchivedPlanIds).toEqual([planId]);
    expect(mock._listTable("membership_grants").length).toBe(0);
  });

  test("plugin disabled: soft no-op, no writes, no throw", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock, { membershipEnabled: false });
    seedPlan(mock);

    const result = await _grantFromSubscriptionHandler(mock, {
      userId: "users__user1",
      entitlementCode: "PRO",
      subscriptionId: "sub_1",
      endsAt: 2_000_000,
    });

    expect(result).toEqual({ grantedPlanIds: [], skipped: "plugin_disabled" });
    expect(mock._listTable("membership_grants").length).toBe(0);
    expect(mock._listTable("membership_access_log").length).toBe(0);
  });

  test("no matching plan for entitlement code: returns no_matching_plans", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock);
    seedPlan(mock, { linkedSubscriptionCode: "BASIC" });

    const result = await _grantFromSubscriptionHandler(mock, {
      userId: "users__user1",
      entitlementCode: "PRO",
      subscriptionId: "sub_1",
    });

    expect(result).toEqual({ grantedPlanIds: [], reason: "no_matching_plans" });
    expect(mock._listTable("membership_grants").length).toBe(0);
  });
});

describe("_revokeFromSubscriptionHandler", () => {
  async function seedActiveGrant(
    mock: ReturnType<typeof makeMockDb>,
    overrides: Partial<any> = {},
  ) {
    const planId = seedPlan(mock);
    const grantId = mock._seedRow("membership_grants", {
      userId: "users__user1",
      planId,
      sourceType: "subscription",
      sourceRef: "sub_1",
      status: "active",
      startsAt: 1_000,
      createdAt: 1_000,
      updatedAt: 1_000,
      ...overrides,
    });
    return { planId, grantId };
  }

  test("gracePeriodDays=0 on active grant → revoked", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock);
    const { grantId } = await seedActiveGrant(mock);

    const result = await _revokeFromSubscriptionHandler(mock, {
      userId: "users__user1",
      subscriptionId: "sub_1",
      gracePeriodDays: 0,
    });

    expect(result.revokedCount).toBe(1);
    expect(result.movedToGraceCount).toBe(0);

    const grant = await mock.db.get(grantId);
    expect(grant.status).toBe("revoked");
    expect(typeof grant.revokedAt).toBe("number");

    const logs = mock._listTable("membership_access_log");
    expect(logs.length).toBe(1);
    expect(logs[0].reason).toBe("bridge_grant_revoked");
  });

  test("gracePeriodDays=7 on active grant → grace with correct graceEndsAt", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock);
    const { grantId } = await seedActiveGrant(mock);

    const before = Date.now();
    const result = await _revokeFromSubscriptionHandler(mock, {
      userId: "users__user1",
      subscriptionId: "sub_1",
      gracePeriodDays: 7,
    });
    const after = Date.now();

    expect(result.revokedCount).toBe(0);
    expect(result.movedToGraceCount).toBe(1);

    const grant = await mock.db.get(grantId);
    expect(grant.status).toBe("grace");
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(grant.graceEndsAt).toBeGreaterThanOrEqual(before + sevenDaysMs);
    expect(grant.graceEndsAt).toBeLessThanOrEqual(after + sevenDaysMs);

    const logs = mock._listTable("membership_access_log");
    expect(logs.length).toBe(1);
    expect(logs[0].reason).toBe("bridge_grant_moved_to_grace");
  });

  test("already-grace grant → revoked on subsequent call (hard cancel)", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock);
    const { grantId } = await seedActiveGrant(mock, {
      status: "grace",
      graceEndsAt: Date.now() + 86_400_000,
    });

    const result = await _revokeFromSubscriptionHandler(mock, {
      userId: "users__user1",
      subscriptionId: "sub_1",
      gracePeriodDays: 7, // irrelevant — already in grace
    });

    expect(result.revokedCount).toBe(1);
    const grant = await mock.db.get(grantId);
    expect(grant.status).toBe("revoked");
  });

  test("idempotent: revoke twice with gracePeriodDays=0 → no-op on second call", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock);
    const { grantId } = await seedActiveGrant(mock);

    await _revokeFromSubscriptionHandler(mock, {
      userId: "users__user1",
      subscriptionId: "sub_1",
      gracePeriodDays: 0,
    });
    const result2 = await _revokeFromSubscriptionHandler(mock, {
      userId: "users__user1",
      subscriptionId: "sub_1",
      gracePeriodDays: 0,
    });

    expect(result2.revokedCount).toBe(0);
    expect(result2.skipped).toBe("no_grants");

    const grant = await mock.db.get(grantId);
    expect(grant.status).toBe("revoked"); // unchanged
    // Only one log entry from the first call
    expect(mock._listTable("membership_access_log").length).toBe(1);
  });

  test("no matching grant: returns skipped=no_grants, no throw", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock);

    const result = await _revokeFromSubscriptionHandler(mock, {
      userId: "users__user1",
      subscriptionId: "sub_doesnt_exist",
    });

    expect(result.revokedCount).toBe(0);
    expect(result.skipped).toBe("no_grants");
  });

  test("plugin disabled: soft no-op", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock, { membershipEnabled: false });
    await seedActiveGrant(mock);

    const result = await _revokeFromSubscriptionHandler(mock, {
      userId: "users__user1",
      subscriptionId: "sub_1",
    });

    expect(result).toEqual({ revokedCount: 0, skipped: "plugin_disabled" });
    expect(mock._listTable("membership_access_log").length).toBe(0);
  });
});

describe("_moveGrantToGraceHandler", () => {
  async function seedActiveGrant(mock: ReturnType<typeof makeMockDb>) {
    const planId = seedPlan(mock);
    const grantId = mock._seedRow("membership_grants", {
      userId: "users__user1",
      planId,
      sourceType: "subscription",
      sourceRef: "sub_1",
      status: "active",
      startsAt: 1_000,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    return { planId, grantId };
  }

  test("moves active → grace with correct graceEndsAt", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock);
    const { grantId } = await seedActiveGrant(mock);

    const before = Date.now();
    const result = await _moveGrantToGraceHandler(mock, {
      userId: "users__user1",
      subscriptionId: "sub_1",
      gracePeriodDays: 3,
    });
    const after = Date.now();

    expect(result.movedCount).toBe(1);

    const grant = await mock.db.get(grantId);
    expect(grant.status).toBe("grace");
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    expect(grant.graceEndsAt).toBeGreaterThanOrEqual(before + threeDaysMs);
    expect(grant.graceEndsAt).toBeLessThanOrEqual(after + threeDaysMs);

    const logs = mock._listTable("membership_access_log");
    expect(logs.length).toBe(1);
    expect(logs[0].reason).toBe("bridge_grant_moved_to_grace");
  });

  test("idempotent: already-grace grant is not touched (graceEndsAt preserved)", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock);
    const { grantId } = await seedActiveGrant(mock);

    // First call moves active → grace.
    await _moveGrantToGraceHandler(mock, {
      userId: "users__user1",
      subscriptionId: "sub_1",
      gracePeriodDays: 3,
    });
    const firstGraceEnd = (await mock.db.get(grantId)).graceEndsAt;

    // Second call: grant is already in grace — no query on active returns it,
    // so no-op. Even if we re-run, graceEndsAt must NOT be extended.
    const result = await _moveGrantToGraceHandler(mock, {
      userId: "users__user1",
      subscriptionId: "sub_1",
      gracePeriodDays: 3,
    });
    expect(result.movedCount).toBe(0);
    expect(result.skipped).toBe("no_active_grants");

    const grant = await mock.db.get(grantId);
    expect(grant.graceEndsAt).toBe(firstGraceEnd);
    expect(mock._listTable("membership_access_log").length).toBe(1);
  });

  test("uses default gracePeriodDays=3 when omitted", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock);
    const { grantId } = await seedActiveGrant(mock);

    const before = Date.now();
    await _moveGrantToGraceHandler(mock, {
      userId: "users__user1",
      subscriptionId: "sub_1",
    });
    const after = Date.now();

    const grant = await mock.db.get(grantId);
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    expect(grant.graceEndsAt).toBeGreaterThanOrEqual(before + threeDaysMs);
    expect(grant.graceEndsAt).toBeLessThanOrEqual(after + threeDaysMs);
  });

  test("plugin disabled: soft no-op", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock, { membershipEnabled: false });
    await seedActiveGrant(mock);

    const result = await _moveGrantToGraceHandler(mock, {
      userId: "users__user1",
      subscriptionId: "sub_1",
    });

    expect(result).toEqual({ movedCount: 0, skipped: "plugin_disabled" });
    expect(mock._listTable("membership_access_log").length).toBe(0);
  });

  test("no active grants: returns skipped=no_active_grants, no throw", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock);

    const result = await _moveGrantToGraceHandler(mock, {
      userId: "users__user1",
      subscriptionId: "sub_1",
    });

    expect(result.movedCount).toBe(0);
    expect(result.skipped).toBe("no_active_grants");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// logAccessChecks setting
// ═══════════════════════════════════════════════════════════════════════════

describe("bridge access log respects logAccessChecks setting", () => {
  test("grant creation does not log when logAccessChecks=false", async () => {
    const mock = makeMockDb();
    seedMembershipSettings(mock, { logAccessChecks: false });
    seedPlan(mock);

    await _grantFromSubscriptionHandler(mock, {
      userId: "users__user1",
      entitlementCode: "PRO",
      subscriptionId: "sub_1",
    });

    expect(mock._listTable("membership_grants").length).toBe(1); // grant still created
    expect(mock._listTable("membership_access_log").length).toBe(0); // just no log
  });
});
