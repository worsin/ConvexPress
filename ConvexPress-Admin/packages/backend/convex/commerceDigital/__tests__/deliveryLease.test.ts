import { expect, test } from "bun:test";
import { makeFunctionReference } from "convex/server";
import { digitalFixture } from "./fixtures.test";
import { recordDownload, recordDownloadInternal } from "../mutations";
const begin = makeFunctionReference<"mutation">("commerceDigital/delivery:beginLease");
const start = makeFunctionReference<"mutation">("commerceDigital/delivery:startLease");
const read = makeFunctionReference<"query">("commerceDigital/delivery:readLease");
const expire = makeFunctionReference<"mutation">("commerceDigital/delivery:expireLease");
const token = "PRIVATE_DOWNLOAD_TOKEN", secret = "a".repeat(64), requestId = "request_download_001";
test("legacy allowance recorders are internal-only", () => {
  for (const fn of [recordDownload, recordDownloadInternal]) {
    expect("isInternal" in fn).toBe(true);
    expect("isPublic" in fn).toBe(false);
  }
});
async function fixture() {
  const data = await digitalFixture();
  const site = await data.t.run(ctx => ctx.db.insert("convexpress_siteIdentity", { identityKey: "site-identity", websiteKey: "downloads", instanceKey: "downloads-staging", environmentKind: "staging", deploymentOrigin: "https://downloads.convex.cloud", managementOrigin: "https://controller.convex.cloud", siteOrigin: "https://downloads.convex.site", siteContractVersion: "1", schemaVersion: "2026.9.0", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 }));
  return { ...data, site };
}

test("lease creation is purchaser-authorized, stores a digest, and does not spend an allowance", async () => {
  const { t, customer, operator, ids } = await fixture();
  for (const caller of [t, operator]) await expect(caller.mutation(begin, { token, secret, requestId })).rejects.toThrow();
  const result = await customer.mutation(begin, { token, secret, requestId });
  expect(result.fileName).toBe("installer.zip");
  expect(Object.keys(result).sort()).toEqual(["expiresAt", "fileName", "fileSize", "leaseId"]);
  const rows = await t.run(ctx => ctx.db.query("commerce_download_leases").collect());
  expect(rows).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toContain(secret);
  expect(JSON.stringify(rows)).not.toContain(token);
  expect((await t.run(ctx => ctx.db.get(ids.token)))?.downloadCount).toBe(0);
  expect(await customer.mutation(begin, { token, secret, requestId })).toEqual(result);
  await expect(customer.mutation(begin, { token, secret: "b".repeat(64), requestId })).rejects.toThrow();
});

test("one lease can retry and resume its last allowance; another lease cannot consume that allowance", async () => {
  const { t, customer, ids } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.token, { maxDownloads: 1 }));
  const a = await customer.mutation(begin, { token, secret, requestId });
  const b = await customer.mutation(begin, { token, secret, requestId: "request_download_002" });
  await t.mutation(start, { leaseId: a.leaseId, secret });
  await t.mutation(start, { leaseId: a.leaseId, secret });
  expect(await customer.mutation(begin, { token, secret, requestId })).toEqual(a);
  expect(await t.query(read, { leaseId: a.leaseId, secret, requestTime: Date.now() })).toMatchObject({ fileName: "installer.zip" });
  await expect(t.mutation(start, { leaseId: b.leaseId, secret })).rejects.toThrow();
  await expect(t.query(read, { leaseId: a.leaseId, secret: "c".repeat(64), requestTime: Date.now() })).rejects.toThrow();
  expect((await t.run(ctx => ctx.db.get(ids.token)))?.downloadCount).toBe(1);
  expect(await t.run(ctx => ctx.db.query("commerce_download_log").collect())).toHaveLength(1);
});

test.each(["revoked", "expired", "banned", "refunded", "file", "site", "owner"] as const)("a started lease is denied after %s authority changes", async change => {
  const { t, customer, ids, site } = await fixture();
  const lease = await customer.mutation(begin, { token, secret, requestId });
  await t.mutation(start, { leaseId: lease.leaseId, secret });
  await t.run(async ctx => {
    if (change === "revoked") await ctx.db.patch(ids.token, { isActive: false });
    if (change === "expired") await ctx.db.patch(ids.token, { expiresAt: 0 });
    if (change === "banned") await ctx.db.patch(ids.customer, { status: "banned" });
    if (change === "refunded") await ctx.db.patch(ids.order, { paymentStatus: "refunded" });
    if (change === "file") await ctx.db.patch(ids.file, { updatedAt: 2 });
    if (change === "site") await ctx.db.patch(site, { instanceKey: "another-instance" });
    if (change === "owner") await ctx.db.patch(ids.order, { userId: ids.operator });
  });
  await expect(t.query(read, { leaseId: lease.leaseId, secret, requestTime: Date.now() })).rejects.toThrow();
  await expect(t.mutation(start, { leaseId: lease.leaseId, secret })).rejects.toThrow();
  expect((await t.run(ctx => ctx.db.get(ids.token)))?.downloadCount).toBe(1);
});

test("lease expiry is bounded by entitlement expiry and cleanup refuses active leases", async () => {
  const { t, customer, ids } = await fixture();
  const deadline = Date.now() + 30000;
  await t.run(ctx => ctx.db.patch(ids.token, { expiresAt: deadline }));
  const lease = await customer.mutation(begin, { token, secret, requestId });
  expect(lease.expiresAt).toBe(deadline);
  await t.mutation(expire, { leaseId: lease.leaseId });
  expect(await t.run(ctx => ctx.db.get(lease.leaseId))).not.toBeNull();
  await t.run(ctx => ctx.db.patch("commerce_download_leases", lease.leaseId, { expiresAt: 0 }));
  await expect(t.query(read, { leaseId: lease.leaseId, secret, requestTime: Date.now() })).rejects.toThrow();
  await t.mutation(expire, { leaseId: lease.leaseId });
  expect(await t.run(ctx => ctx.db.get(lease.leaseId))).toBeNull();
});

test("pending sessions are bounded without imposing a lifetime quota on unlimited downloads", async () => {
  const { t, customer } = await fixture();
  const leases = [];
  for (let i = 0; i < 8; i++) leases.push(await customer.mutation(begin, { token, secret, requestId: `request_download_${i}` }));
  await expect(customer.mutation(begin, { token, secret, requestId: "request_download_extra" })).rejects.toThrow();
  for (const lease of leases) await t.mutation(start, { leaseId: lease.leaseId, secret });
  expect(await customer.mutation(begin, { token, secret, requestId: "request_download_extra" })).toMatchObject({ fileName: "installer.zip" });
});
