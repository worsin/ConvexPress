import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference as ref } from "convex/server";
import schema from "../../schema";
import { encodeComposedDefinition } from "../foundation/composedDefinitions";
import { internalAction } from "../../_generated/server";
import { v } from "convex/values";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/canonicalDocuments.ts": () => import("../../canonicalDocuments"),
  "./convex/canonicalDocuments/aiContext.ts": () => import("../aiContext"),
  "./convex/canonicalDocuments/ai.ts": () => import("../ai"),
  "./convex/blockDefinitions/drafts.ts": () => import("../../blockDefinitions/drafts"),
  "./convex/blockDefinitions/publication.ts": () => import("../../blockDefinitions/publication"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/posts/internals.ts": () => import("../../posts/internals"),
  "./convex/posts/authorCounts.ts": () => import("../../posts/authorCounts"),
  "./convex/syncedBlocks/consumerIndex.ts": () => import("../../syncedBlocks/consumerIndex"),
};
const get = ref<"query">("canonicalDocuments/aiContext:get");
const validate = ref<"query">("canonicalDocuments/aiContext:validateResult");
const apply = ref<"mutation">("canonicalDocuments/aiContext:apply");
const preview = ref<"query">("canonicalDocuments/aiContext:preview");
const scope = { websiteKey: "ai-context", instanceKey: "staging", deploymentOrigin: "https://ai-context.convex.cloud" };
const proposalId = "00000000-0000-4000-8000-000000000001";
const caps = ["blocks.ai", "blocks.compose", "post.create", "post.update", "post.publish", "page.update", "page.publish"];
function definition(version = 1) {
  return { spec: { name: "composed/studio", version, title: `Studio ${version}`, description: "AI custom fixture", category: "text", role: "content", keywords: [], ai: { useFor: "Studio", avoid: "Navigation" }, fields: [{ id: "title", type: "text", default: "Hello", max: 80 }], supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{title}", examples: [{}] }, composition: { version: 1, root: { el: "Heading", bind: "attrs.title" } } };
}
async function fixture(transport?: (args: { schemaJson: string; system: string; prompt: string }) => Promise<string>) {
  const t = convexTest({ schema, modules: { ...modules, ...(transport ? { "./convex/ai/internals.ts": async () => ({ generateStructuredDocument: internalAction({ args: { schemaJson: v.string(), system: v.string(), prompt: v.string() }, returns: v.string(), handler: (_ctx, args) => transport(args) }) }) } : {}) } });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Author", slug: "author", description: "Fixture", level: 10, type: "internal", isDefault: false, isProtected: false, capabilities: caps, pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const fields = { authSource: "local" as const, emailVerified: true, status: "active" as const, roleId: role, createdAt: 1, updatedAt: 1 };
    const user = await ctx.db.insert("users", { ...fields, email: "ai-author@example.invalid" });
    const other = await ctx.db.insert("users", { ...fields, email: "ai-other@example.invalid" });
    const site = await ctx.db.insert("convexpress_siteIdentity", { ...scope, identityKey: "site-identity", environmentKind: "staging", managementOrigin: "https://controller.convex.cloud", siteOrigin: "https://ai-context.convex.site", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    const appearance = await ctx.db.insert("settings", { section: "appearance.template", values: { active: "core", overrides: {}, variants: {}, settings: {} }, legacyAppearanceMigration: { version: 2, migratedAt: 1 }, updatedAt: 1, updatedBy: user });
    const plugins = await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: user });
    const post = await ctx.db.insert("posts", { type: "page", title: "Before AI", slug: "before-ai", content: "", contentMode: "blocks", blocksVersion: 2, blocksRevision: 3, blocks: [], status: "draft", visibility: "public", authorId: user, commentStatus: "closed", createdAt: 1, updatedAt: 1 });
    return { role, user, other, site, post, appearance, plugins };
  });
  const as = (id: string, suffix = "") => t.withIdentity({ subject: id, tokenIdentifier: `https://convexpress-admin.local|${id}${suffix}` });
  const author = as(ids.user), base = { postId: ids.post, expectedRevision: 3, expectedScope: scope };
  const read = () => author.query(get, base);
  const document = () => t.run(ctx => ctx.db.get("posts", ids.post));
  const revisions = () => t.run(ctx => ctx.db.query("revisions").withIndex("by_parent_number", q => q.eq("parentId", ids.post)).take(10));
  const result = { title: "A considered introduction", blocks: [{ name: "core/group", version: 1, attrs: {}, children: [{ name: "core/heading", version: 2, attrs: { text: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Made for you" }] }] } } }] }] };
  const propose = async (fingerprint: string, value: unknown = result) => author.query(validate, { ...base, expectedFingerprint: fingerprint, proposalId, resultJson: JSON.stringify(value) });
  return { t, ids, as, author, base, read, document, revisions, result, propose };
}

test("trusted context binds exact site, page revision, session and active template; read does not write", async () => {
  const f = await fixture(), before = await f.document();
  const first = await f.read(), context = JSON.parse(first.contextJson);
  expect(context.catalog.definitions.scope).toEqual(scope);
  expect(context.document.revision).toBe(3); expect(context.document.title).toBe("Before AI");
  expect(context.catalog.packId).toBe("core"); expect(context.patterns.length).toBeGreaterThan(0);
  expect(context.patterns.every((p: { packId: string }) => p.packId === "core")).toBe(true);
  expect(first.contextJson).not.toContain("ai-author@example.invalid");
  expect(first.contextJson).not.toContain("tokenIdentifier");
  expect((await f.read()).fingerprint).toBe(first.fingerprint);
  expect((await f.as(f.ids.user, "-another-session").query(get, f.base)).fingerprint).not.toBe(first.fingerprint);
  expect(await f.document()).toEqual(before); expect(await f.revisions()).toHaveLength(0);
  for (const args of [{ ...f.base, expectedRevision: 2 }, { ...f.base, expectedRevision: 3.5 }, { ...f.base, expectedScope: { ...scope, instanceKey: "production" } }])
    await expect(f.author.query(get, args)).rejects.toThrow();
  await expect(f.t.query(get, f.base)).rejects.toThrow();
  await expect(f.as(f.ids.other).query(get, f.base)).rejects.toThrow("cannot edit");
});

test("registered canonical AI action sends the full schema, returns nested proposal and refuses delayed authority changes", async () => {
  for (const revoke of [false, true]) {
    let calls = 0;
    const f = await fixture(async args => {
      calls++;
      const tool = JSON.parse(args.schemaJson), prompt = JSON.parse(args.prompt);
      expect(tool.$defs.node.anyOf.length).toBeGreaterThan(80);
      expect(prompt.template).toBe("core"); expect(prompt.catalog.length).toBe(tool.$defs.node.anyOf.length);
      expect(prompt.currentDocument.title).toBe("Before AI");
      expect(args.prompt).not.toContain("synthetic-test-key");
      if (revoke) await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: caps.filter(cap => cap !== "blocks.ai") }));
      return JSON.stringify(f.result);
    });
    // Load the actual action with a synthetic provider transport only; all
    // permission, context, validation and document services remain real.
    const action = f.author.action(ref("canonicalDocuments/ai:generateProposal"), { ...f.base, prompt: "Make a nested introduction" });
    if (revoke) await expect(action).rejects.toThrow();
    else expect((await action).blocks[0].children).toHaveLength(1);
    expect(calls).toBe(1); expect((await f.document())!.blocksRevision).toBe(3); expect(await f.revisions()).toHaveLength(0);
  }
});

test("nested proposal validates without writes and applies once through canonical save/history", async () => {
  const f = await fixture(), initial = await f.read();
  const proposal = await f.propose(initial.fingerprint);
  expect(proposal.blocks[0].children[0].attrs.text.content[0].content[0].text).toBe("Made for you");
  expect(proposal.blocks[0].id).not.toBe(proposal.blocks[0].children[0].id);
  expect((await f.document())!.blocksRevision).toBe(3); expect(await f.revisions()).toHaveLength(0);
  const args = { ...f.base, expectedFingerprint: proposal.fingerprint, title: proposal.title, blocks: proposal.blocks };
  const projected = await f.author.query(preview, args);
  expect(projected.document.revision).toBe(4); expect(projected.document.title).toBe(proposal.title);
  expect(projected.document.blocks).toEqual(proposal.blocks);
  expect(projected.displayLease.expiresAt).toBeGreaterThan(Date.now());
  expect((await f.document())!.blocksRevision).toBe(3); expect(await f.revisions()).toHaveLength(0);
  const receipt = await f.author.mutation(apply, args);
  expect(receipt.revision).toBe(4); expect(receipt.changed).toBe(true);
  expect((await f.document())!.blocks).toEqual(proposal.blocks);
  expect((await f.document())!.title).toBe(proposal.title); expect(await f.revisions()).toHaveLength(1);
  await expect(f.author.mutation(apply, args)).rejects.toThrow("document changed");
  expect(await f.revisions()).toHaveLength(1);
});

test("provider interval and review interval both recheck permission, policy and appearance", async () => {
  for (const change of ["permission", "disabled", "template", "plugins", "status", "revision"] as const) {
    const f = await fixture(), initial = await f.read(), proposal = await f.propose(initial.fingerprint);
    await f.t.run(async ctx => {
      if (change === "permission") await ctx.db.patch("roles", f.ids.role, { capabilities: caps.filter(cap => cap !== "blocks.ai") });
      if (change === "disabled") await ctx.db.insert("settings", { section: "blocks", values: { disabledBlockNames: ["core/heading"] }, updatedBy: f.ids.user, updatedAt: 2 });
      if (change === "template") await ctx.db.patch("settings", f.ids.appearance, { values: { active: "journal", overrides: {}, variants: {}, settings: {} } });
      if (change === "plugins") await ctx.db.patch("settings", f.ids.plugins, { values: { formsEnabled: false, membershipEnabled: false } });
      if (change === "status") await ctx.db.patch("posts", f.ids.post, { status: "private" });
      if (change === "revision") await ctx.db.patch("posts", f.ids.post, { blocksRevision: 4 });
    });
    const before = await f.document();
    await expect(f.propose(initial.fingerprint)).rejects.toThrow();
    await expect(f.author.query(preview, { ...f.base, expectedFingerprint: proposal.fingerprint, title: proposal.title, blocks: proposal.blocks })).rejects.toThrow();
    await expect(f.author.mutation(apply, { ...f.base, expectedFingerprint: proposal.fingerprint, title: proposal.title, blocks: proposal.blocks })).rejects.toThrow();
    expect(await f.document()).toEqual(before); expect(await f.revisions()).toHaveLength(0);
  }
});

test("discovery exposes approved immutable versions, excludes foreign/draft heads and revokes old proposals", async () => {
  const f = await fixture();
  const made = await f.author.mutation(ref("blockDefinitions/drafts:create"), { definitionJson: JSON.stringify(definition()) });
  expect(JSON.parse((await f.read()).contextJson).catalog.definitions.definitions).toHaveLength(0);
  await f.author.mutation(ref("blockDefinitions/publication:setVersionState"), { id: made.id, version: 1, expectedGeneration: 1, expectedDigest: made.digest, enabled: true });
  const approved = await f.read(), context = JSON.parse(approved.contextJson);
  expect(context.catalog.definitions.definitions).toEqual([{ name: "composed/studio", version: 1, digest: made.digest, definitionJson: encodeComposedDefinition(definition()).json }]);
  const proposal = await f.propose(approved.fingerprint, { title: "Studio", blocks: [{ name: "composed/studio", version: 1, attrs: { title: "A custom introduction" } }] });
  await f.author.mutation(ref("blockDefinitions/drafts:save"), { id: made.id, expectedGeneration: 2, definitionJson: JSON.stringify(definition(2)) });
  expect((await f.read()).fingerprint).toBe(approved.fingerprint); // An unrelated draft is not the approved catalog.
  await f.author.mutation(ref("blockDefinitions/publication:setVersionState"), { id: made.id, version: 1, expectedGeneration: 3, expectedDigest: made.digest, enabled: false });
  await expect(f.author.mutation(apply, { ...f.base, expectedFingerprint: proposal.fingerprint, title: proposal.title, blocks: proposal.blocks })).rejects.toThrow("context changed");
  expect(await f.revisions()).toHaveLength(0);
});

test("bad provider output and forged resource selections cannot modify the document", async () => {
  const f = await fixture(), initial = await f.read();
  for (const value of [null, { title: "Bad", blocks: [{ name: "missing/block", version: 1, attrs: {} }] }, { ...f.result, extra: true }, { title: "Bad", blocks: [{ name: "core/heading", version: 2, attrs: {}, id: "model-id" }] }])
    await expect(f.propose(initial.fingerprint, value)).rejects.toThrow("does not satisfy");
  const image = { title: "Image", blocks: [{ name: "core/image", version: 2, attrs: { mediaId: "not-a-site-media-id" } }] };
  await expect(f.propose(initial.fingerprint, image)).rejects.toThrow("does not satisfy");
  const proposal = { ...image, fingerprint: initial.fingerprint, blocks: image.blocks.map(block => ({...block, id: "forged-media"})) };
  await expect(f.author.query(preview, { ...f.base, expectedFingerprint: proposal.fingerprint, title: proposal.title, blocks: proposal.blocks })).rejects.toThrow();
  await expect(f.author.mutation(apply, { ...f.base, expectedFingerprint: proposal.fingerprint, title: proposal.title, blocks: proposal.blocks })).rejects.toThrow();
  expect((await f.document())!.blocksRevision).toBe(3); expect(await f.revisions()).toHaveLength(0);
});

async function resourceFixture(transport?: (args: { schemaJson: string; system: string; prompt: string }) => Promise<string>) {
  const f = await fixture(transport);
  const ids = await f.t.run(async ctx => {
    await ctx.db.patch("settings", f.ids.plugins, { values: { commerceEnabled: true, membershipEnabled: true } });
    await ctx.db.patch("roles", f.ids.role, { capabilities: [...caps, "media.read"] });
    const products = [];
    for (const [i, title] of ["Daybreak roast", "Evening roast", "Highland roast"].entries()) products.push(await ctx.db.insert("commerce_products", {
      title, slug: `roast-${i}`, status: "publish", productType: "simple", authorId: f.ids.user, categoryIds: [], galleryMediaIds: [],
      basePrice: { amount: 1200 + i * 100, currencyCode: "USD" }, trackInventory: false, allowBackorders: false, isVirtual: false, isDownloadable: false,
      rawSourceMeta: "PRIVATE_VENDOR_COST", createdAt: 1, updatedAt: 1,
    }));
    const media = await ctx.db.insert("media", { title: "Studio roasts", slug: "studio-roasts", mediaType: "image", fileName: "studio-roasts.webp", mimeType: "image/webp", fileSize: 512, url: "https://media.example.invalid/secret-token-path.webp", altText: "Three studio roasts", status: "active", uploadedBy: f.ids.user, createdAt: 1, updatedAt: 1 });
    return { products, media };
  });
  const base = { ...f.base, resources: { products: ids.products, media: [ids.media] } };
  return { ...f, resources: ids, resourceBase: base };
}

test("selected resource metadata is authoritative and minimal, and three product prices remain live", async () => {
  const f = await resourceFixture(), context = await f.author.query(get, f.resourceBase), parsed = JSON.parse(context.contextJson);
  expect(parsed.resources.map((item: {id: string}) => item.id)).toEqual([...f.resources.products, f.resources.media]);
  for (const secret of ["PRIVATE_VENDOR_COST", "secret-token-path", "uploadedBy", "basePrice", "storageId"]) expect(context.contextJson).not.toContain(secret);
  const result = { title: "Compare our roasts", blocks: [{ name: "core/group", version: 1, attrs: {}, children: [
    { name: "commerce/product-compare", version: 1, attrs: { products: f.resources.products, attributes: [] } },
    { name: "core/image", version: 2, attrs: { mediaId: f.resources.media } },
  ] }] };
  const proposal = await f.author.query(validate, { ...f.resourceBase, expectedFingerprint: context.fingerprint, proposalId, resultJson: JSON.stringify(result) });
  const args = { ...f.resourceBase, expectedFingerprint: context.fingerprint, title: proposal.title, blocks: proposal.blocks };
  const previewed = await f.author.query(preview, args), comparisonId = proposal.blocks[0].children[0].id;
  expect(previewed.data.dataByBlock[comparisonId].data.items.map((item: {price: {min: number}}) => item.price.min)).toEqual([1200, 1300, 1400]);
  await f.t.run(ctx => ctx.db.patch("commerce_products", f.resources.products[1]!, { basePrice: { amount: 1900, currencyCode: "USD" } }));
  const renewed = await f.author.query(preview, args);
  expect(renewed.data.dataByBlock[comparisonId].data.items[1].price.min).toBe(1900);
  expect((await f.document())!.blocksRevision).toBe(3); expect(await f.revisions()).toHaveLength(0);
  const receipt = await f.author.mutation(apply, args); expect(receipt.revision).toBe(4); expect(await f.revisions()).toHaveLength(1);
});

test("selected resources reject unavailable, foreign, restricted, duplicate and oversized choices", async () => {
  const f = await resourceFixture();
  for (const resources of [ { products: [...f.resources.products, f.resources.products[0]], media: [] },
    { products: Array.from({length: 7}, (_,i) => `product-${i}`), media: [] }, { products: ["foreign-product"], media: [] },
    { products: [], media: Array.from({length: 13}, (_,i) => `media-${i}`) } ])
    await expect(f.author.query(get, {...f.base, resources})).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("commerce_products", f.resources.products[0]!, {status:"draft"}));
  await expect(f.author.query(get, f.resourceBase)).rejects.toThrow("selected resource");
  await f.t.run(async ctx => {
    await ctx.db.patch("commerce_products", f.resources.products[0]!, {status:"publish"});
    await ctx.db.insert("membership_restriction_rules",{resourceType:"product",resourceIdOrKey:f.resources.products[1]!,ruleMode:"allow_only",planIds:[],requiredCapabilities:["private-roasts.read"],teaserMode:"hide",loginRequired:true,createdAt:1,updatedAt:1});
  });
  await expect(f.author.query(get, f.resourceBase)).rejects.toThrow("selected resource");
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, {capabilities:caps}));
  await expect(f.author.query(get, {...f.base,resources:{products:[],media:[f.resources.media]}})).rejects.toThrow();
});

test("provider may use only chosen or existing references, including repeated nested fields", async () => {
  const f = await resourceFixture();
  const base = {...f.base,resources:{products:[f.resources.products[0]!],media:[f.resources.media]}};
  const context = await f.author.query(get,base);
  const compare = (products: string[]) => ({title:"Compare",blocks:[{name:"core/group",version:1,attrs:{},children:[{name:"commerce/product-compare",version:1,attrs:{products}}]}]});
  const propose = (value: unknown) => f.author.query(validate,{...base,expectedFingerprint:context.fingerprint,proposalId,resultJson:JSON.stringify(value)});
  await expect(propose(compare([f.resources.products[1]!]))).rejects.toThrow("does not satisfy");
  expect((await propose(compare([f.resources.products[0]!]))).blocks[0].children).toHaveLength(1);
  // Media IDs cannot be substituted into product slots, even though selected.
  await expect(propose(compare([f.resources.media]))).rejects.toThrow("does not satisfy");
  await f.t.run(ctx => ctx.db.patch("media",f.resources.media,{status:"trashed"}));
  await expect(propose(compare([f.resources.products[0]!]))).rejects.toThrow();
  expect(await f.revisions()).toHaveLength(0);
});

test("registered action supplies selected resources and refuses a resource revoked during generation", async () => {
  for (const revoke of [false,true]) {
    const f = await resourceFixture(async args => {
      const prompt = JSON.parse(args.prompt); expect(prompt.resources).toHaveLength(4);
      expect(args.system).toContain("live resolver blocks"); expect(args.prompt).not.toContain("PRIVATE_VENDOR_COST");
      if (revoke) await f.t.run(ctx => ctx.db.patch("commerce_products",f.resources.products[0]!,{status:"draft"}));
      return JSON.stringify({title:"Our roasts",blocks:[{name:"commerce/product-compare",version:1,attrs:{products:f.resources.products}}]});
    });
    const request = f.author.action(ref("canonicalDocuments/ai:generateProposal"), {...f.resourceBase,prompt:"Compare these three roasts with live prices"});
    if (revoke) await expect(request).rejects.toThrow(); else expect((await request).blocks[0].attrs.products).toEqual(f.resources.products);
    expect(await f.revisions()).toHaveLength(0);
  }
});


test("trusted template styles reach AI validation and a saved styled document survives switching templates", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch("settings", f.ids.appearance, { values: { active: "journal", overrides: {}, variants: {}, settings: {} } }));
  const context = await f.read();
  expect(JSON.parse(context.contextJson).catalog.styles["core/cta-band"]).toEqual(["default", "inset"]);
  const result = { title: "Styled invitation", blocks: [{ name: "core/cta-band", version: 2, attrs: {}, style: "inset" }] };
  const proposal = await f.propose(context.fingerprint, result);
  await f.author.mutation(apply, { ...f.base, expectedFingerprint: context.fingerprint, title: proposal.title, blocks: proposal.blocks });
  expect((await f.document())!.blocks![0].style).toBe("inset");
  await f.t.run(ctx => ctx.db.patch("settings", f.ids.appearance, { values: { active: "core", overrides: {}, variants: {}, settings: {} } }));
  const changed = await f.author.query(get, { ...f.base, expectedRevision: 4 });
  expect(JSON.parse(changed.contextJson).document.blocks[0].style).toBe("inset");
  // Core may offer styles for other blocks; Journal's CTA treatment must no
  // longer be available to a new proposal after switching away from Journal.
  expect(JSON.parse(changed.contextJson).catalog.styles["core/cta-band"]).toBeUndefined();
  await expect(f.author.query(validate, { ...f.base, expectedRevision: 4, expectedFingerprint: changed.fingerprint, proposalId, resultJson: JSON.stringify(result) })).rejects.toThrow();
});
