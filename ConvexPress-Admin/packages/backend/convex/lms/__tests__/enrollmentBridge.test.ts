// @ts-expect-error Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  syncMembershipPlanCourseEnrollmentsHandler,
  syncPurchasedCourseEnrollmentsHandler,
} from "../enrollment/internals";

type Row = { _id: string; [key: string]: any };
type Tables = Record<string, Row[]>;

const now = 1_800_000_000_000;

function createQuery(rows: Row[]) {
  const filters: Array<{ field: string; value: unknown }> = [];
  const filtered = () =>
    rows.filter((row) =>
      filters.every(({ field, value }) => String(row[field]) === String(value)),
    );
  const query = {
    withIndex: (_name: string, collectFilters: (q: any) => unknown) => {
      const builder = {
        eq: (field: string, value: unknown) => {
          filters.push({ field, value });
          return builder;
        },
      };
      collectFilters(builder);
      return query;
    },
    collect: async () => filtered(),
    first: async () => (await query.collect())[0] ?? null,
    take: async (count: number) => filtered().slice(0, count),
    unique: async () => (await query.collect())[0] ?? null,
  };
  return query;
}

function createCtx(tables: Tables) {
  return {
    db: {
      get: async (id: string) => {
        for (const rows of Object.values(tables)) {
          const row = rows.find((candidate) => candidate._id === id);
          if (row) return row;
        }
        return null;
      },
      insert: async (table: string, doc: Record<string, unknown>) => {
        const rows = (tables[table] ??= []);
        const newId = `${table}_${rows.length + 1}`;
        rows.push({ _id: newId, ...doc });
        return newId;
      },
      patch: async (id: string, patch: Record<string, unknown>) => {
        for (const rows of Object.values(tables)) {
          const row = rows.find((candidate) => candidate._id === id);
          if (row) {
            Object.assign(row, patch);
            return;
          }
        }
        throw new Error(`Missing row ${id}`);
      },
      query: (table: string) => createQuery(tables[table] ?? []),
    },
  } as any;
}

function baseTables(overrides: Partial<Tables> = {}): Tables {
  return {
    settings: [
      {
        _id: "settings_plugins",
        section: "plugins",
        values: { lmsEnabled: true, membershipEnabled: true, commerceDigitalEnabled: true },
      },
    ],
    lms_courses: [
      {
        _id: "course_members",
        title: "Members course",
        slug: "members-course",
        accessMode: "members",
        status: "published",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: "course_purchase",
        title: "Purchase course",
        slug: "purchase-course",
        accessMode: "buy",
        status: "published",
        createdAt: now,
        updatedAt: now,
      },
    ],
    membership_restriction_rules: [
      {
        _id: "rule_members",
        resourceType: "course",
        resourceIdOrKey: "course_members",
        ruleMode: "allow_only",
        planIds: ["plan_gold"],
        teaserMode: "excerpt",
        loginRequired: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    membership_grants: [],
    lms_enrollments: [],
    commerce_orders: [
      {
        _id: "order_course",
        userId: "user_learner",
        status: "paid",
        paymentStatus: "paid",
        createdAt: now,
        updatedAt: now,
      },
    ],
    commerce_order_items: [
      {
        _id: "order_item_course",
        orderId: "order_course",
        productId: "product_course",
        quantity: 1,
        metadata: { lmsCourseId: "course_purchase" },
        createdAt: now,
      },
    ],
    commerce_products: [
      {
        _id: "product_course",
        title: "Course product",
        rawSourceMeta: "{}",
        createdAt: now,
        updatedAt: now,
      },
    ],
    events: [],
    eventListeners: [],
    eventListenerExecutions: [],
    ...overrides,
  };
}

describe("LMS enrollment bridge", () => {
  test("membership grants create LMS enrollment rows for matching course rules", async () => {
    const tables = baseTables();
    const result = await syncMembershipPlanCourseEnrollmentsHandler(createCtx(tables), {
      userId: "user_learner",
      planId: "plan_gold",
      status: "active",
      sourceRef: "grant_manual",
    });

    expect(result.created).toBe(1);
    expect(tables.lms_enrollments[0]).toMatchObject({
      userId: "user_learner",
      courseId: "course_members",
      source: "membership_plan",
      membershipPlanId: "plan_gold",
      sourceRef: "grant_manual",
      status: "active",
    });
  });

  test("membership and purchase grants respect course seat limits", async () => {
    const tables = baseTables({
      lms_courses: [
        {
          _id: "course_members",
          title: "Members course",
          slug: "members-course",
          accessMode: "members",
          status: "published",
          seatLimit: 1,
          createdAt: now,
          updatedAt: now,
        },
        {
          _id: "course_purchase",
          title: "Purchase course",
          slug: "purchase-course",
          accessMode: "buy",
          status: "published",
          seatLimit: 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
      lms_enrollments: [
        {
          _id: "enrollment_members_full",
          userId: "user_other",
          courseId: "course_members",
          source: "manual",
          enrolledAt: now,
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
        {
          _id: "enrollment_purchase_full",
          userId: "user_other",
          courseId: "course_purchase",
          source: "manual",
          enrolledAt: now,
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const membership = await syncMembershipPlanCourseEnrollmentsHandler(createCtx(tables), {
      userId: "user_learner",
      planId: "plan_gold",
      status: "active",
      sourceRef: "grant_manual",
    });
    const purchase = await syncPurchasedCourseEnrollmentsHandler(createCtx(tables), {
      orderId: "order_course",
      action: "grant",
    });

    expect(membership.skippedSeatLimit).toBe(1);
    expect(purchase.skippedSeatLimit).toBe(1);
    expect(
      tables.lms_enrollments.some((row) => row.userId === "user_learner"),
    ).toBe(false);
  });

  test("membership revocation keeps enrollment when another required plan is active", async () => {
    const tables = baseTables({
      membership_restriction_rules: [
        {
          _id: "rule_members",
          resourceType: "course",
          resourceIdOrKey: "course_members",
          ruleMode: "allow_only",
          planIds: ["plan_gold", "plan_plus"],
          teaserMode: "excerpt",
          loginRequired: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      membership_grants: [
        {
          _id: "grant_plus",
          userId: "user_learner",
          planId: "plan_plus",
          sourceType: "manual",
          status: "active",
          startsAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
      lms_enrollments: [
        {
          _id: "enrollment_members",
          userId: "user_learner",
          courseId: "course_members",
          source: "membership_plan",
          membershipPlanId: "plan_gold",
          enrolledAt: now,
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const result = await syncMembershipPlanCourseEnrollmentsHandler(createCtx(tables), {
      userId: "user_learner",
      planId: "plan_gold",
      status: "revoked",
    });

    expect(result.keptByAlternateGrant).toBe(1);
    expect(tables.lms_enrollments[0]).toMatchObject({
      status: "active",
      membershipPlanId: "plan_plus",
    });
  });

  test("purchase order metadata grants and revokes LMS enrollments", async () => {
    const tables = baseTables();
    const ctx = createCtx(tables);
    const granted = await syncPurchasedCourseEnrollmentsHandler(ctx, {
      orderId: "order_course",
      action: "grant",
    });

    expect(granted.created).toBe(1);
    expect(granted.courseIds).toEqual(["course_purchase"]);
    expect(tables.lms_enrollments[0]).toMatchObject({
      userId: "user_learner",
      courseId: "course_purchase",
      source: "purchase",
      sourceRef: "order_course",
      status: "active",
    });

    const revoked = await syncPurchasedCourseEnrollmentsHandler(ctx, {
      orderId: "order_course",
      action: "revoke",
    });

    expect(revoked.revoked).toBe(1);
    expect(tables.lms_enrollments[0]).toMatchObject({ status: "revoked" });
  });
});
