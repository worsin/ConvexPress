import { expect, test } from "bun:test";
import { makeFunctionReference } from "convex/server";
import { digitalFixture } from "./fixtures.test";
import type { LibraryArgs, LibraryPage } from "../library";
const read = makeFunctionReference<"query", LibraryArgs, LibraryPage | null>("commerceDigital/library:page");
const args: LibraryArgs = { instanceKey: "library-site", refreshKey: "initial", paginationOpts: { numItems: 12, cursor: null } };
async function fixture() {
  const f = await digitalFixture();
  await f.t.run(ctx => ctx.db.insert("convexpress_siteIdentity", { identityKey: "site-identity", websiteKey: "library", instanceKey: "library-site", environmentKind: "staging", deploymentOrigin: "https://library.convex.cloud", managementOrigin: "https://controller.convex.cloud", siteOrigin: "https://library.convex.site", siteContractVersion: "1", schemaVersion: "2026.9.0", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 }));
  return f;
}
test("closed private library exposes only this customer's purchase metadata and authorized action", async () => {
  const { t, customer, operator, ids } = await fixture();
  expect(await t.query(read, args)).toBeNull();
  expect((await operator.query(read, args))?.page).toEqual([]);
  const result = await customer.query(read, args);
  expect(result?.page).toHaveLength(1);
  expect(result?.page[0]).toMatchObject({ id: ids.token, title: "Software", status: "available", token: "PRIVATE_DOWNLOAD_TOKEN", fileSize: 24 });
  expect(Object.keys(result!.page[0]!).sort()).toEqual(["expiresAt", "fileName", "fileSize", "id", "label", "orderNumber", "purchasedAt", "remainingDownloads", "status", "title", "token", "version"]);
  for (const secret of ["PRIVATE_LICENSE_KEY", "PRIVATE_TRACKING", "billingAddress", "storageId", "digital-customer@example.invalid"]) expect(JSON.stringify(result)).not.toContain(secret);
});
test.each(["expired", "exhausted", "unavailable"] as const)("%s purchases retain history without a download capability", async status => {
  const { t, customer, ids } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.token, status === "expired" ? { expiresAt: 0 } : status === "exhausted" ? { maxDownloads: 1, downloadCount: 1 } : { isActive: false }));
  expect((await customer.query(read, args))?.page[0]).toMatchObject({ status, token: null });
});
test("site, plugin and current account authorization are rechecked", async () => {
  const { t, customer, ids } = await fixture();
  expect(await customer.query(read, { ...args, instanceKey: "other-site" })).toBeNull();
  await t.run(ctx => ctx.db.patch(ids.plugins, { values: { commerceEnabled: true, commerceDigitalEnabled: false } }));
  expect(await customer.query(read, args)).toBeNull();
  await t.run(ctx => ctx.db.patch(ids.plugins, { values: { commerceEnabled: true, commerceDigitalEnabled: true } }));
  await t.run(ctx => ctx.db.patch(ids.customer, { status: "banned" }));
  expect(await customer.query(read, args)).toBeNull();
});
test("forged token ownership does not disclose another buyer's order or file", async () => {
  const { t, customer, ids } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.order, { userId: ids.operator }));
  expect((await customer.query(read, args))?.page).toEqual([]);
});
test("removed files keep the buyer's purchase history without storage or file capabilities", async () => {
  const { t, customer, ids } = await fixture();
  await t.run(ctx => ctx.db.delete(ids.file));
  expect((await customer.query(read, args))?.page[0]).toMatchObject({ title: "Software", fileName: "File no longer available", status: "unavailable", token: null });
});
test("pagination is bounded, uses every cursor, and a snapshot expires at its first entitlement boundary", async () => {
  const { t, customer, ids } = await fixture();
  const deadline = Date.now() + 5000;
  await t.run(async ctx => {
    await ctx.db.patch(ids.token, { expiresAt: deadline });
    for (let i = 0; i < 24; i++) await ctx.db.insert("commerce_download_tokens", { digitalFileId: ids.file, orderId: ids.order, orderItemId: ids.item, userId: ids.customer, token: `PRIVATE_PAGE_TOKEN_${i}`, downloadCount: 0, isActive: true, createdAt: i + 2 });
  });
  let cursor: string | null = null; const seen = new Set<string>();
  do {
    const result = await customer.query(read, { ...args, paginationOpts: { numItems: 12, cursor } });
    expect(result!.page.length).toBeLessThanOrEqual(12);
    for (const item of result!.page) { expect(seen.has(item.id)).toBe(false); seen.add(item.id); }
    if (result!.page.some(item => item.id === ids.token)) expect(result!.expiresAt).toBe(deadline);
    cursor = result!.isDone ? null : result!.continueCursor;
  } while (cursor);
  expect(seen.size).toBe(25);
  for (const numItems of [0, 13, 1000, 1.5]) await expect(customer.query(read, { ...args, paginationOpts: { numItems, cursor: null } })).rejects.toThrow();
});
