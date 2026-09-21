import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { snapshot, publish, getDraft, saveDraft, discardDraft } from "../templateDrafts";
const run = (fn: any, ctx: any, args: any = {}) => fn._handler(ctx, args);
const site = (kind = "staging", user: string | null = "admin") => commerceHarness({ convexpress_siteIdentity: [{ _id: "identity", identityKey: "site-identity", websiteKey: "shop", instanceKey: `shop:${kind}`, environmentKind: kind }] }, user);
test("anonymous cannot read or save drafts", async () => {
 const ctx = site("staging", null);
 await expect(run(snapshot, ctx)).rejects.toBeDefined();
 await expect(run(saveDraft, ctx, { packId: "core", sourceRevision: "old", expectedDraftRevision: null, values: {}, variants: {} })).rejects.toBeDefined();
 expect(ctx.tables.appearance_drafts).toBeUndefined();
});
test("publish checks actual current revision and preserves concurrent edits", async () => {
 const ctx = site(); const first = await run(snapshot, ctx);
 const changed = { ...first.values, settings: { core: { shop: { cartPanel: "drawer" } } } };
 const second = await run(publish, ctx, { values: changed, expectedRevision: first.revision });
 expect(second.revision).not.toBe(first.revision);
 await expect(run(publish, ctx, { values: first.values, expectedRevision: first.revision })).rejects.toMatchObject({ data: expect.objectContaining({ code: "TEMPLATE_CONFLICT" }) });
 expect((await run(snapshot, ctx)).values).toEqual(changed);
});
test("live publish needs confirmation and promotion checks target website", async () => {
 const ctx = site("live"); const first = await run(snapshot, ctx);
 await expect(run(publish, ctx, { values: first.values, expectedRevision: first.revision })).rejects.toMatchObject({ data: expect.objectContaining({ code: "LIVE_CONFIRMATION_REQUIRED" }) });
 await expect(run(publish, ctx, { values: first.values, expectedRevision: first.revision, confirmLive: true, source: { websiteKey: "other", instanceKey: "other:staging", environmentKind: "staging", revision: "source" } })).rejects.toBeDefined();
 const next = await run(publish, ctx, { values: first.values, expectedRevision: first.revision, confirmLive: true, source: { websiteKey: "shop", instanceKey: "shop:staging", environmentKind: "staging", revision: "source" } });
 expect(next.identity.instanceKey).toBe("shop:live");
});
test("draft save/recovery is private and concurrency checked independently of live data", async () => {
 const ctx = site(); const first = await run(snapshot, ctx);
 const args = { packId: "core", sourceRevision: first.revision, expectedDraftRevision: null, values: { shop: { cartPanel: "drawer" } }, variants: {} };
 const saved = await run(saveDraft, ctx, args);
 expect((await run(getDraft, ctx, { packId: "core" })).values).toEqual(args.values);
 expect((await run(snapshot, ctx)).revision).toBe(first.revision);
 await expect(run(saveDraft, ctx, args)).rejects.toMatchObject({ data: expect.objectContaining({ code: "DRAFT_CONFLICT" }) });
 await expect(run(discardDraft, ctx, { packId: "core", expectedDraftRevision: "stale" })).rejects.toBeDefined();
 await run(discardDraft, ctx, { packId: "core", expectedDraftRevision: saved.revision });
 expect(await run(getDraft, ctx, { packId: "core" })).toBeNull();
});
test("malformed nested settings are rejected before any write", async () => {
 const ctx = site(); const first = await run(snapshot, ctx);
 await expect(run(publish, ctx, { values: { ...first.values, settings: { core: { colors: [] } } }, expectedRevision: first.revision })).rejects.toBeDefined();
 expect((await run(snapshot, ctx)).revision).toBe(first.revision);
});

test("an uncertain publish retry returns the committed snapshot without a second event", async () => {
 const ctx = site(); const first = await run(snapshot, ctx);
 const args = { values: { ...first.values, settings: { core: { colors: { primary: "#abcdef" } } } }, expectedRevision: first.revision };
 const committed = await run(publish, ctx, args);
 const events = ctx.tables.events?.length ?? 0;
 expect(await run(publish, ctx, args)).toEqual(committed);
 expect(ctx.tables.events?.length ?? 0).toBe(events);
});
test("draft reads and updates are isolated by authenticated user", async () => {
 const ctx = site(); const first = await run(snapshot, ctx);
 await run(saveDraft, ctx, { packId: "core", sourceRevision: first.revision, expectedDraftRevision: null, values: { colors: { primary: "#abcdef" } }, variants: {} });
 const other = commerceHarness({ ...ctx.tables, users: [...ctx.tables.users, { _id: "other", authSource: "local", status: "active", roleId: "role", email: "other@example.invalid" }] }, "other");
 expect(await run(getDraft, other, { packId: "core" })).toBeNull();
 await run(saveDraft, other, { packId: "core", sourceRevision: first.revision, expectedDraftRevision: null, values: {}, variants: {} });
 expect(other.tables.appearance_drafts).toHaveLength(2);
});
