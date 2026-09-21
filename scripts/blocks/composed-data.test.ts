import { expect, test } from "bun:test";
import { encodeComposedDefinition } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/composedDefinitions";
import { planCanonicalData, type ComposedDataContext } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/planner";
import { resolveCanonicalData, resolveCanonicalDataWithDefinitions, validateCanonicalData } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/resolve";
import { createContentPageDisplayStore, readInstalledPageData } from "../../ConvexPress-Website/apps/web/src/templates/sdk/block-data/installed-page-data";
import catalog from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/generated/catalog.json";
import { resolveCanonicalPageData } from "../../ConvexPress-Admin/packages/backend/convex/canonicalDocuments/data";
import { commerceHarness } from "../../ConvexPress-Admin/packages/backend/convex/commerce/__tests__/handlerHarness.test-support";

const scope = { websiteKey: "composed-data", instanceKey: "staging" };
const installation = { ...scope, deploymentOrigin: "https://composed-data.convex.cloud" };
const policy = { enabledPlugins: [], capabilities: ["reference.targetResolution"], disabledBlocks: [] };
function definition(version = 1, title = "Dynamic page", data: { resolver: string; args: Record<string, string> } | null = { resolver: "content.page", args: { page: "attrs.page" } }) {
  const encoded = encodeComposedDefinition({
    spec: { name: "composed/page-card", title, description: "Dynamic composed fixture", category: "text", role: "content", version,
      keywords: [], ai: { useFor: "Page card", avoid: "Navigation" }, fields: [{ id: "page", type: "reference", of: "page", allowEmpty: true, default: "" }],
      supports: { children: false, styles: false, layout: [], anchor: true, visibility: false }, data, preview: "{page}", examples: [{}] },
    composition: { version: 1, root: { el: "Heading", bind: "'Card'" } },
  });
  return { name: "composed/page-card", version, digest: encoded.digest, definitionJson: encoded.json };
}
const context = (...definitions: ReturnType<typeof definition>[]): ComposedDataContext => ({ scope: installation, definitions: { scope: installation, definitions } });
const node = (id = "card", version = 1, page = "selected-page") => ({ id, name: "composed/page-card", version, attrs: { page } });
const errorCode = (run: () => unknown) => { try { run(); return null; } catch (error) { return (error as { code?: string }).code; } };

test("composed definitions use the existing allowlisted resolver and retain exact version bindings", async () => {
  const composed = context(definition(1), definition(2));
  const tree = [node("first"), node("second", 2)];
  let reads = 0;
  const plan = planCanonicalData(tree, scope, policy, {}, composed);
  expect(plan.jobs).toHaveLength(1);
  expect(plan.bindings.map(binding => binding.blockVersion)).toEqual([1, 2]);
  expect(plan.definitionsDigest).toMatch(/^[a-f0-9]{64}$/);
  const data = await resolveCanonicalDataWithDefinitions(tree, scope, policy, { readPage: async args => {
    reads++; expect(args).toEqual({ page: "selected-page" }); return { page: null };
  } }, composed);
  expect(reads).toBe(1);
  expect(validateCanonicalData(tree, scope, policy, data, {}, composed)).toEqual(data);
  expect(data.definitionsDigest).toBe(plan.definitionsDigest);
  expect(() => planCanonicalData(tree, scope, policy)).toThrow();
  expect(() => validateCanonicalData(tree, scope, policy, { ...data, definitionsDigest: undefined }, {}, composed)).toThrow("definition snapshot");
  const changed = context(definition(1, "Changed definition"), definition(2));
  expect(() => validateCanonicalData(tree, scope, policy, data, {}, changed)).toThrow("definition snapshot");
  const foreign = { ...composed, scope: { ...installation, deploymentOrigin: "https://foreign.convex.cloud" } };
  expect(() => planCanonicalData(tree, scope, policy, {}, foreign)).toThrow("another site");
  expect(errorCode(() => planCanonicalData(tree, { ...scope, instanceKey: "production" }, policy, {}, composed))).toBe("SCOPE_MISMATCH");
  expect(() => planCanonicalData([tree[0]], scope, policy, {}, composed)).toThrow("exactly");
});

test("custom specs cannot weaken installed resolver policy or supply unknown resolver arguments", async () => {
  let reads = 0;
  const readers = { readPage: async () => { reads++; return { page: null }; } };
  await expect(resolveCanonicalDataWithDefinitions([node()], scope, { ...policy, capabilities: [] }, readers, context(definition()))).rejects.toThrow("weaken");
  await expect(resolveCanonicalDataWithDefinitions([node()], scope, policy, readers, context(definition(1, "Unknown", { resolver: "admin.secret", args: {} })))).rejects.toThrow("approved");
  await expect(resolveCanonicalDataWithDefinitions([node()], scope, policy, readers, context(definition(1, "Unexpected args", { resolver: "content.page", args: { secret: "attrs.page" } })))).rejects.toThrow("arguments");
  const commerce = context(definition(1, "Commerce", { resolver: "commerce.productCompare", args: {} }));
  expect(errorCode(() => planCanonicalData([node()], scope, policy, {}, commerce))).toBe("MISSING_RUNTIME_POLICY");
  expect(errorCode(() => planCanonicalData([node()], scope, { ...policy, disabledBlocks: ["composed/page-card"] }, {}, context(definition())))).toBe("DISABLED_BLOCK");
  expect(reads).toBe(0);
});

test("Library data plans and envelopes retain their exact legacy shape", async () => {
  const allPolicy = { enabledPlugins: [...new Set(catalog.flatMap(block => block.requires.plugins))], capabilities: [...new Set(catalog.flatMap(block => block.requires.capabilities))], disabledBlocks: [] };
  const empty = context();
  // Invalid semantic examples fail identically; accepting custom definitions must
  // never change the outcome or jobs of a Library-only plan.
  for (const block of catalog) {
    const tree = [{ id: "block", name: block.name, version: block.version, attrs: block.examples[0] }];
    let baseline;
    try { baseline = planCanonicalData(tree, scope, allPolicy); }
    catch { expect(() => planCanonicalData(tree, scope, allPolicy, {}, empty)).toThrow(); continue; }
    expect(planCanonicalData(tree, scope, allPolicy, {}, empty)).toEqual(baseline);
  }
  const tree = [{ id: "page", name: "core/featured-page", version: 1, attrs: { page: "selected-page" } }];
  const legacy = await resolveCanonicalData(tree, scope, policy, async () => ({ page: null }));
  const named = await resolveCanonicalDataWithDefinitions(tree, scope, policy, { readPage: async () => ({ page: null }) });
  expect(named).toEqual(legacy);
  expect(Object.hasOwn(named, "definitionsDigest")).toBe(false);
  expect(() => validateCanonicalData(tree, scope, policy, { ...legacy, definitionsDigest: "a".repeat(64) })).toThrow("definition snapshot");
});

test("definition binding covers static compositions and shared resolver work keeps its budget", async () => {
  const plain = context(definition(1, "Static", null));
  const noReads = await resolveCanonicalDataWithDefinitions([node()], scope, policy, { readPage: async () => { throw Error("must not read"); } }, plain);
  expect(noReads.dataByBlock).toEqual({});
  expect(noReads.definitionsDigest).toBeDefined();
  const changed = context(definition(1, "Changed static", null));
  expect(() => validateCanonicalData([node()], scope, policy, noReads, {}, changed)).toThrow("definition snapshot");
  const tree = Array.from({ length: 9 }, (_, index) => node(`card${index}`, 1, `page${index}`));
  expect(errorCode(() => planCanonicalData(tree, scope, policy, {}, context(definition())))).toBe("RESOLVER_BUDGET");
});

test("installed display grants bind definition content and invalidate on replacement or scope changes", async () => {
  const composed = context(definition()), tree = [node()];
  const envelope = await resolveCanonicalDataWithDefinitions(tree, scope, policy, { readPage: async () => ({ page: null }) }, composed);
  const display = { scope, documentKey: "page", revision: "1", viewerKey: "visitor" };
  const store = createContentPageDisplayStore();
  const grant = store.install({ tree, policy, context: display, envelope, composed });
  const input = { grant, current: display };
  expect(readInstalledPageData(input, tree, policy, composed)).toEqual(envelope);
  expect(() => readInstalledPageData(input, tree, policy)).toThrow("definitions");
  expect(() => readInstalledPageData(input, tree, policy, context(definition(1, "Changed")))).toThrow("definitions");
  expect(() => readInstalledPageData({ ...input, current: { ...display, viewerKey: "other" } }, tree, policy, composed)).toThrow();
  const preserved = structuredClone(composed);
  composed.definitions.definitions[0].definitionJson = "mutated after install";
  expect(() => readInstalledPageData(input, tree, policy, composed)).toThrow();
  expect(readInstalledPageData(input, tree, policy, preserved)).toEqual(envelope);
  expect(() => store.install({ tree, policy, context: display, envelope, composed })).toThrow();
  expect(() => readInstalledPageData(input, tree, policy, preserved)).toThrow("invalidated");
});

test("server adapter verifies the live installation and keeps composed references behind existing public-content rules", async () => {
  const composed = context(definition()), tree = [node()];
  for (const state of ["public", "draft", "private", "password", "missing"]) {
    const ctx = commerceHarness({
      convexpress_siteIdentity: [{ identityKey: "site-identity", ...installation }],
      posts: state === "missing" ? [] : [{ _id: "selected-page", type: "page", title: "Selected public page", slug: "selected-page", path: "/selected-page",
        status: state === "draft" ? "draft" : "publish", visibility: state === "private" ? "private" : state === "password" ? "password" : "public",
        content: "Private authored body must never enter a resolver response", excerpt: "Public summary" }],
    }, null);
    const data = await resolveCanonicalPageData(ctx, tree, scope, policy, undefined, undefined, {}, undefined, [], composed);
    const entry = data.dataByBlock.card;
    if (entry.resolver !== "content.page") throw Error("Wrong resolver");
    expect(entry.data.page?.title ?? null).toBe(state === "public" ? "Selected public page" : null);
    expect(JSON.stringify(data)).not.toContain("Private authored body");
    expect(validateCanonicalData(tree, scope, policy, data, {}, composed)).toEqual(data);
  }
  const foreign = commerceHarness({ convexpress_siteIdentity: [{ identityKey: "site-identity", ...installation, deploymentOrigin: "https://foreign.convex.cloud" }] }, null);
  let reads = 0;
  foreign.db.get = async () => { reads++; throw Error("must not read content"); };
  await expect(resolveCanonicalPageData(foreign, tree, scope, policy, undefined, undefined, {}, undefined, [], composed)).rejects.toMatchObject({ code: "SCOPE_MISMATCH" });
  expect(reads).toBe(0);
});
