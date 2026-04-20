import { describe, expect, test } from "bun:test";

import {
  buildLegacyReturnHistoryEntries,
  buildLegacyReturnHistoryInserts,
  buildLegacyReturnItemInserts,
  buildMissingReturnTemplateInserts,
  getReturnTemplateDefaults,
  runBackfillLegacyReturns,
} from "../migrations";
import { EMAIL_TEMPLATES } from "../../helpers/email";

type TableStore = Record<string, any[]>;

function createFakeCtx(initialTables: TableStore) {
  const tables: TableStore = Object.fromEntries(
    Object.entries(initialTables).map(([table, rows]) => [table, [...rows]]),
  );

  const matchesFilter = (row: any, filter: { field: string; value: any } | null) => {
    if (!filter) return true;
    return row[filter.field]?.toString() === filter.value?.toString();
  };

  return {
    tables,
    db: {
      query(table: string) {
        let filter: { field: string; value: any } | null = null;
        return {
          withIndex(_indexName: string, builder: any) {
            const eqCall = builder({
              eq(field: string, value: any) {
                return { field, value };
              },
            });
            filter = eqCall;
            return this;
          },
          async collect() {
            return (tables[table] ?? []).filter((row) => matchesFilter(row, filter));
          },
          async unique() {
            return (tables[table] ?? []).find((row) => matchesFilter(row, filter)) ?? null;
          },
        };
      },
      async get(id: string) {
        for (const rows of Object.values(tables)) {
          const row = rows.find((candidate) => candidate._id?.toString() === id?.toString());
          if (row) return row;
        }
        return null;
      },
      async insert(table: string, doc: any) {
        tables[table] ??= [];
        const nextId = doc._id ?? `${table}_${tables[table].length + 1}`;
        tables[table].push({ _id: nextId, ...doc });
        return nextId;
      },
    },
  };
}

describe("commerce returns migrations helpers", () => {
  test("returns only return-related email template defaults", () => {
    const templates = getReturnTemplateDefaults();
    const slugs = templates.map((template) => template.slug).sort();

    expect(slugs).toEqual(
      [
        EMAIL_TEMPLATES.RETURN_APPROVED,
        EMAIL_TEMPLATES.RETURN_LABEL_ADDED,
        EMAIL_TEMPLATES.RETURN_REFUND_FAILED,
        EMAIL_TEMPLATES.RETURN_REFUNDED,
        EMAIL_TEMPLATES.RETURN_REJECTED,
        EMAIL_TEMPLATES.RETURN_REQUESTED_ADMIN,
      ].sort(),
    );
  });

  test("builds template inserts only for missing return templates", () => {
    const inserts = buildMissingReturnTemplateInserts(
      [EMAIL_TEMPLATES.RETURN_APPROVED, EMAIL_TEMPLATES.RETURN_REJECTED],
      123,
    );

    expect(inserts.map((template) => template.slug).sort()).toEqual(
      [
        EMAIL_TEMPLATES.RETURN_REQUESTED_ADMIN,
        EMAIL_TEMPLATES.RETURN_LABEL_ADDED,
        EMAIL_TEMPLATES.RETURN_REFUNDED,
        EMAIL_TEMPLATES.RETURN_REFUND_FAILED,
      ].sort(),
    );
    expect(inserts.every((template) => template.createdAt === 123)).toBe(true);
    expect(inserts.every((template) => template.updatedAt === 123)).toBe(true);
  });

  test("builds ordered history entries for a fully processed legacy return", () => {
    const entries = buildLegacyReturnHistoryEntries({
      status: "completed",
      createdAt: 100,
      updatedAt: 800,
      requestedAt: 100,
      approvedAt: 200,
      receivedAt: 300,
      refundPendingAt: 400,
      refundedAt: 500,
      completedAt: 600,
      reasonDetails: "Outer packaging damaged",
      notes: "Operator note",
      trackingNumber: "TRACK123",
      refundMethod: "original_payment",
      returnShippingLabel: "https://example.com/label.pdf",
    });

    expect(entries).toEqual([
      {
        eventType: "requested",
        fromStatus: undefined,
        toStatus: "requested",
        createdAt: 100,
        note: "Outer packaging damaged",
      },
      {
        eventType: "approved",
        fromStatus: "requested",
        toStatus: "approved",
        createdAt: 200,
        note: "Operator note",
      },
      {
        eventType: "received",
        fromStatus: "approved",
        toStatus: "received",
        createdAt: 300,
        note: "TRACK123",
      },
      {
        eventType: "refund_pending",
        fromStatus: "received",
        toStatus: "refund_pending",
        createdAt: 400,
        note: "original_payment",
      },
      {
        eventType: "refund_succeeded",
        fromStatus: "refund_pending",
        toStatus: "refunded",
        createdAt: 500,
        note: "original_payment",
      },
      {
        eventType: "completed",
        fromStatus: "refunded",
        toStatus: "completed",
        createdAt: 600,
        note: "Operator note",
      },
      {
        eventType: "label_added",
        fromStatus: "completed",
        toStatus: "completed",
        createdAt: 800,
        note: "TRACK123",
      },
    ]);
  });

  test("builds rejection history without inventing approval or refund stages", () => {
    const entries = buildLegacyReturnHistoryEntries({
      status: "rejected",
      createdAt: 100,
      updatedAt: 250,
      rejectedAt: 250,
      notes: "Outside the return window",
    });

    expect(entries).toEqual([
      {
        eventType: "requested",
        fromStatus: undefined,
        toStatus: "requested",
        createdAt: 100,
        note: undefined,
      },
      {
        eventType: "rejected",
        fromStatus: "requested",
        toStatus: "rejected",
        createdAt: 250,
        note: "Outside the return window",
      },
    ]);
  });

  test("builds concrete history inserts with actor attribution", () => {
    const inserts = buildLegacyReturnHistoryInserts({
      _id: "ret_1",
      processedBy: "user_1",
      status: "approved",
      createdAt: 100,
      updatedAt: 200,
      approvedAt: 150,
      notes: "Approved with partial refund",
    });

    expect(inserts).toEqual([
      {
        returnRequestId: "ret_1",
        actorUserId: "user_1",
        actorType: "admin",
        eventType: "requested",
        fromStatus: undefined,
        toStatus: "requested",
        note: undefined,
        createdAt: 100,
      },
      {
        returnRequestId: "ret_1",
        actorUserId: "user_1",
        actorType: "admin",
        eventType: "approved",
        fromStatus: "requested",
        toStatus: "approved",
        note: "Approved with partial refund",
        createdAt: 150,
      },
    ]);
  });

  test("builds item inserts only when referenced order items still exist", () => {
    const inserts = buildLegacyReturnItemInserts(
      {
        _id: "ret_2",
        createdAt: 100,
        updatedAt: 120,
        items: [
          { orderItemId: "item_1", quantity: 2, reason: "damaged" },
          { orderItemId: "item_missing", quantity: 1, reason: "wrong_size" },
        ],
      },
      {
        item_1: {
          _id: "item_1",
          productId: "prod_1",
          variantId: "var_1",
        },
      },
    );

    expect(inserts).toEqual([
      {
        returnRequestId: "ret_2",
        orderItemId: "item_1",
        productId: "prod_1",
        variantId: "var_1",
        quantityRequested: 2,
        quantityApproved: 2,
        quantityReceived: 2,
        quantityRestocked: 0,
        reasonText: "damaged",
        createdAt: 100,
        updatedAt: 120,
      },
    ]);
  });

  test("runs backfill against fake DB state and is idempotent", async () => {
    const ctx = createFakeCtx({
      emailTemplates: [
        { _id: "template_existing", slug: EMAIL_TEMPLATES.RETURN_APPROVED },
      ],
      commerce_return_requests: [
        {
          _id: "ret_1",
          status: "refunded",
          returnNumber: "RMA-1",
          processedBy: "user_1",
          createdAt: 100,
          updatedAt: 500,
          approvedAt: 200,
          receivedAt: 300,
          refundPendingAt: 400,
          refundedAt: 500,
          refundMethod: "original_payment",
          items: [{ orderItemId: "item_1", quantity: 2, reason: "damaged" }],
        },
        {
          _id: "ret_existing",
          status: "requested",
          returnNumber: "RMA-2",
          createdAt: 100,
          updatedAt: 100,
          items: [{ orderItemId: "item_2", quantity: 1, reason: "wrong_size" }],
        },
      ],
      commerce_order_items: [
        {
          _id: "item_1",
          productId: "prod_1",
          variantId: "var_1",
        },
        {
          _id: "item_2",
          productId: "prod_2",
        },
      ],
      commerce_return_items: [
        {
          _id: "existing_item",
          returnRequestId: "ret_existing",
          orderItemId: "item_2",
          productId: "prod_2",
        },
      ],
      commerce_return_history: [
        {
          _id: "existing_history",
          returnRequestId: "ret_existing",
          eventType: "requested",
        },
      ],
    });

    const firstRun = await runBackfillLegacyReturns(ctx, 1000);

    expect(firstRun).toEqual({
      totalReturns: 2,
      createdTemplates: 5,
      createdReturnItems: 1,
      createdHistoryEntries: 5,
    });
    expect(ctx.tables.emailTemplates).toHaveLength(6);
    expect(ctx.tables.commerce_return_items).toContainEqual({
      _id: "commerce_return_items_2",
      returnRequestId: "ret_1",
      orderItemId: "item_1",
      productId: "prod_1",
      variantId: "var_1",
      quantityRequested: 2,
      quantityApproved: 2,
      quantityReceived: 2,
      quantityRestocked: 0,
      reasonText: "damaged",
      createdAt: 100,
      updatedAt: 500,
    });
    expect(
      ctx.tables.commerce_return_history
        .filter((entry) => entry.returnRequestId === "ret_1")
        .map((entry) => entry.eventType),
    ).toEqual([
      "requested",
      "approved",
      "received",
      "refund_pending",
      "refund_succeeded",
    ]);

    const secondRun = await runBackfillLegacyReturns(ctx, 2000);

    expect(secondRun).toEqual({
      totalReturns: 2,
      createdTemplates: 0,
      createdReturnItems: 0,
      createdHistoryEntries: 0,
    });
  });
});
