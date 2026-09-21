import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference as ref } from "convex/server";
import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import schema from "../../schema";
import { encodeComposedDefinition } from "../../canonicalDocuments/foundation/composedDefinitions";
import { resolverArgs } from "../../canonicalDocuments/foundation/contracts";
import { composeProposalSchema, resolverAuthoringCatalog } from "../composeSchema";
import { assertAiResolverReferences } from "../composeReferences";

const modules = {
  "./convex/blockDefinitions/composeResources.ts": () => import("../composeResources"),
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/blockDefinitions/composeContext.ts": () => import("../composeContext"),
  "./convex/blockDefinitions/ai.ts": () => import("../ai"),
  "./convex/blockDefinitions/drafts.ts": () => import("../drafts"),
  "./convex/blockDefinitions/publication.ts": () => import("../publication"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
const get = ref<"query">("blockDefinitions/composeContext:get"), validate = ref<"query">("blockDefinitions/composeContext:validateResult");
const create = ref<"mutation">("blockDefinitions/composeContext:createDraft"), compose = ref<"action">("blockDefinitions/ai:compose");
const caps = ["blocks.ai", "blocks.compose", "post.create", "post.read", "post.update", "post.publish"];
const scope = { websiteKey: "compose-test", instanceKey: "staging", deploymentOrigin: "https://compose.convex.cloud" };
const name = "composed/field-notes-grid";
function definition(blockName = name) {
  return encodeComposedDefinition({
    spec: { name: blockName, title: "Field notes", description: "An editable grid of field notes", category: "text", role: "content", version: 1,
      keywords: ["notes"], ai: { useFor: "Introducing ideas", avoid: "Navigation" },
      fields: [{ id: "title", title: "Heading", type: "text", default: "Good ideas, carefully made", max: 160 },
        { id: "items", title: "Notes", type: "repeater", min: 1, max: 6, fields: [{ id: "heading", type: "text", required: true }, { id: "body", type: "text", required: true }], default: [{ heading: "Considered", body: "Room for what matters." }, { heading: "Useful", body: "Made to be used." }] }],
      supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{title}", examples: [{}] },
    composition: { version: 1, root: { el: "Stack", props: { gap: "lg" }, children: [
      { el: "Heading", props: { level: 2 }, bind: "attrs.title" },
      { el: "Grid", props: { columns: { base: 1, md: 2 }, gap: "lg" }, each: "attrs.items", as: "item", children: [
        { el: "Card", props: { variant: "outline", padding: "spacious" }, children: [
          { el: "Heading", props: { level: 3 }, bind: "item.heading" }, { el: "Text", bind: "item.body" },
        ] },
      ] },
    ] } },
  });
}

async function fixture(transport?: (args: { schemaJson: string; system: string; prompt: string }) => Promise<string>) {
  const t = convexTest({ schema, modules: { ...modules, ...(transport ? { "./convex/ai/internals.ts": async () => ({ generateStructuredDocument: internalAction({ args: { schemaJson: v.string(), system: v.string(), prompt: v.string() }, returns: v.string(), handler: (_ctx, args) => transport(args) }) }) } : {}) } });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Author", slug: "author", description: "Fixture", level: 10, type: "internal", isDefault: false, isProtected: false, capabilities: caps, pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const fields = { authSource: "local" as const, emailVerified: true, status: "active" as const, roleId: role, createdAt: 1, updatedAt: 1 };
    const user = await ctx.db.insert("users", { ...fields, email: "compose@example.invalid" });
    const other = await ctx.db.insert("users", { ...fields, email: "other@example.invalid" });
    const site = await ctx.db.insert("convexpress_siteIdentity", { ...scope, identityKey: "site-identity", environmentKind: "staging", managementOrigin: "https://controller.convex.cloud", siteOrigin: "https://compose.convex.site", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    const appearance = await ctx.db.insert("settings", { section: "appearance.template", values: { active: "core", overrides: {}, variants: {}, settings: {} }, legacyAppearanceMigration: { version: 2, migratedAt: 1 }, updatedAt: 1, updatedBy: user });
    const plugins = await ctx.db.insert("settings", { section: "plugins", values: { commerceEnabled: false }, updatedAt: 1, updatedBy: user });
    return { role, user, other, site, appearance, plugins };
  });
  const as = (user: string, suffix = "") => t.withIdentity({ subject: user, tokenIdentifier: `https://convexpress-admin.local|${user}${suffix}` });
  const author = as(ids.user), base = { name, packId: "core", expectedScope: scope };
  const counts = () => t.run(async ctx => ({ heads: (await ctx.db.query("blockDefinitions").take(100)).length, versions: (await ctx.db.query("blockDefinitionVersions").take(100)).length, approvals: (await ctx.db.query("blockDefinitionApprovals").take(100)).length, pages: (await ctx.db.query("posts").take(100)).length }));
  return { t, ids, as, author, base, counts };
}

test("full field/primitive schema has resolved recursive references and every installed resolver can describe its IO", () => {
  const schema = composeProposalSchema(name, ["content.posts"]);
  expect(schema.required).toEqual(["spec", "composition"]);
  expect(schema.properties.spec.properties?.name).toEqual({ type: "string", const: name });
  expect(schema.properties.spec.properties).not.toHaveProperty("migration");
  expect(schema.properties.spec.properties).not.toHaveProperty("treatments");
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    if ("$ref" in value) {
      const parts = String(value.$ref).slice(2).split("/");
      let target: unknown = schema;
      for (const part of parts) target = (target as Record<string, unknown>)?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
      expect(target).toBeDefined();
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(schema);
  expect(resolverAuthoringCatalog(Object.keys(resolverArgs))).toHaveLength(Object.keys(resolverArgs).length);
  expect(composeProposalSchema(name, []).properties.spec.properties?.data).toEqual({ type: "null" });
});

test("real action pipeline returns a nested editable proposal without writes; reviewed creation writes once as a draft", async () => {
  let calls = 0;
  const f = await fixture(async args => {
    calls++;const prompt = JSON.parse(args.prompt), schema = JSON.parse(args.schemaJson);
    expect(prompt.context.name).toBe(name);expect(prompt.context.template.design).toContain("# Core");
    expect(prompt.context.availableResolvers).not.toContain("commerce.productCompare");
    expect(prompt.context.catalog.length).toBeGreaterThan(60);
    expect(schema.required).toEqual(["spec", "composition"]);
    expect(args.prompt).not.toContain("tokenIdentifier");expect(args.prompt).not.toContain("compose@example.invalid");
    return definition().json;
  });
  const proposal = await f.author.action(compose, { ...f.base, prompt: "An editable grid of field notes" });
  expect(calls).toBe(1);expect(await f.counts()).toEqual({ heads: 0, versions: 0, approvals: 0, pages: 0 });
  const edited = JSON.parse(proposal.definitionJson);edited.spec.title = "Studio field notes";
  const created = await f.author.mutation(create, { ...f.base, expectedFingerprint: proposal.fingerprint, definitionJson: JSON.stringify(edited) });
  const saved = await f.author.query(ref("blockDefinitions/drafts:get"), { id: created.id });
  expect(saved.version).toBe(1);expect(saved.activeVersion).toBeNull();expect(saved.status).toBe("draft");
  expect(JSON.parse(saved.definitionJson).spec.title).toBe("Studio field notes");
  expect(await f.counts()).toEqual({ heads: 1, versions: 1, approvals: 0, pages: 0 });
  await expect(f.author.mutation(create, { ...f.base, expectedFingerprint: proposal.fingerprint, definitionJson: proposal.definitionJson })).rejects.toThrow("already in use");
});

test("capability, scope, name, schema, budget, unavailable resolvers and session checks reject before writes", async () => {
  const f = await fixture(), current = await f.author.query(get, f.base);
  await expect(f.t.query(get, f.base)).rejects.toThrow();
  for (const cap of ["blocks.ai", "blocks.compose", "post.create", "post.read"]) {
    await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: caps.filter(value => value !== cap) }));
    await expect(f.author.query(get, f.base)).rejects.toThrow();
    await expect(f.author.mutation(create, { ...f.base, expectedFingerprint: current.fingerprint, definitionJson: definition().json })).rejects.toThrow();
  }
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: caps }));
  for (const changed of [{ ...f.base, name: "core/heading" }, { ...f.base, name: "composed/../bad" }, { ...f.base, packId: "foreign" }, { ...f.base, expectedScope: { ...scope, deploymentOrigin: "https://other.convex.cloud" } }])
    await expect(f.author.query(get, changed)).rejects.toThrow();
  const result = definition().definition;
  for (const invalid of [
    { ...result, spec: { ...result.spec, name: "composed/substituted" } },
    { ...result, spec: { ...result.spec, version: 2 } },
    { ...result, spec: { ...result.spec, data: { resolver: "private.accounts", args: {} } } },
    { ...result, composition: { version: 1, root: { el: "Heading", bind: "attrs.missing" } } },
    { ...result, composition: { version: 1, root: { el: "script", props: { dangerouslySetInnerHTML: "bad" } } } },
    { ...result, spec: { ...result.spec, requires: { plugins: ["commerce"], capabilities: [] } } },
  ]) await expect(f.author.query(validate, { ...f.base, expectedFingerprint: current.fingerprint, resultJson: JSON.stringify(invalid) })).rejects.toThrow();
  await expect(f.author.query(validate, { ...f.base, expectedFingerprint: current.fingerprint, resultJson: "x".repeat(480 * 1024 + 1) })).rejects.toThrow();
  await expect(f.as(f.ids.user, "-other-session").mutation(create, { ...f.base, expectedFingerprint: current.fingerprint, definitionJson: definition().json })).rejects.toThrow();
  expect(await f.counts()).toEqual({ heads: 0, versions: 0, approvals: 0, pages: 0 });
});

test("generation and review intervals reject capability, site, appearance and name changes", async () => {
  for (const change of ["capability", "site", "appearance", "name"]) {
    async function mutate(f: Awaited<ReturnType<typeof fixture>>) {
      await f.t.run(async ctx => {
        if (change === "capability") await ctx.db.patch("roles", f.ids.role, { capabilities: caps.filter(cap => cap !== "blocks.ai") });
        if (change === "site") await ctx.db.patch("convexpress_siteIdentity", f.ids.site, { instanceKey: "foreign" });
        if (change === "appearance") await ctx.db.patch("settings", f.ids.appearance, { values: { active: "journal", overrides: {}, variants: {}, settings: {} } });
      });
      if (change === "name") await f.author.mutation(ref("blockDefinitions/drafts:create"), { definitionJson: definition().json });
    }
    const f = await fixture(async () => { await mutate(f);return definition().json; });
    await expect(f.author.action(compose, { ...f.base, prompt: "Create a block" })).rejects.toThrow();
    const g = await fixture(), trusted = await g.author.query(get, g.base);await mutate(g);
    await expect(g.author.mutation(create, { ...g.base, expectedFingerprint: trusted.fingerprint, definitionJson: definition().json })).rejects.toThrow();
    expect((await g.counts()).heads).toBe(change === "name" ? 1 : 0);
  }
});

test("only approved library metadata enters generation; revocation invalidates an outstanding review", async () => {
  const f = await fixture(), other = f.as(f.ids.other);
  const draft = await other.mutation(ref("blockDefinitions/drafts:create"), { definitionJson: definition("composed/private-other-draft").json });
  expect((await f.author.query(get, f.base)).contextJson).not.toContain("composed/private-other-draft");
  await other.mutation(ref("blockDefinitions/publication:setVersionState"), { id: draft.id, version: 1, expectedGeneration: 1, expectedDigest: draft.digest, enabled: true });
  const trusted = await f.author.query(get, f.base);expect(trusted.contextJson).toContain("composed/private-other-draft");
  await other.mutation(ref("blockDefinitions/publication:setVersionState"), { id: draft.id, version: 1, expectedGeneration: 2, expectedDigest: draft.digest, enabled: false });
  await expect(f.author.mutation(create, { ...f.base, expectedFingerprint: trusted.fingerprint, definitionJson: definition().json })).rejects.toThrow("changed");
});

test("resolver references cannot bypass explicit selection using literals or misleading field types", () => {
  const resources = [{ kind: "product" as const, id: "selected-product", slug: "selected-slug", title: "Selected" }];
  expect(() => assertAiResolverReferences([{ resolver: "commerce.productCompare", args: { products: ["selected-product"], attributes: [] } }], resources)).not.toThrow();
  for (const value of ["foreign-product", "selected-slug"]) expect(() => assertAiResolverReferences([{ resolver: "commerce.productCompare", args: { products: [value] } }], resources)).toThrow();
});

test("new-definition resource discovery is bounded, scoped and omits private metadata", async () => {
  const f = await fixture(), options = ref<"query">("blockDefinitions/composeResources:options");
  const args = { expectedScope: scope, kind: "media", cursor: null };
  await f.t.run(async ctx => {
    await ctx.db.patch("roles", f.ids.role, { capabilities: [...caps, "media.read"] });
    for (let i = 0; i < 14; i++) await ctx.db.insert("media", { title: `Photo ${i}`, fileName: `photo-${i}.jpg`, slug: `photo-${i}`, url: "https://private.invalid/secret-url", mimeType: "image/jpeg", fileSize: 100, mediaType: "image", status: i === 13 ? "trashed" : "active", uploadedBy: f.ids.user, description: "PRIVATE_METADATA", createdAt: i, updatedAt: i });
  });
  const first = await f.author.query(options, args);
  expect(first.page).toHaveLength(10);expect(first.cursor).not.toBeNull();
  const second = await f.author.query(options, { ...args, cursor: first.cursor });
  expect(second.page).toHaveLength(3);expect(second.cursor).toBeNull();
  const rows = [...first.page, ...second.page];expect(new Set(rows.map(row => row.id)).size).toBe(13);
  expect(JSON.stringify(rows)).not.toContain("secret-url");expect(JSON.stringify(rows)).not.toContain("PRIVATE_METADATA");expect(JSON.stringify(rows)).not.toContain("photo-13");
  expect(Object.keys(rows[0]).sort()).toEqual(["id", "title"]);
  await expect(f.author.query(options, { ...args, expectedScope: { ...scope, websiteKey: "foreign" } })).rejects.toThrow();
  await expect(f.author.query(options, { ...args, cursor: "x".repeat(4097) })).rejects.toThrow();
  await expect(f.author.query(options, { ...args, kind: "product" })).rejects.toThrow("Commerce");
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: caps }));
  await expect(f.author.query(options, args)).rejects.toThrow();
  await expect(f.t.query(options, args)).rejects.toThrow();
  expect((await f.counts()).heads).toBe(0);
});

test("selected live resources remain bounded and revalidated at creation; generated resolver references use installed semantics", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch("settings", f.ids.plugins, { values: { commerceEnabled: true } }));
  const product = await f.t.run(ctx => ctx.db.insert("commerce_products", { title: "Field kit", slug: "field-kit", status: "publish", productType: "simple", authorId: f.ids.user, categoryIds: [], galleryMediaIds: [], basePrice: { amount: 2400, currencyCode: "USD" }, trackInventory: false, allowBackorders: false, isVirtual: false, isDownloadable: false, rawSourceMeta: "PRIVATE_COST", createdAt: 1, updatedAt: 1 }));
  const base = { ...f.base, resources: { products: [product], media: [] } }, trusted = await f.author.query(get, base);
  expect(trusted.contextJson).not.toContain("PRIVATE_COST");expect(trusted.contextJson).not.toContain("2400");
  expect(JSON.parse(trusted.contextJson).availableResolvers).toContain("commerce.productCompare");
  const value = definition().definition;
  // The model deliberately declares text, not reference. Resolver-level checks
  // still use the installed product selector semantics to enforce selection.
  const dynamic = { ...value, spec: { ...value.spec,
    fields: [{ id: "product", type: "text", default: product }],
    data: { resolver: "commerce.productCompare", args: { products: ["attrs.product"], attributes: [] } }, examples: [{}], preview: "{product}" },
    composition: { version: 1, root: { el: "Grid", each: "data.items", as: "item", children: [{ el: "Heading", bind: "item.title" }] } } };
  const result = await f.author.query(validate, { ...base, expectedFingerprint: trusted.fingerprint, resultJson: JSON.stringify(dynamic) });
  const forged = structuredClone(dynamic);forged.spec.fields[0].default = "unselected-product";
  await expect(f.author.query(validate, { ...base, expectedFingerprint: trusted.fingerprint, resultJson: JSON.stringify(forged) })).rejects.toThrow();
  const literal = structuredClone(dynamic);literal.spec.data.args.products = ["unselected-product"];
  await expect(f.author.query(validate, { ...base, expectedFingerprint: trusted.fingerprint, resultJson: JSON.stringify(literal) })).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("commerce_products", product, { status: "draft" }));
  await expect(f.author.mutation(create, { ...base, expectedFingerprint: trusted.fingerprint, definitionJson: result.definitionJson })).rejects.toThrow("selected resource");
  expect((await f.counts()).heads).toBe(0);
});
