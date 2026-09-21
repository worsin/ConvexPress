import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api, internal } from "../../_generated/api";
import schema from "../../schema";
import { purgeThread } from "../assistant/mutations";
const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/commerce/assistant/queries.ts": () => import("../assistant/queries"),
  "./convex/commerce/assistant/mutations.ts": () => import("../assistant/mutations"),
  "./convex/commerce/storefront.ts": () => import("../storefront"),
};
const token = "11111111-1111-4111-8111-111111111111";
const otherToken = "22222222-2222-4222-8222-222222222222";
const q = (api as any).commerce.assistant.queries;
const m = (api as any).commerce.assistant.mutations;
const im = (internal as any).commerce.assistant.mutations;
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const a = await ctx.db.insert("users", { authSource: "local", email: "a@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const b = await ctx.db.insert("users", { authSource: "local", email: "b@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { commerceEnabled: true }, updatedAt: 1, updatedBy: a });
    return { a, b };
  });
  const identity = (id: string) => t.withIdentity({ subject: id, tokenIdentifier: `https://convexpress-admin.local|${id}` });
  return { t, ids, a: identity(ids.a), b: identity(ids.b) };
}

test("a signed-in thread cannot be read, changed or cleared with its token by another identity", async () => {
  const { t, a, b } = await fixture();
  await a.mutation(m.ensureSession, { sessionToken: token });
  const id = await a.mutation(im.appendMessage, { sessionToken: token, role: "user", text: "Private question", blocks: [] });
  for (const caller of [t, b]) {
    await expect(caller.query(q.getThread, { sessionToken: token })).rejects.toThrow("another account");
    await expect(caller.query(q.listMemory, { sessionToken: token })).rejects.toThrow("another account");
    await expect(caller.mutation(m.setFeedback, { sessionToken: token, messageId: id, feedback: "up" })).rejects.toThrow("another account");
    await expect(caller.mutation(m.clearThread, { sessionToken: token })).rejects.toThrow("another account");
    await expect(caller.mutation(im.appendMessage, { sessionToken: token, role: "user", text: "Overwrite", blocks: [] })).rejects.toThrow("another account");
  }
  expect((await a.query(q.getThread, { sessionToken: token })).messages[0].text).toBe("Private question");
});

test("guest history is adopted on sign-in and user memory can be listed and forgotten across sessions", async () => {
  const { t, a, b } = await fixture();
  await t.mutation(m.rememberFact, { sessionToken: token, fact: "Guest preference" });
  await a.mutation(m.ensureSession, { sessionToken: token });
  const memoryId = await a.mutation(im.rememberFactFromAssistant, { sessionToken: token, fact: "Account preference", retentionDays: 90 });
  expect((await a.query(q.listMemory, { sessionToken: token })).map((row: any) => row.fact).sort()).toEqual(["Account preference", "Guest preference"]);
  await a.mutation(m.ensureSession, { sessionToken: otherToken });
  expect((await a.query(q.listMemory, { sessionToken: otherToken })).map((row: any) => row.fact)).toEqual(["Account preference"]);
  await expect(b.mutation(m.forgetFact, { sessionToken: otherToken, memoryId })).rejects.toThrow();
  await a.mutation(m.forgetFact, { sessionToken: otherToken, memoryId });
  expect((await a.query(q.listMemory, { sessionToken: token })).map((row: any) => row.fact)).toEqual(["Guest preference"]);
  await a.mutation(m.forgetAll, { sessionToken: token });
  expect(await a.query(q.listMemory, { sessionToken: token })).toEqual([]);
});

test("a user ID cannot be supplied as a guest token to read legacy account memory", async () => {
  const { t, a, ids } = await fixture();
  await a.mutation(m.rememberFact, { sessionToken: token, fact: "Private account preference" });
  await expect(t.query(q.listMemory, { sessionToken: ids.a })).rejects.toThrow("new session");
});

test("an owned cart protects legacy assistant rows that have no user binding yet", async () => {
  const { t, a, b, ids } = await fixture();
  await t.mutation(m.ensureSession, { sessionToken: token });
  await t.run(async ctx => {
    await ctx.db.insert("commerce_carts", { sessionToken: token, userId: ids.a, status: "active", currencyCode: "USD", subtotalAmount: 0, discountAmount: 0, shippingAmount: 0, taxAmount: 0, totalAmount: 0, itemCount: 0, lastActiveAt: 1, createdAt: 1, updatedAt: 1 });
  });
  await expect(t.query(q.getThread, { sessionToken: token })).rejects.toThrow("another account");
  await expect(b.mutation(m.ensureSession, { sessionToken: token })).rejects.toThrow("another account");
  expect((await a.query(q.getThread, { sessionToken: token })).session).not.toBeNull();
  expect(await a.mutation(m.resolveSession, { sessionToken: token })).toBe(token);
  expect(await t.mutation(m.resolveSession, { sessionToken: token })).not.toBe(token);
  expect(await b.mutation(m.resolveSession, { sessionToken: token })).not.toBe(token);
});

test("legacy malformed tokens rotate, while unresolved Clerk profiles cannot read account-owned history", async () => {
  const { t, a } = await fixture();
  const fresh = await t.mutation(m.resolveSession, { sessionToken: "old-invalid-token" });
  expect(fresh).toMatch(/^[0-9a-f-]{36}$/);
  const unmapped = t.withIdentity({ subject: "clerk-user-not-provisioned", tokenIdentifier: "https://clerk.example|clerk-user-not-provisioned" });
  expect(await unmapped.mutation(m.resolveSession, { sessionToken: fresh })).toBe(fresh);
  await a.mutation(m.ensureSession, { sessionToken: token });
  expect(await unmapped.mutation(m.resolveSession, { sessionToken: token })).not.toBe(token);
  await expect(unmapped.query(q.getThread, { sessionToken: token })).rejects.toThrow("another account");
});

test("brief cache needs the owning session; unscoped legacy and expired rows are not returned", async () => {
  const { t, a, b } = await fixture();
  await a.mutation(im.storeBrief, { sessionToken: token, cacheKey: "private-cache", kind: "cart", payload: { blocks: [{ type: "text", markdown: "Private summary" }] }, ttlMs: 60000 });
  expect((await a.query(q.getBrief, { sessionToken: token, cacheKey: "private-cache" })).blocks[0].markdown).toBe("Private summary");
  await expect(b.query(q.getBrief, { sessionToken: token, cacheKey: "private-cache" })).rejects.toThrow();
  expect(await b.query(q.getBrief, { sessionToken: otherToken, cacheKey: "private-cache" })).toBeNull();
  await t.run(ctx => ctx.db.insert("commerce_assistant_briefs", { kind: "query", cacheKey: "legacy", payload: { blocks: ["Private legacy"] }, generatedAt: Date.now(), expiresAt: Date.now() + 60000 }));
  expect(await t.query(q.getBrief, { sessionToken: otherToken, cacheKey: "legacy" })).toBeNull();
});

test("catalog facets keep private suggestions available only in their session, with curated overrides", async () => {
  const { t, a, b } = await fixture();
  const facets = (api as any).commerce.storefront.facetsForQuery;
  await a.mutation(im.storeBrief, { sessionToken: token, cacheKey: "query-private", kind: "query", query: "notebook", payload: { blocks: [{ type: "facets", items: [{ label: "Fits my private project", query: "specific notebook" }] }] }, ttlMs: 60000 });
  expect((await a.query(facets, { q: "notebook", sessionToken: token })).chips[0].label).toBe("Fits my private project");
  expect(await b.query(facets, { q: "notebook", sessionToken: otherToken })).toBeNull();
  expect(await t.query(facets, { q: "notebook" })).toBeNull();
  await expect(b.query(facets, { q: "notebook", sessionToken: token })).rejects.toThrow();
  const { hashQuery } = await import("../storefront");
  const id = await t.run(ctx => ctx.db.insert("commerce_search_facets", { queryHash: hashQuery("notebook"), query: "notebook", chips: [{ label: "Legacy unreviewed suggestion" }], generatedAt: 1, pinned: false, banned: false }));
  expect(await t.query(facets, { q: "notebook" })).toBeNull();
  await t.run(ctx => ctx.db.patch(id, { pinned: true, chips: [{ label: "Curated stationery" }] }));
  expect((await t.query(facets, { q: "notebook" })).chips[0].label).toBe("Curated stationery");
  await t.run(ctx => ctx.db.patch(id, { banned: true }));
  expect(await a.query(facets, { q: "notebook", sessionToken: token })).toBeNull();
});

test("the twelfth turn is allowed and the thirteenth is refused despite assistant replies and clearing", async () => {
  const { t } = await fixture();
  for (let i = 0; i < 12; i++) {
    await t.mutation(im.appendMessage, { sessionToken: token, role: "user", text: `Question ${i}`, blocks: [] });
    await t.mutation(im.appendMessage, { sessionToken: token, role: "assistant", blocks: [] });
  }
  await expect(t.mutation(im.appendMessage, { sessionToken: token, role: "user", text: "Too many", blocks: [] })).rejects.toThrow("try again in a minute");
  await t.mutation(m.clearThread, { sessionToken: token });
  expect((await t.query(q.getThread, { sessionToken: token })).messages).toEqual([]);
  await expect(t.mutation(im.appendMessage, { sessionToken: token, role: "user", text: "Still too many", blocks: [] })).rejects.toThrow("try again in a minute");
});

test("thread purge is bounded and preserves turns after the clear cutoff", async () => {
  const { t } = await fixture();
  const id = await t.mutation(m.ensureSession, { sessionToken: token });
  await t.run(async ctx => {
    for (let i = 0; i < 510; i++) await ctx.db.insert("commerce_assistant_messages", { sessionId: id as any, role: "user", text: "old", blocks: [], createdAt: 100 });
    await ctx.db.insert("commerce_assistant_messages", { sessionId: id as any, role: "user", text: "new", blocks: [], createdAt: 201 });
  });
  let scheduled = 0;
  const pass = () => t.run(ctx => (purgeThread as any)._handler({ ...ctx, scheduler: { runAfter: async () => { scheduled++; } } }, { sessionId: id, cutoff: 200 }));
  await pass();
  expect((await t.run(ctx => ctx.db.query("commerce_assistant_messages").collect())).length).toBe(261);
  await pass(); await pass();
  expect(scheduled).toBe(2);
  expect((await t.run(ctx => ctx.db.query("commerce_assistant_messages").collect())).map(row => row.text)).toEqual(["new"]);
});
