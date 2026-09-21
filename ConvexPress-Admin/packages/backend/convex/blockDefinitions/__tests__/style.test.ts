import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference as ref } from "convex/server";
import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import schema from "../../schema";
import { encodeComposedDefinition } from "../../canonicalDocuments/foundation/composedDefinitions";
import { primitiveSchemas } from "../../canonicalDocuments/foundation/primitiveContracts";
import { applyStyleProposal, styleProposalSchema } from "../styleProposal";

const caps = ["blocks.ai", "blocks.compose", "post.create", "post.read", "post.update"];
const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/blockDefinitions/drafts.ts": () => import("../drafts"),
  "./convex/blockDefinitions/styleContext.ts": () => import("../styleContext"),
  "./convex/blockDefinitions/ai.ts": () => import("../ai"),
};
const get = ref<"query">("blockDefinitions/styleContext:get"), validate = ref<"query">("blockDefinitions/styleContext:validateResult");
const action = ref<"action">("blockDefinitions/ai:styleForPack");
const root = { el: "Stack", props: { gap: "lg" }, children: [{ el: "Heading", props: { size: "display" }, bind: "attrs.title" }] };
const resultJson = JSON.stringify({ composition: { version: 1, root } });
const definition = () => encodeComposedDefinition({
  spec: { name: "composed/study", title: "Study", description: "A reusable heading", category: "text", role: "content", version: 1,
    keywords: [], ai: { useFor: "An introduction", avoid: "Navigation" }, fields: [{ id: "title", type: "text", default: "Hello", max: 80 }],
    supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data: null, preview: "{title}", examples: [{}] },
  composition: { version: 1, root: { el: "Heading", bind: "attrs.title" } },
  packTreatments: { journal: { version: 1, root: { el: "Text", bind: "attrs.title" } } },
});
async function fixture(transport?: (args: { schemaJson: string; system: string; prompt: string }) => Promise<string>) {
  const t = convexTest({ schema, modules: { ...modules, ...(transport ? { "./convex/ai/internals.ts": async () => ({
    generateStructuredDocument: internalAction({ args: { schemaJson: v.string(), system: v.string(), prompt: v.string() }, returns: v.string(), handler: (_ctx, args) => transport(args) }),
  }) } : {}) } });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Author", slug: "author", description: "Fixture", level: 10, type: "internal", isDefault: false, isProtected: false, capabilities: caps, pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const fields = { authSource: "local" as const, emailVerified: true, status: "active" as const, roleId: role, createdAt: 1, updatedAt: 1 };
    const user = await ctx.db.insert("users", { ...fields, email: "style@example.invalid" });
    const other = await ctx.db.insert("users", { ...fields, email: "other@example.invalid" });
    const site = await ctx.db.insert("convexpress_siteIdentity", { identityKey: "site-identity", websiteKey: "style-test", instanceKey: "staging", environmentKind: "staging", deploymentOrigin: "https://style.convex.cloud", managementOrigin: "https://controller.convex.cloud", siteOrigin: "https://style.convex.site", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    const appearance = await ctx.db.insert("settings", { section: "appearance.template", values: { active: "core", overrides: {}, variants: {}, settings: {} }, legacyAppearanceMigration: { version: 2, migratedAt: 1 }, updatedAt: 1, updatedBy: user });
    return { role, user, other, site, appearance };
  });
  const as = (user: string, suffix = "") => t.withIdentity({ subject: user, tokenIdentifier: `https://convexpress-admin.local|${user}${suffix}` });
  const author = as(ids.user), saved = await author.mutation(ref("blockDefinitions/drafts:create"), { definitionJson: definition().json });
  const base = { id: saved.id, version: 1, expectedDigest: saved.digest, expectedGeneration: 1, packId: "core" };
  const snapshot = () => t.run(async ctx => ({ head: await ctx.db.get("blockDefinitions", saved.id), versions: await ctx.db.query("blockDefinitionVersions").withIndex("by_definition_version", q => q.eq("definitionId", saved.id)).take(3) }));
  return { t, ids, as, author, base, snapshot };
}

test("provider schema includes every primitive, closed props and recursive compositions without host IDs", () => {
  const schema = styleProposalSchema();
  expect(schema.$defs.node.oneOf).toHaveLength(Object.keys(primitiveSchemas).length);
  for (const node of schema.$defs.node.oneOf) {
    expect(node.additionalProperties).toBe(false);
    expect(node.properties.props.additionalProperties).toBe(false);
    expect(node.properties.props.properties).not.toHaveProperty("blockId");
    expect(node.properties).not.toHaveProperty("className");
  }
  expect(schema.$defs.node.oneOf.find(n => n.properties.el.const === "Grid")?.properties.children?.items).toEqual({ $ref: "#/$defs/node" });
});

test("treatment proposals preserve fields, examples, base composition and other packs; reject code, schema and invalid bindings", () => {
  const before = definition(), after = applyStyleProposal(before.definition, "core", 2, resultJson).definition;
  expect(after.spec).toEqual({ ...before.definition.spec, version: 2 });
  expect(after.composition).toEqual(before.definition.composition);
  expect(after.packTreatments?.journal).toEqual(before.definition.packTreatments?.journal);
  expect(after.packTreatments?.core.root).toEqual(root);
  for (const invalid of [
    { composition: { version: 1, root: { el: "Heading", bind: "attrs.missing" } } },
    { composition: { version: 1, root: { ...root, className: "my-class" } } },
    { composition: { version: 1, root: { el: "script" } } },
    { composition: { version: 1, root: { el: "Section", props: { blockId: "owned" } } } },
    { composition: { version: 1, root: { el: "Text", bind: "fetch('/secret')" } } },
    { composition: { version: 1, root }, spec: before.definition.spec },
    { proposal: { composition: { version: 1, root } } },
  ]) expect(() => applyStyleProposal(before.definition, "core", 2, JSON.stringify(invalid))).toThrow();
  expect(() => applyStyleProposal(before.definition, "core", 2, " ".repeat(480 * 1024 + 1))).toThrow();
});

test("registered action uses installed guide and exact saved content, validates without writes", async () => {
  let calls = 0;
  const f = await fixture(async args => {
    calls++;
    const prompt = JSON.parse(args.prompt), schema = JSON.parse(args.schemaJson);
    expect(prompt.context.template.id).toBe("core");
    expect(prompt.context.template.design).toContain("# Core");
    expect(prompt.context.definition.spec.name).toBe("composed/study");
    expect(schema.required).toEqual(["composition"]);
    expect(args.prompt).not.toContain("tokenIdentifier");
    return resultJson;
  });
  const before = await f.snapshot();
  const proposal = await f.author.action(action, { ...f.base, prompt: "Give the heading more breathing room." });
  expect(calls).toBe(1); expect(proposal.packId).toBe("core");
  expect(JSON.parse(proposal.definitionJson).spec.version).toBe(2);
  expect(await f.snapshot()).toEqual(before);
  await expect(f.author.action(action, { ...f.base, prompt: " " })).rejects.toThrow();
  await expect(f.author.action(action, { ...f.base, packId: "not-installed", prompt: "Restyle" })).rejects.toThrow();
  expect(calls).toBe(1);
});

test("owner, all capabilities, saved digest, generation, status and site guard generation", async () => {
  const f = await fixture();
  await expect(f.t.query(get, f.base)).rejects.toThrow();
  await expect(f.as(f.ids.other).query(get, f.base)).rejects.toThrow();
  for (const key of ["blocks.ai", "blocks.compose", "post.read", "post.update"]) {
    await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: caps.filter(cap => cap !== key) }));
    await expect(f.author.query(get, f.base)).rejects.toThrow();
  }
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: caps }));
  for (const args of [{ ...f.base, expectedDigest: "wrong" }, { ...f.base, expectedGeneration: 0 }, { ...f.base, version: 2 }])
    await expect(f.author.query(get, args)).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("blockDefinitions", f.base.id, { status: "promoted" }));
  await expect(f.author.query(get, f.base)).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("blockDefinitions", f.base.id, { status: "draft" }));
  await f.t.run(ctx => ctx.db.patch("convexpress_siteIdentity", f.ids.site, { instanceKey: "foreign" }));
  await expect(f.author.query(get, f.base)).rejects.toThrow();
});

test("provider interval rechecks revoked access, head changes and appearance; session fingerprints cannot cross", async () => {
  for (const change of ["capability", "generation", "appearance"]) {
    const f = await fixture(async () => {
      await f.t.run(async ctx => {
        if (change === "capability") await ctx.db.patch("roles", f.ids.role, { capabilities: caps.filter(cap => cap !== "blocks.ai") });
        if (change === "generation") await ctx.db.patch("blockDefinitions", f.base.id, { generation: 2 });
        if (change === "appearance") await ctx.db.patch("settings", f.ids.appearance, { values: { active: "journal", overrides: {}, variants: {}, settings: {} } });
      });
      return resultJson;
    });
    await expect(f.author.action(action, { ...f.base, prompt: "Restyle" })).rejects.toThrow();
    expect((await f.snapshot()).versions).toHaveLength(1);
  }
  const f = await fixture(), context = await f.author.query(get, f.base);
  await expect(f.as(f.ids.user, "-new-session").query(validate, { ...f.base, expectedFingerprint: context.fingerprint, resultJson })).rejects.toThrow();
  await expect(f.author.query(validate, { ...f.base, expectedFingerprint: context.fingerprint, resultJson: "{}" })).rejects.toThrow();
  expect((await f.snapshot()).versions).toHaveLength(1);
});
