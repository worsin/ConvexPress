import { describe, expect, test } from "bun:test";

import {
  fulfillOrderDigitalEntitlementsHandler,
  resolveDigitalPolicy,
} from "../fulfillment";

function createCtx(seed: Record<string, any[]>) {
  const tables: Record<string, any[]> = Object.fromEntries(
    Object.entries(seed).map(([table, rows]) => [
      table,
      rows.map((row) => ({ ...row })),
    ]),
  );

  const findById = (id: string) => {
    for (const rows of Object.values(tables)) {
      const found = rows.find((row) => row._id === id);
      if (found) return found;
    }
    return null;
  };

  const makeQuery = (table: string) => {
    const constraints: Array<{ field: string; value: any }> = [];
    const apply = () =>
      (tables[table] ?? []).filter((row) =>
        constraints.every(({ field, value }) => row[field] === value),
      );
    const query: any = {
      withIndex(_name: string, cb: any) {
        const q: any = {
          eq(field: string, value: any) {
            constraints.push({ field, value });
            return q;
          },
        };
        cb(q);
        return query;
      },
      collect() {
        return Promise.resolve(apply());
      },
      first() {
        return Promise.resolve(apply()[0] ?? null);
      },
      unique() {
        return Promise.resolve(apply()[0] ?? null);
      },
    };
    return query;
  };

  return {
    tables,
    db: {
      get(id: string) {
        return Promise.resolve(findById(id));
      },
      query: makeQuery,
      insert(table: string, doc: any) {
        tables[table] ??= [];
        const id = `${table}_${tables[table].length + 1}`;
        tables[table].push({ _id: id, ...doc });
        return Promise.resolve(id);
      },
      patch(id: string, patch: any) {
        const row = findById(id);
        if (!row) throw new Error(`Missing row ${id}`);
        Object.assign(row, patch);
        return Promise.resolve();
      },
    },
  };
}

function baseSeed(overrides: Record<string, any[]> = {}) {
  return {
    settings: [
      {
        _id: "settings_plugins",
        section: "plugins",
        values: {
          commerceEnabled: true,
          commerceDigitalEnabled: true,
        },
      },
    ],
    commerce_products: [
      {
        _id: "product_software",
        title: "Studio App",
        isDownloadable: true,
        requiresLicense: true,
        digitalDeliveryMode: "download_and_license",
        downloadLimit: 3,
        downloadExpiryDays: 7,
      },
    ],
    commerce_product_variants: [],
    commerce_digital_files: [
      {
        _id: "file_mac",
        productId: "product_software",
        name: "Studio App macOS",
        fileName: "studio-app.dmg",
        isLatest: true,
        sortOrder: 0,
      },
    ],
    commerce_orders: [
      {
        _id: "order_1",
        orderNumber: "CP-1",
        userId: "user_1",
        status: "processing",
        paymentStatus: "paid",
      },
    ],
    commerce_order_items: [
      {
        _id: "item_1",
        orderId: "order_1",
        productId: "product_software",
        quantity: 2,
        productTitle: "Studio App",
      },
    ],
    commerce_download_tokens: [],
    commerce_license_keys: [
      {
        _id: "key_1",
        productId: "product_software",
        licenseKey: "AAAA-BBBB-CCCC-DDDD",
        status: "available",
      },
      {
        _id: "key_2",
        productId: "product_software",
        licenseKey: "EEEE-FFFF-GGGG-HHHH",
        status: "available",
      },
    ],
    commerce_order_history: [],
    ...overrides,
  };
}

describe("resolveDigitalPolicy", () => {
  test("treats software products as download and license when configured", () => {
    const policy = resolveDigitalPolicy({
      isDownloadable: true,
      requiresLicense: true,
      digitalDeliveryMode: "download_and_license",
      downloadLimit: 5,
    });

    expect(policy.downloadsRequired).toBe(true);
    expect(policy.licensesRequired).toBe(true);
    expect(policy.downloadLimit).toBe(5);
  });

  test("variant policy overrides product policy", () => {
    const policy = resolveDigitalPolicy(
      { isDownloadable: true, downloadLimit: 5 },
      { downloadLimit: 1, requiresLicense: true },
    );

    expect(policy.downloadLimit).toBe(1);
    expect(policy.licensesRequired).toBe(true);
  });
});

describe("fulfillOrderDigitalEntitlementsHandler", () => {
  test("creates download token and one license key per quantity unit", async () => {
    const ctx = createCtx(baseSeed());

    const result = await fulfillOrderDigitalEntitlementsHandler(ctx, {
      orderId: "order_1",
      reason: "test",
    });

    expect(result.status).toBe("completed");
    expect(ctx.tables.commerce_download_tokens).toHaveLength(1);
    expect(ctx.tables.commerce_download_tokens[0].maxDownloads).toBe(3);
    expect(typeof ctx.tables.commerce_download_tokens[0].expiresAt).toBe("number");
    expect(
      ctx.tables.commerce_license_keys.filter((key) => key.status === "assigned"),
    ).toHaveLength(2);
    expect(ctx.tables.commerce_orders[0].digitalFulfillmentStatus).toBe(
      "completed",
    );
  });

  test("is idempotent for repeated paid-order fulfillment", async () => {
    const ctx = createCtx(baseSeed());

    await fulfillOrderDigitalEntitlementsHandler(ctx, {
      orderId: "order_1",
      reason: "first",
    });
    await fulfillOrderDigitalEntitlementsHandler(ctx, {
      orderId: "order_1",
      reason: "second",
    });

    expect(ctx.tables.commerce_download_tokens).toHaveLength(1);
    expect(
      ctx.tables.commerce_license_keys.filter((key) => key.status === "assigned"),
    ).toHaveLength(2);
  });

  test("marks order needs review when license inventory is exhausted", async () => {
    const ctx = createCtx(
      baseSeed({
        commerce_license_keys: [],
      }),
    );

    const result = await fulfillOrderDigitalEntitlementsHandler(ctx, {
      orderId: "order_1",
      reason: "test",
    });

    expect(result.status).toBe("partial");
    expect(ctx.tables.commerce_download_tokens).toHaveLength(1);
    expect(ctx.tables.commerce_orders[0].digitalFulfillmentStatus).toBe(
      "partial",
    );
    expect(ctx.tables.commerce_orders[0].digitalFulfillmentError).toContain(
      "No available license keys",
    );
  });
});
