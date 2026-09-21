import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { readShippingPolicy } from "../shippingPolicy";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { validateSectionValues } from "../../settings/validation";
const modules = { "./convex/_generated/api.js": () => import("../../_generated/api.js"), "./convex/_generated/server.js": () => import("../../_generated/server.js"), "./convex/membership/policyReads.ts": () => import("../../membership/policyReads") };
const item = { icon: "clock", title: "Carefully packed", body: "Contact the store with delivery questions.", href: "/shipping" };
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { authSource: "local", email: "policy@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const plugins = await ctx.db.insert("settings", { section: "plugins", values: { commerceEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: user });
    const general = await ctx.db.insert("settings", { section: "commerce.general", values: { storefrontPromises: [item], storeEmail: "private@example.invalid", apiKey: "PRIVATE", shippingMethods: [{ code: "free", label: "Free shipping" }], returnWindowDays: 30 }, updatedAt: 1, updatedBy: user });
    return { user, plugins, general };
  });
  return { t, ids };
}
test("shipping policy exposes only explicitly published copy in saved order", async () => {
  const { t, ids } = await fixture();
  expect(await t.run(ctx => readShippingPolicy(ctx, {}))).toEqual({ items: [item] });
  await t.run(ctx => ctx.db.patch(ids.general, { values: { returnWindowDays: 30, shippingMethods: [{ label: "Free" }] } }));
  expect(await t.run(ctx => readShippingPolicy(ctx, {}))).toEqual({ items: [] });
  await t.run(ctx => ctx.db.delete(ids.general));
  expect(await t.run(ctx => readShippingPolicy(ctx, {}))).toEqual({ items: [] });
});
test("disabled commerce and restricted shop withdraw policies, restoration reads current values", async () => {
  const { t, ids } = await fixture();
  await t.run(ctx => ctx.db.patch(ids.plugins, { values: { commerceEnabled: false } }));
  expect(await t.run(ctx => readShippingPolicy(ctx, {}))).toEqual({ items: [] });
  await t.run(ctx => ctx.db.patch(ids.plugins, { values: { commerceEnabled: true, membershipEnabled: true } }));
  const rule = await t.run(ctx => ctx.db.insert("membership_restriction_rules", { resourceType: "route", resourceIdOrKey: "/shop", ruleMode: "allow_only", planIds: [], teaserMode: "hide", loginRequired: true, createdAt: 1, updatedAt: 1 }));
  expect(await t.run(ctx => readShippingPolicy(ctx, {}))).toEqual({ items: [] });
  await t.run(ctx => ctx.db.delete(rule));
  await t.run(ctx => ctx.db.patch(ids.general, { values: { storefrontPromises: [{ ...item, title: "Current policy" }] } }));
  expect((await t.run(ctx => readShippingPolicy(ctx, {}))).items[0]?.title).toBe("Current policy");
});
test("policy writes reject unsafe, oversized and malformed promises", () => {
  const invalid = [[{ ...item, href: "javascript:alert(1)" }], [{ ...item, href: "//evil.invalid" }], [{ ...item, title: " " }], [{ ...item, icon: "invented" }], [{ ...item, body: "x".repeat(3001) }], Array(9).fill(item), [{ ...item, secret: "no" }], null];
  for (const storefrontPromises of invalid) expect(validateSectionValues("commerce.general", { storefrontPromises }).some(error => error.field === "storefrontPromises")).toBe(true);
  expect(validateSectionValues("commerce.general", { storefrontPromises: [item] })).toEqual([]);
  expect(validateSectionValues("commerce.general", { storefrontPromises: [] })).toEqual([]);
});
test("reader refuses fabricated arguments and corrupt persisted policies without falling back", async () => {
  const { t, ids } = await fixture();
  await expect(t.run(ctx => readShippingPolicy(ctx, { items: [item] }))).rejects.toThrow();
  await t.run(ctx => ctx.db.patch(ids.general, { values: { storefrontPromises: [{ ...item, href: "data:text/html,bad" }] } }));
  await expect(t.run(ctx => readShippingPolicy(ctx, {}))).rejects.toThrow();
});
test("settings and policy reads count full documents and refuse exhausted budgets", async () => {
  const { t, ids } = await fixture();
  const budget = new RequestReadLedger();
  await t.run(ctx => readShippingPolicy(ctx, {}, budget));
  expect(budget.queries).toBeGreaterThan(0); expect(budget.documents).toBeGreaterThan(0);
  const exhausted = new RequestReadLedger({ queries: 0, documents: 100, bytes: 100000, documentBytes: 100000 });
  await expect(t.run(ctx => readShippingPolicy(ctx, {}, exhausted))).rejects.toThrow("safe read budget");
  await t.run(ctx => ctx.db.patch(ids.general, { values: { storefrontPromises: [item], hidden: "x".repeat(530000) } }));
  await expect(t.run(ctx => readShippingPolicy(ctx, {}))).rejects.toThrow("safe read budget");
});
