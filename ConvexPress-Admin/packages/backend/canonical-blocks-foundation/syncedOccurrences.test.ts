import { expect, test } from "bun:test";
import { resolveSyncedOccurrences, planSyncedOccurrenceData } from "./syncedOccurrences";
import { syncedContentDigest } from "./syncedContent";
import { validateCanonicalTree } from "./generated/instances";
const scope = { websiteKey: "agency", instanceKey: "staging", deploymentOrigin: "https://site.convex.cloud" };
const dataScope = { websiteKey: scope.websiteKey, instanceKey: scope.instanceKey };
const policy = { enabledPlugins: [], capabilities: ["tree.children", "reference.targetResolution"], disabledBlocks: [] };
const text = (id = "copy") => ({ id, name: "core/paragraph", version: 2, attrs: {} });
const ref = (id: string, syncedBlock: string, revision: number | "latest" = "latest") => ({ id, name: "core/synced", version: 1, attrs: { syncedBlock, revisionPolicy: revision === "latest" ? "latest" : "pinned", ...(revision === "latest" ? {} : { revision }) } });
function source(id: string, revision = 1, blocks: unknown = [text()]) { const title = "Reusable content";return { id, revision, title, blocks, scope, published: true, digest: syncedContentDigest(title, blocks) }; }
async function code(run: () => unknown | Promise<unknown>) { try { await run();return null; } catch (error) { return (error as { code?: string }).code ?? String(error); } }

test("repeated placements preserve authored trees while assigning distinct stable resolver identities", async () => {
  const input = [{ id: "section", name: "core/group", version: 1, attrs: {}, children: [text("original"), ref("first", "shared"), ref("second", "shared")] }];
  const shared = source("shared", 1, [{ id: "group", name: "core/group", version: 1, attrs: {}, children: [text()] }]);
  const before = JSON.stringify({ input, shared });let reads = 0;
  const plan = await resolveSyncedOccurrences(input, scope, async () => { reads++;return shared; });
  expect(reads).toBe(1);expect(plan.byId.size).toBe(8);
  const first = plan.roots[0]!.children[1]!.children[0]!.children[0]!, second = plan.roots[0]!.children[2]!.children[0]!.children[0]!;
  expect(first.id).not.toBe(second.id);expect(first.id).toMatch(/^synced_[a-f0-9]{64}$/);
  expect(first.node.id).toBe("copy");expect(second.node.id).toBe("copy");
  expect(first.path).toEqual(["section", "first", "group", "copy"]);
  expect(plan.byId.get("original")?.node.id).toBe("original");
  expect(first.owner).toMatchObject({ id: "shared", revision: 1, digest: shared.digest });
  expect(plan.resolverTree[0]!.children?.map(block => block.id)).toEqual(["original", plan.roots[0]!.children[1]!.children[0]!.id, plan.roots[0]!.children[2]!.children[0]!.id]);
  expect(validateCanonicalTree(plan.resolverTree)).toEqual(plan.resolverTree);expect(JSON.stringify({ input, shared })).toBe(before);
  expect(plan.resolution.blocks).toEqual(validateCanonicalTree(input));expect(plan.resolution.revisions[0]!.digest).toBe(shared.digest);
});

test("edits preserve placement identity while source replacements and revision changes update dependency state", async () => {
  const input = [ref("placement", "shared")];
  const one = await resolveSyncedOccurrences(input, scope, async () => source("shared"));
  const two = await resolveSyncedOccurrences(input, scope, async () => source("shared", 2));
  expect(one.roots[0]!.children[0]!.id).toBe(two.roots[0]!.children[0]!.id);expect(one.digest).not.toBe(two.digest);expect(two.roots[0]!.reference?.revision).toBe(2);
  const replacement = await resolveSyncedOccurrences([ref("placement", "other")], scope, async () => source("other"));
  expect(replacement.roots[0]!.children[0]!.id).not.toBe(one.roots[0]!.children[0]!.id);
  expect((await resolveSyncedOccurrences(input, scope, async () => source("shared"))).digest).toBe(one.digest);
});

test("nested source chains retain exact ownership and wrapper presentation", async () => {
  const input = [{ ...ref("outer", "shared"), layout: { tone: "muted", spacing: "compact" } }];
  const plan = await resolveSyncedOccurrences(input, scope, async ({ id }) => id === "shared" ? source(id, 3, [{ ...ref("inner", "leaf", 2) }]) : source(id, 2));
  const leaf = plan.roots[0]!.children[0]!.children[0]!;
  expect(leaf.sourceChain.map(owner => [owner.id, owner.revision])).toEqual([["shared", 3], ["leaf", 2]]);expect(leaf.owner?.id).toBe("leaf");
  expect(plan.roots[0]!.node.layout).toEqual({ tone: "muted", spacing: "compact" });expect(plan.resolverTree).toHaveLength(1);expect(plan.resolverTree[0]!.id).toBe(leaf.id);
});

test("unavailable references retain their wrapper without manufacturing children or jobs", async () => {
  const plan = await resolveSyncedOccurrences([ref("missing", "absent"), text()], scope, async () => null);
  expect(plan.roots[0]!.reference).toBeNull();expect(plan.roots[0]!.children).toEqual([]);expect(plan.resolverTree).toEqual(validateCanonicalTree([text()]));
  expect(planSyncedOccurrenceData(plan, dataScope, policy).jobs).toEqual([]);
  expect(await code(() => resolveSyncedOccurrences([ref("missing", "absent")], scope, async () => null, { requireAvailable: true }))).toBe("SYNCED_UNAVAILABLE");
});

test("root IDs cannot collide with generated placement IDs", async () => {
  const plan = await resolveSyncedOccurrences([ref("placement", "shared")], scope, async () => source("shared"));const duplicate = plan.roots[0]!.children[0]!.id;
  expect(await code(() => resolveSyncedOccurrences([text(duplicate), ref("placement", "shared")], scope, async () => source("shared")))).toBe("SYNCED_OCCURRENCE_COLLISION");
});

test("the page data plan shares results while pagination targets only one placement", async () => {
  const plan = await resolveSyncedOccurrences([ref("first", "shared"), ref("second", "shared")], scope, async () => source("shared", 1, [{ id: "grid", name: "core/post-grid", version: 1, attrs: {} }]));
  const [a, b] = plan.resolverTree, initial = planSyncedOccurrenceData(plan, dataScope, policy);
  expect(initial.bindings.map(binding => binding.blockId)).toEqual([a!.id, b!.id]);expect(initial.jobs).toHaveLength(1);
  const next = planSyncedOccurrenceData(plan, dataScope, policy, { [a!.id]: "next-cursor" });expect(next.jobs).toHaveLength(2);
  expect(next.bindings.map(binding => "cursor" in binding.args ? binding.args.cursor : undefined)).toEqual(["next-cursor", null]);
  expect(await code(() => planSyncedOccurrenceData(plan, dataScope, policy, { grid: "wrong-scope" }))).toBe("INVALID_PAGE_REQUEST");
  expect(await code(() => planSyncedOccurrenceData(plan, { ...dataScope, instanceKey: "production" }, policy))).toBe("SCOPE_MISMATCH");
});

test("nested data and wrappers obey current policy and the shared aggregate resolver limit", async () => {
  const plan = await resolveSyncedOccurrences([ref("first", "shared")], scope, async () => source("shared", 1, [{ id: "featured", name: "core/featured-page", version: 1, attrs: { page: "page-one" } }]));
  expect(await code(() => planSyncedOccurrenceData(plan, dataScope, { ...policy, disabledBlocks: ["core/synced"] }))).toBe("DISABLED_BLOCK");
  expect(await code(() => planSyncedOccurrenceData(plan, dataScope, { ...policy, disabledBlocks: ["core/featured-page"] }))).toBe("DISABLED_BLOCK");
  expect(await code(() => planSyncedOccurrenceData(plan, dataScope, { ...policy, capabilities: [] }))).toBe("MISSING_RUNTIME_POLICY");
  const many = await resolveSyncedOccurrences([ref("group", "shared")], scope, async () => source("shared", 1, Array.from({ length: 9 }, (_, n) => ({ id: `featured${n}`, name: "core/featured-page", version: 1, attrs: { page: `page-${n}` } }))));
  expect(await code(() => planSyncedOccurrenceData(many, dataScope, policy))).toBe("RESOLVER_BUDGET");
});

test("cycles and expanded node overflow are refused before dynamic planning", async () => {
  expect(await code(() => resolveSyncedOccurrences([ref("root", "shared")], scope, async () => source("shared", 1, [ref("loop", "shared")])))).toBe("SYNCED_CYCLE");
  expect(await code(() => resolveSyncedOccurrences([ref("a", "shared"), ref("b", "shared")], scope, async () => source("shared", 1, Array.from({ length: 40 }, (_, i) => text(`copy${i}`)))))).toBe("SYNCED_NODE_BUDGET");
});


test("occurrences preserve supported audience declarations for the separate authorized display projection", async () => {
  for (const visibility of ["signedIn", "signedOut"]) {
    const blocks = [{ ...ref("wrapper", "shared"), visibility }];
    const shared = source("shared", 1, [{ ...text(), visibility }]);
    const plan = await resolveSyncedOccurrences(blocks, scope, async () => shared);
    expect(plan.roots[0].node.visibility).toBe(visibility);
    expect(plan.roots[0].children[0].node.visibility).toBe(visibility);
    expect(plan.resolution.blocks).toEqual(validateCanonicalTree(blocks));
    expect(plan.resolution.revisions[0].digest).toBe(shared.digest);
  }
  expect(await code(() => resolveSyncedOccurrences([{ ...ref("wrapper", "shared"), visibility: "administrator" }], scope, async () => source("shared")))).not.toBeNull();
});


test("identical cached data still pays for every repeated output binding", async () => {
  const input = Array.from({ length: 9 }, (_, n) => ref(`placement${n}`, "shared"));
  const plan = await resolveSyncedOccurrences(input, scope, async () => source("shared", 1, [{ id: "featured", name: "core/featured-page", version: 1, attrs: { page: "one-page" } }]));
  expect(await code(() => planSyncedOccurrenceData(plan, dataScope, policy))).toBe("OUTPUT_BUDGET");
});

test("interactive resolver arguments use placement IDs instead of shared authored source IDs", async () => {
  const plan = await resolveSyncedOccurrences([ref("first", "shared"), ref("second", "shared")], scope, async () => source("shared", 1, [{ id: "poll", name: "core/poll", version: 1, attrs: { question: "Which season?", options: [{ key: "spring", label: "Spring" }, { key: "summer", label: "Summer" }] } }]));
  const data = planSyncedOccurrenceData(plan, dataScope, { ...policy, enabledPlugins: ["forms"], capabilities: [...policy.capabilities, "poll.submission"] });
  expect(data.jobs).toHaveLength(2);
  expect(data.bindings.map(binding => "blockId" in binding.args ? binding.args.blockId : null)).toEqual(plan.resolverTree.map(node => node.id));
  expect(data.bindings.every(binding => binding.blockId !== "poll")).toBe(true);
});
