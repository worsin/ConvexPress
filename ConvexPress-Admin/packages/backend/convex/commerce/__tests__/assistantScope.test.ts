import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api, internal } from "../../_generated/api";
import schema from "../../schema";
import { purgeThread } from "../assistant/mutations";
const modules = {
  "./convex/commerce/cart.ts": () => import("../cart"),
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

test("returning customer retains both conversations and guest memory when its saved cart is recovered", async () => {
  const { t, a, ids } = await fixture();
  await a.mutation(im.appendMessage, { sessionToken: otherToken, role: "user", text: "Earlier account question", blocks: [] });
  await t.run(ctx => ctx.db.insert("commerce_carts", { sessionToken: otherToken, userId: ids.a, status: "active", currencyCode: "USD", subtotalAmount: 0, discountAmount: 0, shippingAmount: 0, taxAmount: 0, totalAmount: 0, itemCount: 0, lastActiveAt: 1, createdAt: 1, updatedAt: 1 }));
  await t.mutation(im.appendMessage, { sessionToken: token, role: "user", text: "Guest question before sign-in", blocks: [] });
  await t.mutation(m.rememberFact, { sessionToken: token, fact: "I prefer manual grinders" });
  expect(await a.mutation(m.resolveSession, { sessionToken: token })).toBe(otherToken);
  expect((await a.query(q.getThread, { sessionToken: otherToken })).messages.map((x: any) => x.text)).toEqual(["Earlier account question", "Guest question before sign-in"]);
  expect((await a.query(q.listMemory, { sessionToken: otherToken })).map((x: any) => x.fact)).toEqual(["I prefer manual grinders"]);
  await expect(t.query(q.getThread, { sessionToken: token })).rejects.toThrow("another account");
  await a.mutation(m.resolveSession, { sessionToken: token });
  expect((await a.query(q.getThread, { sessionToken: otherToken })).messages).toHaveLength(2);
});

test("first customer sign-in adopts guest preferences for another device before another assistant turn", async () => {
  const { t, a } = await fixture();
  await t.mutation(m.rememberFact, { sessionToken: token, fact: "I use paper filters" });
  await a.mutation(m.resolveSession, { sessionToken: token });
  await a.mutation(m.resolveSession, { sessionToken: otherToken });
  expect((await a.query(q.listMemory, { sessionToken: otherToken })).map((x: any) => x.fact)).toEqual(["I use paper filters"]);
  await expect(t.query(q.listMemory, { sessionToken: token })).rejects.toThrow("another account");
});

test("adoption drains every older message in bounded batches without rewriting original turn data", async () => {
  const { t, a, ids } = await fixture();
  const source = await t.mutation(m.ensureSession, { sessionToken: token });
  await t.run(async ctx => {
    await ctx.db.insert("commerce_carts", { sessionToken: otherToken, userId: ids.a, status: "active", currencyCode: "USD", subtotalAmount: 0, discountAmount: 0, shippingAmount: 0, taxAmount: 0, totalAmount: 0, itemCount: 0, lastActiveAt: 1, createdAt: 1, updatedAt: 1 });
    for (let i = 0; i < 610; i++) await ctx.db.insert("commerce_assistant_messages", { sessionId: source as any, role: "assistant", text: `History ${i}`, blocks: [{ type: "text", markdown: `Body ${i}` }], feedback: "up", model: "preserved-model", createdAt: i + 1 });
    await ctx.db.patch(source as any, { messageCount: 610 });
  });
  const before = await t.run(ctx => ctx.db.query("commerce_assistant_messages").collect());
  await a.mutation(m.resolveSession, { sessionToken: token });
  const immediate = await a.query(q.getThread, { sessionToken: otherToken, limit: 60 });
  expect(immediate.messages).toHaveLength(60); expect(immediate.messages[0].text).toBe("History 550");
  // Manually drive the registered batches: retrying an already drained source is harmless.
  for (let i = 0; i < 4; i++) await t.mutation(im.transferHistory, { sessionId: source });
  const after = await t.run(ctx => ctx.db.query("commerce_assistant_messages").collect());
  expect(after).toHaveLength(610);
  for (const old of before) {
    const row = after.find(x => x._id === old._id)!;
    expect({ ...row, sessionId: old.sessionId, adoptedAt: undefined }).toEqual({ ...old, adoptedAt: undefined });
  }
  expect(new Set(after.map(x => x.sessionId)).size).toBe(1);
  await a.mutation(im.appendMessage, { sessionToken: token, role: "assistant", text: "Late reply", blocks: [] });
  expect((await a.query(q.getThread, { sessionToken: otherToken })).messages.at(-1).text).toBe("Late reply");
});

test("clear during adoption cannot resurrect older imported turns, while a pre-adoption clear cannot erase new imports", async () => {
  const { t, a, ids } = await fixture();
  await a.mutation(im.appendMessage, { sessionToken: otherToken, role: "assistant", text: "Old account answer", blocks: [] });
  const destination = (await a.query(q.getThread, { sessionToken: otherToken })).session.id;
  await a.mutation(m.clearThread, { sessionToken: otherToken });
  const cutoff = await t.run(async ctx => (await ctx.db.get(destination))!.clearedBefore);
  await t.run(ctx => ctx.db.insert("commerce_carts", { sessionToken: otherToken, userId: ids.a, status: "active", currencyCode: "USD", subtotalAmount: 0, discountAmount: 0, shippingAmount: 0, taxAmount: 0, totalAmount: 0, itemCount: 0, lastActiveAt: 1, createdAt: 1, updatedAt: 1 }));
  const source = await t.mutation(m.ensureSession, { sessionToken: token });
  await t.run(async ctx => {
    for (let i = 0; i < 310; i++) await ctx.db.insert("commerce_assistant_messages", { sessionId: source as any, role: "assistant", text: "Guest older answer", blocks: [], createdAt: 100 + i });
    await ctx.db.patch(source as any, { messageCount: 310 });
  });
  await a.mutation(m.resolveSession, { sessionToken: token });
  await t.mutation(im.purgeThread, { sessionId: destination, cutoff });
  expect((await a.query(q.getThread, { sessionToken: otherToken })).messages).toHaveLength(30);
  await a.mutation(m.clearThread, { sessionToken: otherToken });
  await t.mutation(im.transferHistory, { sessionId: source });
  expect((await a.query(q.getThread, { sessionToken: otherToken })).messages).toEqual([]);
  await a.mutation(im.appendMessage, { sessionToken: token, role: "assistant", text: "After clear", blocks: [] });
  expect((await a.query(q.getThread, { sessionToken: otherToken })).messages.map((x: any) => x.text)).toEqual(["After clear"]);
});

test("adopted preferences deduplicate without extending retention and remain private to the customer", async () => {
  const { t, a, b } = await fixture();
  const guestId = await t.mutation(m.rememberFact, { sessionToken: token, fact: "Manual grinder" });
  await a.mutation(m.rememberFact, { sessionToken: otherToken, fact: "manual grinder" });
  const before = await t.run(ctx => ctx.db.get(guestId as any));
  await a.mutation(m.resolveSession, { sessionToken: token });
  const memory = await a.query(q.listMemory, { sessionToken: otherToken });
  expect(memory).toHaveLength(1);
  const row = await t.run(ctx => ctx.db.get(memory[0].id));
  expect(row!.expiresAt - before!.expiresAt).toBeLessThan(1000);
  await expect(b.query(q.listMemory, { sessionToken: token })).rejects.toThrow("another account");
  await a.mutation(m.forgetFact, { sessionToken: otherToken, memoryId: memory[0].id });
  expect(await a.query(q.listMemory, { sessionToken: token })).toEqual([]);
});


test("disabled memory is excluded from grounding and refuses fresh writes without deleting shopper controls", async () => {
  const { t, a, b, ids } = await fixture();
  const fact = "Saved preference only: narrow cabinet";
  await a.mutation(m.rememberFact, { sessionToken: token, fact });
  const before = await a.query(q.listMemory, { sessionToken: token });
  const context = (internal as any).commerce.assistant.queries.contextBundle;
  expect((await a.query(context, { sessionToken: token })).memory[0].fact).toBe(fact);
  const setting = await t.run(ctx => ctx.db.insert("settings", {
    section: "commerce.assistant", values: { memoryEnabled: false }, updatedAt: 1, updatedBy: ids.a,
  }));
  expect((await a.query(context, { sessionToken: token })).memory).toEqual([]);
  await expect(a.mutation(m.rememberFact, { sessionToken: token, fact: "New direct preference" })).rejects.toThrow("disabled");
  // A provider turn may have started before the operator disabled memory.
  await expect(a.mutation(im.rememberFactFromAssistant, { sessionToken: token, fact: "Late provider preference", retentionDays: 90 })).rejects.toThrow("disabled");
  expect(await a.query(q.listMemory, { sessionToken: token })).toEqual(before);
  await expect(b.query(q.listMemory, { sessionToken: token })).rejects.toThrow("another account");
  await t.run(ctx => ctx.db.patch(setting, { values: { memoryEnabled: true } }));
  expect((await a.query(context, { sessionToken: token })).memory[0].fact).toBe(fact);
  await t.run(ctx => ctx.db.patch(setting, { values: { memoryEnabled: false } }));
  await a.mutation(m.forgetFact, { sessionToken: token, memoryId: before[0].id });
  expect(await a.query(q.listMemory, { sessionToken: token })).toEqual([]);
});


test("disabling memory invalidates old personalized briefs and facets, but permits fresh non-memory briefs", async () => {
  const { t, a, ids } = await fixture();
  const facets = (api as any).commerce.storefront.facetsForQuery;
  const blocks = [{ type: "facets", items: [{ label: "Based on my saved preferences", query: "notebook" }] }];
  await a.mutation(im.storeBrief, { sessionToken: token, cacheKey: "old-memory", kind: "query", query: "notebook", payload: { blocks }, ttlMs: 60000 });
  expect(await a.query(q.getBrief, { sessionToken: token, cacheKey: "old-memory" })).not.toBeNull();
  expect(await a.query(facets, { sessionToken: token, q: "notebook" })).not.toBeNull();
  const setting = await t.run(ctx => ctx.db.insert("settings", { section: "commerce.assistant", values: { memoryEnabled: false }, updatedAt: 1, updatedBy: ids.a }));
  expect(await a.query(q.getBrief, { sessionToken: token, cacheKey: "old-memory" })).toBeNull();
  expect(await a.query(facets, { sessionToken: token, q: "notebook" })).toBeNull();
  const fresh = [{ type: "facets", items: [{ label: "Current catalog", query: "notebook" }] }];
  await a.mutation(im.storeBrief, { sessionToken: token, cacheKey: "no-memory", kind: "query", query: "notebook", payload: { blocks: fresh, memoryEnabled: false }, ttlMs: 60000 });
  expect(await a.query(q.getBrief, { sessionToken: token, cacheKey: "no-memory" })).not.toBeNull();
  expect((await a.query(facets, { sessionToken: token, q: "notebook" })).chips[0].label).toBe("Current catalog");
  await t.run(ctx => ctx.db.patch(setting, { values: { enabled: false, memoryEnabled: false } }));
  expect(await a.query(q.getBrief, { sessionToken: token, cacheKey: "no-memory" })).toBeNull();
  expect(await a.query(facets, { sessionToken: token, q: "notebook" })).toBeNull();
});
