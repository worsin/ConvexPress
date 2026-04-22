/**
 * Membership benefits — display query helpers tests.
 *
 * Tests the shared helper functions from membership/helpers.ts:
 *   - getDisplayableBenefitsForPlanHelper
 *   - getDisplayableBenefitsForCodesHelper
 *
 * These helpers back the public Convex queries `getDisplayableBenefitsForPlan`
 * and `getDisplayableBenefitsForEntitlementCodes`, and are also called directly
 * by `listOffersForPricing` in the commerce subscriptions module.
 *
 * Uses the same bun:test + mock ctx pattern as bridge.test.ts. No Vite/
 * convex-test dependencies.
 *
 * Run with: bun test convex/membership/__tests__/benefits.test.ts
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { beforeEach, describe, expect, test } from "bun:test";

import {
  getDisplayableBenefitsForPlanHelper,
  getDisplayableBenefitsForCodesHelper,
} from "../helpers";

// ═══════════════════════════════════════════════════════════════════════════
// Minimal mock ctx.db
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Thin mock of ctx.db that supports:
 *   - query(table).withIndex(name, builder).collect()
 *   - query(table).collect()
 *
 * Sufficient for the benefit helpers which only read via by_plan index and
 * full-table scans on membership_plans.
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

  function buildQuery(tableName: string) {
    const rows = Object.values(ensureTable(tableName));
    const state = { filters: [] as Array<(row: any) => boolean> };

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
      collect: async () => {
        if (state.filters.length === 0) return rows.slice();
        return rows.filter((row) => state.filters.every((f) => f(row)));
      },
    };
    return api;
  }

  const db = {
    query(tableName: string) {
      return buildQuery(tableName);
    },
  };

  /** Seed a row — auto-generates _id if not provided. */
  function seedRow(tableName: string, doc: any): string {
    const id = doc._id ?? makeId(tableName);
    ensureTable(tableName)[id] = { ...doc, _id: id };
    return id;
  }

  return { db, _seedRow: seedRow };
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers for seeding test data
// ═══════════════════════════════════════════════════════════════════════════

/** Seed a plugin settings row that controls isPluginEnabled("membership"). */
function seedMembershipPlugin(
  mock: ReturnType<typeof makeMockDb>,
  enabled: boolean,
) {
  mock._seedRow("settings", {
    section: "plugins",
    values: { membershipEnabled: enabled },
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
): string {
  return mock._seedRow("membership_plans", {
    title: "Test Plan",
    slug: "test-plan",
    status: "active",
    grantMode: "subscription",
    linkedSubscriptionCode: "PRO",
    priority: 10,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  });
}

function seedBenefit(
  mock: ReturnType<typeof makeMockDb>,
  planId: string,
  over: Partial<{
    _id: string;
    label: string;
    description: string;
    displayAsFeature: boolean;
  }> = {},
): string {
  return mock._seedRow("membership_plan_benefits", {
    planId,
    code: "benefit_code",
    label: "A benefit",
    createdAt: 0,
    updatedAt: 0,
    ...over,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// getDisplayableBenefitsForPlanHelper
// ═══════════════════════════════════════════════════════════════════════════

describe("getDisplayableBenefitsForPlanHelper", () => {
  test("returns benefits where displayAsFeature is explicitly true", async () => {
    const mock = makeMockDb();
    const planId = seedPlan(mock);
    const benefitId = seedBenefit(mock, planId, {
      label: "Explicit true",
      displayAsFeature: true,
    });

    const result = await getDisplayableBenefitsForPlanHelper(mock, planId);

    expect(result.length).toBe(1);
    expect(result[0]._id).toBe(benefitId);
    expect(result[0].label).toBe("Explicit true");
    expect(result[0].sourcePlanId).toBe(planId);
  });

  test("treats displayAsFeature === undefined as TRUE (includes the benefit)", async () => {
    const mock = makeMockDb();
    const planId = seedPlan(mock);
    const benefitId = seedBenefit(mock, planId, {
      label: "Implicit displayable",
      // displayAsFeature intentionally omitted
    });

    const result = await getDisplayableBenefitsForPlanHelper(mock, planId);

    expect(result.length).toBe(1);
    expect(result[0]._id).toBe(benefitId);
  });

  test("filters out benefits where displayAsFeature === false", async () => {
    const mock = makeMockDb();
    const planId = seedPlan(mock);
    seedBenefit(mock, planId, {
      label: "Hidden benefit",
      displayAsFeature: false,
    });

    const result = await getDisplayableBenefitsForPlanHelper(mock, planId);

    expect(result.length).toBe(0);
  });

  test("mixed benefits: only includes displayable ones", async () => {
    const mock = makeMockDb();
    const planId = seedPlan(mock);
    seedBenefit(mock, planId, { label: "Visible", displayAsFeature: true });
    seedBenefit(mock, planId, { label: "Hidden", displayAsFeature: false });
    seedBenefit(mock, planId, { label: "Implicit" }); // no displayAsFeature → included

    const result = await getDisplayableBenefitsForPlanHelper(mock, planId);

    expect(result.length).toBe(2);
    const labels = result.map((b) => b.label).sort();
    expect(labels).toEqual(["Implicit", "Visible"]);
  });

  test("includes description when present", async () => {
    const mock = makeMockDb();
    const planId = seedPlan(mock);
    seedBenefit(mock, planId, {
      label: "With desc",
      description: "A helpful description",
    });

    const result = await getDisplayableBenefitsForPlanHelper(mock, planId);

    expect(result[0].description).toBe("A helpful description");
  });

  test("omits description key when description is absent", async () => {
    const mock = makeMockDb();
    const planId = seedPlan(mock);
    seedBenefit(mock, planId, { label: "No desc" });

    const result = await getDisplayableBenefitsForPlanHelper(mock, planId);

    expect("description" in result[0]).toBe(false);
  });

  test("returns empty array for a plan with no benefits", async () => {
    const mock = makeMockDb();
    const planId = seedPlan(mock);
    // no benefits seeded

    const result = await getDisplayableBenefitsForPlanHelper(mock, planId);

    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getDisplayableBenefitsForCodesHelper
// ═══════════════════════════════════════════════════════════════════════════

describe("getDisplayableBenefitsForCodesHelper", () => {
  test("returns empty array for empty codes input", async () => {
    const mock = makeMockDb();

    const result = await getDisplayableBenefitsForCodesHelper(mock, []);

    expect(result).toEqual([]);
  });

  test("returns benefits for a single matching active plan", async () => {
    const mock = makeMockDb();
    const planId = seedPlan(mock, { linkedSubscriptionCode: "PRO" });
    const benefitId = seedBenefit(mock, planId, { label: "Pro feature" });

    const result = await getDisplayableBenefitsForCodesHelper(mock, ["PRO"]);

    expect(result.length).toBe(1);
    expect(result[0]._id).toBe(benefitId);
    expect(result[0].sourcePlanId).toBe(planId);
  });

  test("skips archived plans (status !== 'active')", async () => {
    const mock = makeMockDb();
    const archivedPlanId = seedPlan(mock, {
      status: "archived",
      linkedSubscriptionCode: "PRO",
    });
    seedBenefit(mock, archivedPlanId, { label: "Archived benefit" });

    const result = await getDisplayableBenefitsForCodesHelper(mock, ["PRO"]);

    expect(result.length).toBe(0);
  });

  test("dedupes by label — first occurrence wins", async () => {
    const mock = makeMockDb();
    const plan1 = seedPlan(mock, {
      linkedSubscriptionCode: "PRO",
      priority: 10,
    });
    const plan2 = seedPlan(mock, {
      linkedSubscriptionCode: "PRO",
      priority: 20,
    });

    const benefit1Id = seedBenefit(mock, plan1, {
      label: "Shared label",
      description: "From plan 1",
    });
    seedBenefit(mock, plan2, {
      label: "Shared label",
      description: "From plan 2",
    });

    const result = await getDisplayableBenefitsForCodesHelper(mock, ["PRO"]);

    // Only one entry per label
    expect(result.length).toBe(1);
    expect(result[0].label).toBe("Shared label");
    // First occurrence's description preserved
    expect(result[0].description).toBe("From plan 1");
    expect(result[0]._id).toBe(benefit1Id);
  });

  test("merges benefits from multiple codes", async () => {
    const mock = makeMockDb();
    const proPlan = seedPlan(mock, { linkedSubscriptionCode: "PRO" });
    const basicPlan = seedPlan(mock, { linkedSubscriptionCode: "BASIC" });
    seedBenefit(mock, proPlan, { label: "Pro feature" });
    seedBenefit(mock, basicPlan, { label: "Basic feature" });

    const result = await getDisplayableBenefitsForCodesHelper(mock, [
      "PRO",
      "BASIC",
    ]);

    expect(result.length).toBe(2);
    const labels = result.map((b) => b.label).sort();
    expect(labels).toEqual(["Basic feature", "Pro feature"]);
  });

  test("preserves input code order for deterministic deduplication", async () => {
    const mock = makeMockDb();
    // BASIC code listed first in input — its benefit should win the dedup
    const basicPlan = seedPlan(mock, { linkedSubscriptionCode: "BASIC" });
    const proPlan = seedPlan(mock, { linkedSubscriptionCode: "PRO" });
    const basicBenefitId = seedBenefit(mock, basicPlan, {
      label: "Shared label",
      description: "Basic desc",
    });
    seedBenefit(mock, proPlan, {
      label: "Shared label",
      description: "Pro desc",
    });

    const result = await getDisplayableBenefitsForCodesHelper(mock, [
      "BASIC",
      "PRO",
    ]);

    expect(result.length).toBe(1);
    expect(result[0]._id).toBe(basicBenefitId);
    expect(result[0].description).toBe("Basic desc");
  });

  test("skips benefits with displayAsFeature === false even when plan matches", async () => {
    const mock = makeMockDb();
    const planId = seedPlan(mock, { linkedSubscriptionCode: "PRO" });
    seedBenefit(mock, planId, {
      label: "Hidden",
      displayAsFeature: false,
    });
    const visibleId = seedBenefit(mock, planId, {
      label: "Visible",
      displayAsFeature: true,
    });

    const result = await getDisplayableBenefitsForCodesHelper(mock, ["PRO"]);

    expect(result.length).toBe(1);
    expect(result[0]._id).toBe(visibleId);
  });

  test("returns empty array when no plans match the codes", async () => {
    const mock = makeMockDb();
    seedPlan(mock, { linkedSubscriptionCode: "OTHER" });

    const result = await getDisplayableBenefitsForCodesHelper(mock, ["PRO"]);

    expect(result.length).toBe(0);
  });

  test("handles multiple plans per code, deduping across all", async () => {
    const mock = makeMockDb();
    const plan1 = seedPlan(mock, { linkedSubscriptionCode: "ENTERPRISE" });
    const plan2 = seedPlan(mock, { linkedSubscriptionCode: "ENTERPRISE" });
    seedBenefit(mock, plan1, { label: "Shared" });
    seedBenefit(mock, plan2, { label: "Shared" }); // duplicate label
    seedBenefit(mock, plan2, { label: "Unique to plan2" });

    const result = await getDisplayableBenefitsForCodesHelper(mock, [
      "ENTERPRISE",
    ]);

    expect(result.length).toBe(2);
    const labels = result.map((b) => b.label).sort();
    expect(labels).toEqual(["Shared", "Unique to plan2"]);
  });
});
