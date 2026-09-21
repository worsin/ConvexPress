import { expect, test } from "bun:test";
import { api, internal } from "../../_generated/api";
import { digitalFixture } from "./fixtures.test";
import { readDownloadEntitlement } from "../downloadEntitlement";
import { RequestReadLedger } from "../../helpers/requestReadLedger";

const token = "PRIVATE_DOWNLOAD_TOKEN";
const q = api.commerceDigital.queries;
const m = internal.commerceDigital.mutations;
const im = internal.commerceDigital.mutations;

test("a copied account-bound download token cannot be used by guests or another account", async () => {
  const { t, operator, ids } = await digitalFixture();
  for (const caller of [t, operator]) {
    expect(await caller.query(q.validateDownloadToken, { token })).toMatchObject({ valid: false });
    await expect(caller.mutation(m.recordDownload, { token })).rejects.toThrow();
    expect(await caller.mutation(im.recordDownloadInternal, { token })).toMatchObject({ success: false });
  }
  expect((await t.run(ctx => ctx.db.get(ids.token)))?.downloadCount).toBe(0);
});

test.each(["cancelled", "refunded", "failed"] as const)("%s orders cannot download even when token flags and payment still say active/paid", async status => {
  const { t, customer, ids } = await digitalFixture();
  await t.run(ctx => ctx.db.patch(ids.order, { status }));
  expect(await customer.query(q.validateDownloadToken, { token })).toMatchObject({ valid: false });
  await expect(customer.mutation(m.recordDownload, { token })).rejects.toThrow();
  expect(await customer.mutation(im.recordDownloadInternal, { token })).toMatchObject({ success: false });
  expect((await t.run(ctx => ctx.db.get(ids.token)))?.downloadCount).toBe(0);
});

test.each(["pending", "failed", "refunded", "partially_paid"])("a completed order with payment status %s is not a paid entitlement", async paymentStatus => {
  const { t, customer, ids } = await digitalFixture();
  await t.run(ctx => ctx.db.patch(ids.order, { paymentStatus }));
  expect(await customer.query(q.validateDownloadToken, { token })).toMatchObject({ valid: false });
  expect(await customer.mutation(im.recordDownloadInternal, { token })).toMatchObject({ success: false });
  expect((await t.run(ctx => ctx.db.get(ids.token)))?.downloadCount).toBe(0);
});

test("validation returns only customer file metadata, never raw entitlement or product records", async () => {
  const { customer } = await digitalFixture();
  const result = await customer.query(q.validateDownloadToken, { token });
  expect(result).toMatchObject({ valid: true, file: { name: "Installer", fileName: "installer.zip" }, remainingDownloads: null });
  for (const field of ["storageId", "tokenRecord", "PRIVATE_DOWNLOAD_TOKEN", "authorId", "purchaseOrderId", "billingAddress"]) expect(JSON.stringify(result)).not.toContain(field);
});

test("missing storage is rejected before internal consumption or success logging", async () => {
  const { t, customer, ids } = await digitalFixture();
  await t.run(ctx => ctx.storage.delete(ids.storageId));
  expect(await customer.mutation(im.recordDownloadInternal, { token })).toMatchObject({ success: false });
  expect((await t.run(ctx => ctx.db.get(ids.token)))?.downloadCount).toBe(0);
  expect(await t.run(ctx => ctx.db.query("commerce_download_log").collect())).toEqual([]);
});

test("inactive customers cannot spend a previously issued download token", async () => {
  const { t, customer, ids } = await digitalFixture();
  await t.run(ctx => ctx.db.patch(ids.customer, { status: "inactive" }));
  expect(await customer.query(q.validateDownloadToken, { token })).toMatchObject({ valid: false });
  await expect(customer.mutation(m.recordDownload, { token })).rejects.toThrow();
});

test("guest-order bearer delivery remains available until the order is claimed by an account", async () => {
  const { t, customer, ids } = await digitalFixture();
  await t.run(async ctx => { await ctx.db.patch(ids.order, { userId: undefined }); await ctx.db.patch(ids.token, { userId: undefined }); });
  expect(await t.query(q.validateDownloadToken, { token })).toMatchObject({ valid: true });
  expect(await t.mutation(im.recordDownloadInternal, { token })).toMatchObject({ success: true });
  await t.run(ctx => ctx.db.patch(ids.order, { userId: ids.customer }));
  expect(await t.query(q.validateDownloadToken, { token })).toMatchObject({ valid: false });
  expect(await customer.query(q.validateDownloadToken, { token })).toMatchObject({ valid: true });
});

test("zero and malformed download limits fail closed; a valid last allowance is consumed exactly once", async () => {
  const { t, customer, ids } = await digitalFixture();
  for (const maxDownloads of [0, -1, 1.5]) {
    await t.run(ctx => ctx.db.patch(ids.token, { maxDownloads }));
    expect(await customer.query(q.validateDownloadToken, { token })).toMatchObject({ valid: false });
    expect(await customer.mutation(im.recordDownloadInternal, { token })).toMatchObject({ success: false });
  }
  await t.run(ctx => ctx.db.patch(ids.token, { maxDownloads: 1 }));
  expect(await customer.mutation(im.recordDownloadInternal, { token })).toMatchObject({ success: true });
  expect(await customer.mutation(im.recordDownloadInternal, { token })).toMatchObject({ success: false });
  expect((await t.run(ctx => ctx.db.get(ids.token)))?.downloadCount).toBe(1);
});

test("zero expiration timestamp is expired rather than unlimited", async () => {
  const { t, customer, ids } = await digitalFixture();
  await t.run(ctx => ctx.db.patch(ids.token, { expiresAt: 0 }));
  expect(await customer.query(q.validateDownloadToken, { token })).toMatchObject({ valid: false });
  expect(await customer.mutation(im.recordDownloadInternal, { token })).toMatchObject({ success: false });
});

test.each(["owner", "order", "product", "variant", "quantity"] as const)("a mismatched %s relationship fails every download entry point", async mismatch => {
  const { t, customer, ids } = await digitalFixture();
  await t.run(async ctx => {
    if (mismatch === "owner") await ctx.db.patch(ids.token, { userId: ids.operator });
    if (mismatch === "quantity") await ctx.db.patch(ids.item, { quantity: 0 });
    if (mismatch === "order") {
      const original = await ctx.db.get(ids.order);
      if (!original) throw Error("Fixture order missing");
      const { _id, _creationTime, ...order } = original;
      const other = await ctx.db.insert("commerce_orders", { ...order, orderNumber: "ANOTHER", trackingToken: "OTHER_TRACKING" });
      await ctx.db.patch(ids.item, { orderId: other });
    }
    if (mismatch === "product" || mismatch === "variant") {
      const original = await ctx.db.get(ids.product);
      if (!original) throw Error("Fixture product missing");
      const { _id, _creationTime, ...product } = original;
      const other = await ctx.db.insert("commerce_products", { ...product, slug: "another-product" });
      if (mismatch === "product") await ctx.db.patch(ids.file, { productId: other });
      else {
        const variant = await ctx.db.insert("commerce_product_variants", { productId: other, title: "Another product's variant", optionSummary: "Other", status: "publish", price: { amount: 1000, currencyCode: "USD" }, isDefault: true, createdAt: 1, updatedAt: 1 });
        await ctx.db.patch(ids.item, { variantId: variant });
      }
    }
  });
  expect(await customer.query(q.validateDownloadToken, { token })).toMatchObject({ valid: false });
  await expect(customer.mutation(m.recordDownload, { token })).rejects.toThrow();
  expect(await customer.mutation(im.recordDownloadInternal, { token })).toMatchObject({ success: false });
  expect((await t.run(ctx => ctx.db.get(ids.token)))?.downloadCount).toBe(0);
});

test("file version must match the purchased variant, while a product-wide file remains available", async () => {
  const { t, customer, ids } = await digitalFixture();
  await t.run(async ctx => {
    const variant = await ctx.db.insert("commerce_product_variants", { productId: ids.product, title: "Unpurchased variant", optionSummary: "Pro", status: "private", price: { amount: 2000, currencyCode: "USD" }, isDefault: false, createdAt: 1, updatedAt: 1 });
    await ctx.db.patch(ids.file, { variantId: variant });
  });
  expect(await customer.query(q.validateDownloadToken, { token })).toMatchObject({ valid: false });
  await t.run(ctx => ctx.db.patch(ids.file, { variantId: undefined, isLatest: false }));
  expect(await customer.query(q.validateDownloadToken, { token })).toMatchObject({ valid: true });
});

test("expiry rejects at the exact boundary and authorization uses a bounded ledger", async () => {
  const { t, customer, ids } = await digitalFixture();
  await t.run(ctx => ctx.db.patch(ids.token, { expiresAt: 1000 }));
  const budget = new RequestReadLedger();
  expect((await customer.run(ctx => readDownloadEntitlement(ctx, token, 999, budget))).success).toBe(true);
  expect(budget.authorizationRecheckAt).toBe(1000);
  expect(budget.queries).toBeLessThanOrEqual(8);
  expect((await customer.run(ctx => readDownloadEntitlement(ctx, token, 1000))).success).toBe(false);
  await expect(customer.run(ctx => readDownloadEntitlement(ctx, token, 999, new RequestReadLedger({ queries: 1, documents: 20, bytes: 100000, documentBytes: 100000 })))).rejects.toThrow();
});
