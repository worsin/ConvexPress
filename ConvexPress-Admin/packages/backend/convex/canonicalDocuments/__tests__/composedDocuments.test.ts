import { expect, test, setSystemTime } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference as ref } from "convex/server";
import schema from "../../schema";
import { canonicalPreviewDocument } from "../foundation/documentContracts";
import { encodeComposedDefinition } from "../foundation/composedDefinitions";
import { MEDIA_REVERSE_EPOCH_VARIABLE } from "../../media/reverseIndexVersion";
import { contactSourceAllowed } from "../contactSource";
import { publishScheduledCanonicalDocument } from "../service";
import { parsePollDefinition, pollDefinitionVersion } from "../foundation/pollContracts";
import { readLeadMagnet } from "../leadMagnet";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/canonicalDocuments.ts": () => import("../../canonicalDocuments"),
  "./convex/blockDefinitions/drafts.ts": () => import("../../blockDefinitions/drafts"),
  "./convex/blockDefinitions/publication.ts": () => import("../../blockDefinitions/publication"),
  "./convex/posts/internals.ts": () => import("../../posts/internals"),
  "./convex/posts/authorCounts.ts": () => import("../../posts/authorCounts"),
  "./convex/syncedBlocks/consumerIndex.ts": () => import("../../syncedBlocks/consumerIndex"),
  "./convex/extensions/events/rsvp.ts": () => import("../../extensions/events/rsvp"),
  "./convex/extensions/forms/polls.ts": () => import("../../extensions/forms/polls"),
  "./convex/leadMagnets/actions.ts": () => import("../../leadMagnets/actions"),
  "./convex/leadMagnets/submission.ts": () => import("../../leadMagnets/submission"),
  "./convex/leadMagnets/delivery.ts": () => import("../../leadMagnets/delivery"),
  "./convex/leadMagnets/queries.ts": () => import("../../leadMagnets/queries"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
const get = ref<"query">("canonicalDocuments:get"), save = ref<"mutation">("canonicalDocuments:save"), restore = ref<"mutation">("canonicalDocuments:restore");
const scope = { websiteKey: "composed-documents", instanceKey: "staging", deploymentOrigin: "https://composed-documents.convex.cloud" };
function definition(version = 1) {
  return {
    spec: { name: "composed/studio", title: `Studio v${version}`, description: "Versioned document fixture", category: "text", role: "content", version,
      keywords: [], ai: { useFor: "Studio introduction", avoid: "Navigation" }, fields: [{ id: "title", type: "text", default: `Default v${version}`, max: 120 }, { id: "photo", type: "media", storage: "id" }],
      supports: { children: true, styles: false, layout: [], anchor: true, visibility: false }, data: { resolver: "site.info", args: {} }, preview: "{title}", examples: [{}] },
    composition: { version: 1, root: { el: "Stack", children: [{ el: "Heading", bind: "attrs.title" }, { el: "Text", bind: "data.name" }, { el: "Slot", props: { name: "children" } }] } },
  };
}
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Editor", slug: "editor", description: "Fixture", level: 80, type: "internal", isDefault: false, isProtected: false, capabilities: ["blocks.compose", "post.create", "post.read", "post.update", "post.publish", "page.update", "page.publish", "revision.restore", "form.create", "form.update"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const user = await ctx.db.insert("users", { authSource: "local", email: "composed-author@example.invalid", emailVerified: true, status: "active", roleId: role, createdAt: 1, updatedAt: 1 });
    const site = await ctx.db.insert("convexpress_siteIdentity", { ...scope, identityKey: "site-identity", environmentKind: "staging", managementOrigin: "https://controller.convex.cloud", siteOrigin: "https://composed-documents.convex.site", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: user });
    await ctx.db.insert("settings", { section: "general", values: { siteTitle: "A real studio" }, updatedAt: 1, updatedBy: user });
    await ctx.db.insert("settings", { section: "appearance.template", values: { active: "core", overrides: {}, variants: {}, settings: {} }, legacyAppearanceMigration: { version: 2, migratedAt: 1 }, updatedAt: 1, updatedBy: user });
    const post = await ctx.db.insert("posts", { type: "page", title: "Studio", slug: "studio", path: "/studio", content: "", status: "draft", visibility: "public", authorId: user, commentStatus: "closed", createdAt: 1, updatedAt: 1 });
    const media = await ctx.db.insert("media", { title: "Studio image", fileName: "studio.png", slug: "studio", url: "https://example.invalid/studio.png", mimeType: "image/png", fileSize: 66, mediaType: "image", status: "active", uploadedBy: user, createdAt: 1, updatedAt: 1 });
    return { user, role, post, media, site };
  });
  const author = t.withIdentity({ subject: ids.user, tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
  const created = await author.mutation(ref("blockDefinitions/drafts:create"), { definitionJson: JSON.stringify(definition()) });
  const blocks = (version = 1) => [{ id: "studio", name: "composed/studio", version, attrs: { title: "Saved studio", photo: ids.media }, children: [{ id: "copy", name: "core/paragraph", version: 2, attrs: {} }] }];
  const read = () => author.query(get, { postId: ids.post });
  const initialize = async (tree: unknown = blocks()) => {
    const initial = await read();
    return author.mutation(ref("canonicalDocuments:initialize"), { postId: ids.post, expectedRevision: initial.document.revision, expectedAuthoringDigest: initial.document.authoringDigest, title: "Studio", blocks: tree });
  };
  const revisions = () => t.run(ctx => ctx.db.query("revisions").withIndex("by_parent_number", q => q.eq("parentId", ids.post)).take(20));
  return { t, ids, author, created, blocks, read, initialize, revisions };
}

test("registered custom document initialize/save/reopen/restore pins immutable versions and clears the last definition", async () => {
  const f = await fixture(); const first = await f.initialize();
  expect(first.revision).toBe(1);
  const original = await f.read();
  expect(original.document.digest).toBe(first.digest);
  expect(original.document.composedDefinitions.definitions[0].version).toBe(1);
  expect(original.resources.media[f.ids.media].src).toBe("https://example.invalid/studio.png");
  expect(JSON.stringify(original.data)).toContain("A real studio");
  expect(canonicalPreviewDocument(original).document.digest).toBe(first.digest);
  await f.author.mutation(ref("blockDefinitions/drafts:save"), { id: f.created.id, expectedGeneration: 1, definitionJson: JSON.stringify(definition(2)) });
  expect((await f.read()).document.composedDefinitions).toEqual(original.document.composedDefinitions);
  const second = await f.author.mutation(save, { postId: f.ids.post, expectedRevision: 1, title: "Studio two", blocks: f.blocks(2) });
  expect(second.revision).toBe(2); expect(second.digest).not.toBe(first.digest);
  expect((await f.read()).document.composedDefinitions.definitions[0].version).toBe(2);
  const versionOne = (await f.revisions()).find(row => row.blocksRevision === 1)!;
  expect(versionOne.composedDefinitions).toEqual(original.document.composedDefinitions);
  const restored = await f.author.mutation(restore, { postId: f.ids.post, expectedRevision: 2, revisionId: versionOne._id });
  expect(restored.revision).toBe(3); expect(restored.digest).toBe(first.digest);
  const removed = await f.author.mutation(save, { postId: f.ids.post, expectedRevision: 3, title: "Library page", blocks: [{ id: "text", name: "core/paragraph", version: 2, attrs: {} }] });
  expect(removed.revision).toBe(4);
  expect((await f.read()).document.composedDefinitions).toBeUndefined();
  expect((await f.t.run(ctx => ctx.db.get("posts", f.ids.post)))!.composedDefinitions).toBeUndefined();
  const returned = await f.author.mutation(restore, { postId: f.ids.post, expectedRevision: 4, revisionId: versionOne._id });
  expect(returned.revision).toBe(5); expect((await f.read()).document.composedDefinitions).toEqual(original.document.composedDefinitions);
  await expect(f.author.mutation(save, { postId: f.ids.post, expectedRevision: 1, title: "Stale", blocks: f.blocks() })).rejects.toThrow("CONFLICT");
});

test("custom save refusals preserve document/history and recheck identity, schema and media on no-op saves", async () => {
  const f = await fixture(); await f.initialize();
  const before = await f.read(), history = await f.revisions();
  const write = (blocks: unknown = f.blocks()) => f.author.mutation(save, { postId: f.ids.post, expectedRevision: 1, title: "Studio", blocks });
  const noOp = await write(); expect(noOp.changed).toBe(false); expect(noOp.revision).toBe(1);
  await expect(write(f.blocks(17))).rejects.toThrow("unavailable");
  await expect(write([{ ...f.blocks()[0], attrs: { title: "Invalid", unexpected: true } }])).rejects.toThrow();
  await expect(f.t.mutation(save, { postId: f.ids.post, expectedRevision: 1, title: "Anonymous", blocks: f.blocks() })).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("media", f.ids.media, { status: "trashed" }));
  await expect(write()).rejects.toThrow("unavailable");
  await f.t.run(ctx => ctx.db.patch("media", f.ids.media, { status: "active" }));
  await f.t.run(ctx => ctx.db.patch("convexpress_siteIdentity", f.ids.site, { deploymentOrigin: "https://foreign.convex.cloud" }));
  await expect(write()).rejects.toThrow("unavailable");
  await f.t.run(ctx => ctx.db.patch("convexpress_siteIdentity", f.ids.site, { deploymentOrigin: scope.deploymentOrigin }));
  expect((await f.read()).document).toEqual(before.document); expect(await f.revisions()).toEqual(history);
});

test("forged current and revision definition snapshots cannot execute through registered reads or restores", async () => {
  const f = await fixture(); await f.initialize();
  await f.author.mutation(save, { postId: f.ids.post, expectedRevision: 1, title: "Changed", blocks: f.blocks() });
  const valid = await f.read(), revision = (await f.revisions()).find(row => row.blocksRevision === 1)!;
  const forged = structuredClone(valid.document.composedDefinitions);
  const replacement = definition(); replacement.spec.title = "Forged schema";
  const encoded = encodeComposedDefinition(replacement);
  forged.definitions[0] = { name: "composed/studio", version: 1, digest: encoded.digest, definitionJson: encoded.json };
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { composedDefinitions: forged }));
  await expect(f.read()).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { composedDefinitions: valid.document.composedDefinitions }));
  await f.t.run(ctx => ctx.db.patch("revisions", revision._id, { composedDefinitions: forged }));
  await expect(f.author.mutation(restore, { postId: f.ids.post, expectedRevision: 2, revisionId: revision._id })).rejects.toThrow();
  expect((await f.read()).document).toEqual(valid.document);
});

test("custom draft parents retain nested contact-form identity and cannot bypass publication review", async () => {
  const f = await fixture();
  const contact = { id: "contact", name: "core/contact-form", version: 2, attrs: { fields: [{ name: "email", label: "Email", type: "email", required: true }] } };
  const blocks = [{ ...f.blocks()[0], children: [contact] }];
  await f.initialize(blocks);
  const forms = () => f.t.run(ctx => ctx.db.query("forms").withIndex("by_contact_source", q => q.eq("contactPostId", f.ids.post)).take(5));
  const first = (await forms())[0]!; expect(first.contactBlockId).toBe("contact");
  await f.author.mutation(save, { postId: f.ids.post, expectedRevision: 1, title: "Studio", blocks });
  expect((await forms())[0]!._id).toBe(first._id);
  await expect(f.author.mutation(ref("canonicalDocuments:setPublication"), { postId: f.ids.post, expectedRevision: 1, status: "publish" })).rejects.toThrow();
  expect((await f.t.run(ctx => ctx.db.get("posts", f.ids.post)))!.status).toBe("draft");
  expect(await f.t.query(ref("canonicalDocuments:getForRender"), { postId: f.ids.post })).toBeNull();
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { status: "publish" }));
  await expect(f.author.mutation(save, { postId: f.ids.post, expectedRevision: 1, title: "Unreviewed", blocks })).rejects.toThrow("DEFINITION_NOT_ACTIVE");
  expect((await f.t.run(ctx => ctx.db.get("posts", f.ids.post)))!.title).toBe("Studio");
});

test("definition defaults and document revisions retain media edges after the current custom block is removed", async () => {
  const previousEpoch = process.env[MEDIA_REVERSE_EPOCH_VARIABLE];
  process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = "composed-draft-media-fixture";
  try {
    const f = await fixture(), next = definition(2);
    Object.assign(next.spec.fields.find(field => field.id === "photo")!, { default: f.ids.media });
    await f.author.mutation(ref("blockDefinitions/drafts:save"), { id: f.created.id, expectedGeneration: 1, definitionJson: JSON.stringify(next) });
    await f.initialize(f.blocks(2));
    const edges = () => f.t.run(ctx => ctx.db.query("media_reference_edges").withIndex("by_media_generation", q => q.eq("mediaId", f.ids.media)).take(20));
    expect((await edges()).some(edge => edge.ownerTable === "posts" && edge.ownerId === f.ids.post)).toBe(true);
    expect((await edges()).some(edge => edge.ownerTable === "blockDefinitionVersions")).toBe(true);
    await f.author.mutation(save, { postId: f.ids.post, expectedRevision: 1, title: "Empty", blocks: [] });
    const retained = await edges();
    expect(retained.some(edge => edge.ownerTable === "posts")).toBe(false);
    expect(retained.some(edge => edge.ownerTable === "revisions")).toBe(true);
    expect(retained.some(edge => edge.ownerTable === "blockDefinitionVersions")).toBe(true);
    await f.t.run(ctx => ctx.db.patch("media", f.ids.media, { status: "trashed" }));
    const rejected = definition(3); Object.assign(rejected.spec.fields.find(field => field.id === "photo")!, { default: f.ids.media });
    await expect(f.author.mutation(ref("blockDefinitions/drafts:save"), { id: f.created.id, expectedGeneration: 2, definitionJson: JSON.stringify(rejected) })).rejects.toThrow("unavailable");
    const head = await f.t.run(ctx => ctx.db.get("blockDefinitions", f.created.id));
    expect(head!.generation).toBe(2); expect(head!.lastVersion).toBe(2);
  } finally {
    if (previousEpoch === undefined) delete process.env[MEDIA_REVERSE_EPOCH_VARIABLE]; else process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = previousEpoch;
  }
});

test("approved custom pages publish with nested forms, retain old versions after edits and withdraw after revocation", async () => {
  const f = await fixture();
  const blocks = [{ ...f.blocks()[0], children: [{ id: "contact", name: "core/contact-form", version: 2, attrs: { fields: [{ name: "email", label: "Email", type: "email", required: true }] } }] }];
  await f.initialize(blocks);
  const approve = ref<"mutation">("blockDefinitions/publication:setVersionState");
  await f.author.mutation(approve, { id: f.created.id, version: 1, expectedGeneration: 1, expectedDigest: f.created.digest, enabled: true });
  const publication = await f.author.mutation(ref("canonicalDocuments:setPublication"), { postId: f.ids.post, expectedRevision: 1, status: "publish" });
  expect(publication.revision).toBe(2);
  const render = () => f.t.query(ref("canonicalDocuments:getForRender"), { postId: f.ids.post });
  const publicPage = await render(); expect(publicPage.state).toBe("ready");
  expect(publicPage.document.composedDefinitions.definitions[0].version).toBe(1);
  const form = await f.t.run(ctx => ctx.db.query("forms").withIndex("by_contact_source", q => q.eq("contactPostId", f.ids.post).eq("contactBlockId", "contact")).unique());
  expect(form).not.toBeNull(); expect(await f.t.run(ctx => contactSourceAllowed(ctx, form!))).toBe(true);
  expect(JSON.stringify(publicPage.data)).toContain(form!._id);
  await f.author.mutation(ref("blockDefinitions/drafts:save"), { id: f.created.id, expectedGeneration: 2, definitionJson: JSON.stringify(definition(2)) });
  expect((await render()).document.digest).toBe(publicPage.document.digest);
  const before = await f.revisions();
  await expect(f.author.mutation(save, { postId: f.ids.post, expectedRevision: 2, title: "Unapproved v2", blocks: f.blocks(2) })).rejects.toThrow("DEFINITION_NOT_ACTIVE");
  expect(await f.revisions()).toEqual(before); expect((await render()).document.digest).toBe(publicPage.document.digest);
  await f.author.mutation(approve, { id: f.created.id, version: 1, expectedGeneration: 3, expectedDigest: f.created.digest, enabled: false });
  await expect(render()).rejects.toThrow("DEFINITION_NOT_ACTIVE");
  expect(await f.t.run(ctx => contactSourceAllowed(ctx, form!))).toBe(false);
  const withdrawn = await f.author.mutation(ref("canonicalDocuments:setPublication"), { postId: f.ids.post, expectedRevision: 2, status: "draft" });
  expect(withdrawn.revision).toBe(3); expect(await render()).toBeNull();
  expect((await f.read()).document.composedDefinitions.definitions[0].version).toBe(1);
});

test("public projection checks approval only for visible custom versions and omits hidden definitions", async () => {
  const f = await fixture(), approve = ref<"mutation">("blockDefinitions/publication:setVersionState");
  await f.author.mutation(approve, { id: f.created.id, version: 1, expectedGeneration: 1, expectedDigest: f.created.digest, enabled: true });
  const second = await f.author.mutation(ref("blockDefinitions/drafts:save"), { id: f.created.id, expectedGeneration: 2, definitionJson: JSON.stringify(definition(2)) });
  await f.author.mutation(approve, { id: f.created.id, version: 2, expectedGeneration: 3, expectedDigest: second.digest, enabled: true });
  const privateBlock = { ...f.blocks(2)[0], id: "private-version", attrs: { ...f.blocks(2)[0].attrs, title: "PRIVATE_VERSION_COPY" }, children: [] };
  await f.initialize([...f.blocks(), privateBlock]);
  await f.t.run(async ctx => {
    const plugins = (await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique())!;
    await ctx.db.patch("settings", plugins._id, { values: { formsEnabled: true, membershipEnabled: true } });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "block", resourceIdOrKey: "private-version", ruleMode: "allow_only", planIds: [], loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1 });
  });
  await f.author.mutation(ref("canonicalDocuments:setPublication"), { postId: f.ids.post, expectedRevision: 1, status: "publish" });
  await f.author.mutation(approve, { id: f.created.id, version: 2, expectedGeneration: 4, expectedDigest: second.digest, enabled: false });
  const result = await f.t.query(ref("canonicalDocuments:getForRender"), { postId: f.ids.post });
  expect(result.state).toBe("ready"); expect(result.document.composedDefinitions.definitions.map((value: { version: number }) => value.version)).toEqual([1]);
  expect(JSON.stringify(result)).not.toContain("PRIVATE_VERSION_COPY"); expect(JSON.stringify(result)).not.toContain("Default v2");
});

test("scheduled custom publication rechecks approval without impersonating the interactive author", async () => {
  const f = await fixture(), approve = ref<"mutation">("blockDefinitions/publication:setVersionState");
  await f.initialize();
  const deadline = Date.now() + 60000;
  await f.author.mutation(approve, { id: f.created.id, version: 1, expectedGeneration: 1, expectedDigest: f.created.digest, enabled: true });
  await f.author.mutation(ref("canonicalDocuments:setPublication"), { postId: f.ids.post, expectedRevision: 1, status: "future", scheduledAt: deadline });
  await f.author.mutation(approve, { id: f.created.id, version: 1, expectedGeneration: 2, expectedDigest: f.created.digest, enabled: false });
  const publish = () => f.t.run(async ctx => publishScheduledCanonicalDocument(ctx, (await ctx.db.get("posts", f.ids.post))!, deadline));
  try {
    setSystemTime(deadline + 1);
    await expect(publish()).rejects.toThrow("not approved");
    expect((await f.t.run(ctx => ctx.db.get("posts", f.ids.post)))!.status).toBe("future");
    await f.author.mutation(approve, { id: f.created.id, version: 1, expectedGeneration: 3, expectedDigest: f.created.digest, enabled: true });
    await publish();
    expect((await f.t.run(ctx => ctx.db.get("posts", f.ids.post)))!.status).toBe("publish");
    expect((await f.t.query(ref("canonicalDocuments:getForRender"), { postId: f.ids.post })).state).toBe("ready");
  } finally { setSystemTime(); }
});

test("custom parent revocation closes registered poll reads and votes without changing existing votes", async () => {
  const f = await fixture(), approve = ref<"mutation">("blockDefinitions/publication:setVersionState");
  const attrs = parsePollDefinition({ question: "Next workshop?", options: [{ key: "wood", label: "Wood" }, { key: "clay", label: "Clay" }] });
  await f.initialize([{ ...f.blocks()[0], children: [{ id: "poll", name: "core/poll", version: 1, attrs }] }]);
  await f.author.mutation(approve, { id: f.created.id, version: 1, expectedGeneration: 1, expectedDigest: f.created.digest, enabled: true });
  await f.author.mutation(ref("canonicalDocuments:setPublication"), { postId: f.ids.post, expectedRevision: 1, status: "publish" });
  const target = { postId: f.ids.post, blockId: "poll", visitorToken: "a".repeat(64) };
  const read = () => f.t.query(ref("extensions/forms/polls:get"), target);
  const vote = (visitorToken = target.visitorToken) => f.t.mutation(ref("extensions/forms/polls:vote"), { ...target, visitorToken, definitionVersion: pollDefinitionVersion(attrs), optionKey: "wood" });
  expect(await read()).toMatchObject({ total: 0 });
  await vote(); expect(await read()).toMatchObject({ total: 1, votedKey: "wood" });
  const before = await f.t.run(ctx => ctx.db.query("form_poll_votes").take(5));
  await f.author.mutation(approve, { id: f.created.id, version: 1, expectedGeneration: 2, expectedDigest: f.created.digest, enabled: false });
  expect(await read()).toBeNull(); await expect(vote("b".repeat(64))).rejects.toThrow();
  expect(await f.t.run(ctx => ctx.db.query("form_poll_votes").take(5))).toEqual(before);
});

test("custom lead magnets bind saved previews and recheck parent approval for issued download leases", async () => {
  const f = await fixture(), approve = ref<"mutation">("blockDefinitions/publication:setVersionState");
  const asset = await f.t.run(async ctx => {
    const storage = await ctx.storage.store(new Blob(["REAL GUIDE BYTES"], { type: "application/pdf" }));
    const media = await ctx.db.insert("media", { title: "Guide", fileName: "guide.pdf", slug: "guide", url: "https://example.invalid/guide.pdf", mimeType: "application/pdf", fileSize: 16, mediaType: "document", storageId: storage, status: "active", uploadedBy: f.ids.user, createdAt: 1, updatedAt: 1 });
    const list = await ctx.db.insert("mailingLists", { websiteKey: scope.websiteKey, instanceKey: scope.instanceKey, name: "Studio notes", description: "Private notes", consentText: "Send occasional studio news. Unsubscribe at any time.", privacyUrl: "/privacy", status: "active", revision: 1, createdBy: f.ids.user, updatedBy: f.ids.user, createdAt: 1, updatedAt: 1 });
    return { media, list };
  });
  await f.initialize([{ ...f.blocks()[0], children: [{ id: "guide", name: "core/lead-magnet", version: 1, attrs: { title: "Studio guide", file: { id: asset.media }, list: asset.list } }] }]);
  await f.author.mutation(approve, { id: f.created.id, version: 1, expectedGeneration: 1, expectedDigest: f.created.digest, enabled: true });
  await f.author.mutation(ref("canonicalDocuments:setPublication"), { postId: f.ids.post, expectedRevision: 1, status: "publish" });
  const target = { postId: f.ids.post, blockId: "guide" };
  const offer = await f.t.query(ref("leadMagnets/queries:offer"), target);
  expect(offer.file.bytes).toBe(16);
  const preview = (unsaved: boolean) => f.t.run(async ctx => {
    const post = (await ctx.db.get("posts", f.ids.post))!;
    const tree = structuredClone(post.blocks) as ReturnType<typeof f.blocks>;
    if (unsaved) tree[0]!.attrs.title = "Unsaved custom title";
    return readLeadMagnet(ctx, { blockId: "guide" }, { document: post, tree }, undefined, undefined, { scope, definitions: post.composedDefinitions! });
  });
  expect((await preview(false)).offer?.digest).toBe(offer.digest);
  expect((await preview(true)).offer).toBeNull();
  const publicPage = await f.t.query(ref("canonicalDocuments:getForRender"), { postId: f.ids.post });
  expect(JSON.stringify(publicPage.data)).toContain(offer.digest);
  const args = { ...target, offerDigest: offer.digest, email: "reader@example.invalid", marketingConsent: false, requestId: "composed-request-0001", secret: "a".repeat(64), startedAt: Date.now() - 3000, honeypot: "" };
  const download = await f.t.action(ref("leadMagnets/actions:requestDownload"), args);
  expect(download.fileSize).toBe(16);
  await f.author.mutation(approve, { id: f.created.id, version: 1, expectedGeneration: 2, expectedDigest: f.created.digest, enabled: false });
  expect(await f.t.query(ref("leadMagnets/queries:offer"), target)).toBeNull();
  await expect(f.t.query(ref("leadMagnets/delivery:readLease"), { leaseId: download.leaseId, secret: args.secret, requestTime: Date.now() })).rejects.toThrow();
  await expect(f.t.action(ref("leadMagnets/actions:requestDownload"), { ...args, requestId: "composed-request-0002" })).rejects.toThrow();
});

test("custom event registrations resolve on the public page and stop accepting guests after parent revocation", async () => {
  const f = await fixture(), approve = ref<"mutation">("blockDefinitions/publication:setVersionState");
  const event = await f.t.run(async ctx => {
    const plugins = (await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique())!;
    await ctx.db.patch("settings", plugins._id, { values: { formsEnabled: true, eventsEnabled: true, membershipEnabled: false } });
    const startsAt = Date.now() + 86400000;
    return ctx.db.insert("extension_events", { title: "Studio morning", slug: "studio-morning", description: "A morning in the studio", startsAt, endsAt: startsAt + 3600000, timeZone: "America/Denver", venue: "Studio", venueAddress: "", status: "published", rsvp: { mode: "guests", capacity: 2, closesAt: null }, createdBy: f.ids.user, createdAt: 1, updatedAt: 1 });
  });
  await f.initialize([{ ...f.blocks()[0], children: [{ id: "rsvp", name: "core/event-rsvp", version: 1, attrs: { event } }] }]);
  await f.author.mutation(approve, { id: f.created.id, version: 1, expectedGeneration: 1, expectedDigest: f.created.digest, enabled: true });
  await f.author.mutation(ref("canonicalDocuments:setPublication"), { postId: f.ids.post, expectedRevision: 1, status: "publish" });
  const target = { postId: f.ids.post, blockId: "rsvp", instanceKey: scope.instanceKey, visitorToken: "a".repeat(64) };
  const read = () => f.t.query(ref("extensions/events/rsvp:get"), target);
  const initial = await read(); expect(initial.eventId).toBe(event);
  const publicPage = await f.t.query(ref("canonicalDocuments:getForRender"), { postId: f.ids.post });
  expect(JSON.stringify(publicPage.data)).toContain(initial.definitionVersion);
  const args = { ...target, operation: "register", requestKey: "composed-rsvp-0001", definitionVersion: initial.definitionVersion, expectedRevision: 0, contact: { name: "Guest", email: "guest@example.invalid" } };
  await f.t.mutation(ref("extensions/events/rsvp:submit"), args);
  expect((await read()).registration.status).toBe("confirmed");
  const before = await f.t.run(ctx => ctx.db.query("event_rsvp_entries").take(5));
  await f.author.mutation(approve, { id: f.created.id, version: 1, expectedGeneration: 2, expectedDigest: f.created.digest, enabled: false });
  expect(await read()).toBeNull();
  await expect(f.t.mutation(ref("extensions/events/rsvp:submit"), { ...args, requestKey: "composed-rsvp-0002", visitorToken: "b".repeat(64) })).rejects.toThrow();
  expect(await f.t.run(ctx => ctx.db.query("event_rsvp_entries").take(5))).toEqual(before);
});

test("bounded reusable-index rebuild accepts ordinary custom pages without changing their content", async () => {
  const oldEpoch = process.env[MEDIA_REVERSE_EPOCH_VARIABLE];
  process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = "custom-editor-index-fixture";
  try {
    const f = await fixture(); await f.initialize();
    await f.t.run(async ctx => {
      const role = (await ctx.db.get("roles", f.ids.role))!;
      await ctx.db.patch("roles", f.ids.role, { capabilities: [...role.capabilities, "manage_options"] });
    });
    const before = (await f.read()).document;
    let progress = await f.author.mutation(ref("syncedBlocks/consumerIndex:begin"), {});
    for (let index = 0; index < 20 && progress.status === "building"; index++)
      progress = await f.author.mutation(ref("syncedBlocks/consumerIndex:step"), { generation: progress.generation, expectedSequence: progress.sequence });
    expect(progress.status).toBe("ready");
    expect((await f.read()).document).toEqual(before);
    expect(await f.t.run(ctx => ctx.db.query("syncedBlockConsumers").take(5))).toEqual([]);
  } finally {
    if (oldEpoch === undefined) delete process.env[MEDIA_REVERSE_EPOCH_VARIABLE]; else process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = oldEpoch;
  }
});

test("registered mixed custom/reusable save, reopen and restore retain pinned source and definition versions", async () => {
  const oldEpoch = process.env[MEDIA_REVERSE_EPOCH_VARIABLE];
  process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = "mixed-editor-index-fixture";
  try {
  const f = await fixture();
  await f.initialize();
  await f.t.run(async ctx => { const role = (await ctx.db.get("roles",f.ids.role))!; await ctx.db.patch("roles",f.ids.role,{capabilities:[...role.capabilities,"manage_options"]}); });
  let progress = await f.author.mutation(ref("syncedBlocks/consumerIndex:begin"), {});
  for(let i=0;i<20 && progress.status==="building";i++) progress=await f.author.mutation(ref("syncedBlocks/consumerIndex:step"),{generation:progress.generation,expectedSequence:progress.sequence});
  expect(progress.status).toBe("ready");
  const { syncedContentDigest } = await import("../foundation/syncedContent");
  const body = [{ id: "shared", name: "core/contact-form", version: 2, attrs: { fields: [{ name: "email", label: "Email", type: "email", required: true }] } }];
  const source = await f.t.run(async ctx => {
    const id = await ctx.db.insert("syncedBlocks", { ...scope, title:"Shared", generation:2, lastRevision:1, publishedRevision:1, createdBy:f.ids.user, updatedBy:f.ids.user, createdAt:1, updatedAt:1 });
    await ctx.db.insert("syncedBlockRevisions", {syncedBlockId:id, revision:1, title:"Shared", blocks:body, digest:syncedContentDigest("Shared",body), createdBy:f.ids.user, createdAt:1, publishedAt:1});
    return id;
  });
  const reference = {id:"reusable",name:"core/synced",version:1,attrs:{syncedBlock:source,revisionPolicy:"pinned",revision:1}};
  const tree = [{...f.blocks()[0],children:[reference]}];
  await f.author.mutation(save,{postId:f.ids.post,expectedRevision:1,title:"Studio",blocks:tree});
  const first=await f.read();
  expect(first.document.blocks[0].children[0].attrs.revision).toBe(1);
  expect(first.document.composedDefinitions.definitions[0].version).toBe(1);
  expect(first.synced.revisions).toHaveLength(1);
  const second=await f.author.mutation(save,{postId:f.ids.post,expectedRevision:2,title:"Mixed edited",blocks:tree});
  expect(second.revision).toBe(3);
  const revision=(await f.revisions()).find(row=>row.blocksRevision===2)!;
  await f.author.mutation(restore,{postId:f.ids.post,expectedRevision:3,revisionId:revision._id});
  const restored=await f.read();
  expect(restored.document.revision).toBe(4);
  expect(restored.document.blocks).toEqual(first.document.blocks);
  expect(restored.document.composedDefinitions).toEqual(first.document.composedDefinitions);
  expect(restored.synced).toEqual(first.synced);
  // Rebuilding after the mixed page is persisted must retain its dependencies.
  process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = "mixed-editor-index-rebuild";
  progress = await f.author.mutation(ref("syncedBlocks/consumerIndex:begin"), {});
  for (let i = 0; i < 30 && progress.status === "building"; i++) progress = await f.author.mutation(ref("syncedBlocks/consumerIndex:step"), { generation: progress.generation, expectedSequence: progress.sequence });
  expect(progress.status).toBe("ready");
  const form = await f.t.run(ctx => ctx.db.query("forms").withIndex("by_contact_source", q => q.eq("contactPostId", f.ids.post)).unique());
  expect(form).not.toBeNull();
  expect(await f.t.run(ctx => contactSourceAllowed(ctx, form!))).toBe(false);
  const approval = ref("blockDefinitions/publication:setVersionState");
  await f.author.mutation(approval, { id: f.created.id, version: 1, expectedGeneration: 1, expectedDigest: f.created.digest, enabled: true });
  await f.author.mutation(ref("canonicalDocuments:setPublication"), { postId: f.ids.post, expectedRevision: 4, status: "publish" });
  const publicPage = await f.t.query(ref("canonicalDocuments:getForRender"), { postId: f.ids.post });
  expect(publicPage.state).toBe("ready");
  expect(publicPage.synced.revisions).toHaveLength(1);
  expect(await f.t.run(ctx => contactSourceAllowed(ctx, form!))).toBe(true);
  await f.author.mutation(approval, { id: f.created.id, version: 1, expectedGeneration: 2, expectedDigest: f.created.digest, enabled: false });
  expect(await f.t.run(ctx => contactSourceAllowed(ctx, form!))).toBe(false);

  } finally { if(oldEpoch===undefined) delete process.env[MEDIA_REVERSE_EPOCH_VARIABLE]; else process.env[MEDIA_REVERSE_EPOCH_VARIABLE]=oldEpoch; }
});
