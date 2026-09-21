import { expect, test } from "bun:test";
import { resolveSyncedContent, syncedContentDigest, SYNCED_CONTENT_LIMITS } from "./syncedContent";

const scope = { websiteKey: "agency-site", instanceKey: "staging", deploymentOrigin: "https://site.convex.cloud" };
const text = (id = "text", anchor?: string) => ({ id, name: "core/paragraph", version: 2, attrs: {}, ...(anchor ? { anchor } : {}) });
const ref = (id: string, source: string, revision: number | "latest" = 1) => ({ id, name: "core/synced", version: 1, attrs: { syncedBlock: source, revisionPolicy: revision === "latest" ? "latest" : "pinned", ...(revision === "latest" ? {} : { revision }) } });
function source(id = "shared", revision = 1, blocks: unknown = [text()]) {
  const title = "Shared content";
  return { id, revision, title, blocks, scope, published: true, digest: syncedContentDigest(title, blocks) };
}
const code = async (action: () => Promise<unknown>) => { try { await action(); return null; } catch (e) { return (e as { code?: string }).code ?? (e as Error).name; } };

test("pins exact revisions; latest is read once per resolution and refreshed on the next request", async () => {
  const requests: unknown[] = [];
  let latest = 2;
  const read = async (request: { id: string; revision?: number }) => { requests.push(request); return source(request.id, request.revision ?? latest); };
  const blocks = [ref("pinned", "shared", 1), ref("live-a", "shared", "latest"), ref("live-b", "shared", "latest")];
  const result = await resolveSyncedContent(blocks, scope, read);
  expect(requests).toHaveLength(2);
  expect(result.revisions.map(r => r.revision)).toEqual([1, 2]);
  expect(result.bindings.map(b => b.target?.revision)).toEqual([1, 2, 2]);
  expect(result.bindings.map(b => b.path)).toEqual([["pinned"], ["live-a"], ["live-b"]]);
  expect(result.expandedNodes).toBe(6);
  latest = 3;
  expect((await resolveSyncedContent(blocks, scope, read)).bindings[1].target?.revision).toBe(3);
});

test("nested occurrences have distinct paths, share reads, and never mutate source or caller trees", async () => {
  const root = [ref("a", "shared"), ref("b", "shared")];
  const shared = source("shared", 1, [ref("nested", "leaf")]);
  const before = JSON.stringify({ root, shared });
  let reads = 0;
  const result = await resolveSyncedContent(root, scope, async ({ id }) => { reads++; return id === "shared" ? shared : source("leaf"); });
  expect(result.bindings.map(b => b.path)).toEqual([["a"], ["a", "nested"], ["b"], ["b", "nested"]]);
  expect(reads).toBe(2);
  expect(result.expandedNodes).toBe(6);
  expect(JSON.stringify({ root, shared })).toBe(before);
  result.revisions[0].title = "Caller mutation";
  expect(shared.title).toBe("Shared content");
});

test("missing or unauthorized revisions have one redacted unavailable state; review requires availability", async () => {
  const blocks = [ref("a", "shared")];
  expect((await resolveSyncedContent(blocks, scope, async () => null)).bindings).toEqual([{ path: ["a"], target: null }]);
  expect(await code(() => resolveSyncedContent(blocks, scope, async () => null, { requireAvailable: true }))).toBe("SYNCED_UNAVAILABLE");
  let reads = 0;
  const empty = [{ id: "unselected", name: "core/synced", version: 1, attrs: {} }];
  expect((await resolveSyncedContent(empty, scope, async () => { reads++; return null; })).bindings[0].target).toBeNull();
  expect(reads).toBe(0);
});

test("refuses ambiguous revision policies before reading content", async () => {
  let reads = 0;
  for (const attrs of [{ syncedBlock: "shared" }, { syncedBlock: "shared", revisionPolicy: "latest", revision: 1 }]) {
    const blocks = [{ id: "a", name: "core/synced", version: 1, attrs }];
    expect(await code(() => resolveSyncedContent(blocks, scope, async () => { reads++; return null; }))).toBe("SYNCED_REVISION_POLICY");
  }
  expect(reads).toBe(0);
});

test("refuses foreign identity, website, instance, origin, wrong pinned version, draft and altered content", async () => {
  const valid = source();
  const variants = [
    { ...valid, id: "other" }, { ...valid, revision: 2 }, { ...valid, published: false },
    ...["websiteKey", "instanceKey", "deploymentOrigin"].map(key => ({ ...valid, scope: { ...scope, [key]: key === "deploymentOrigin" ? "https://other.convex.cloud" : "other" } })),
    { ...valid, title: "Tampered" }, { ...valid, secret: "must not cross" },
  ];
  for (const value of variants) expect(await code(() => resolveSyncedContent([ref("a", "shared")], scope, async () => value))).toBe("SYNCED_SOURCE_INVALID");
});

test("immutable revision equivocation is rejected even when latest and pinned were separate reads", async () => {
  let reads = 0;
  expect(await code(() => resolveSyncedContent([ref("a", "shared"), ref("b", "shared", "latest")], scope, async () => source("shared", 1, [text(`changed-${++reads}`)])))).toBe("SYNCED_REVISION_CONFLICT");
});

test("cycles are path-local: repeated siblings and finite older revisions work; actual cycles refuse", async () => {
  expect(await code(() => resolveSyncedContent([ref("a", "shared")], scope, async () => source("shared", 1, [ref("self", "shared")])))).toBe("SYNCED_CYCLE");
  expect(await code(() => resolveSyncedContent([ref("a", "one")], scope, async ({ id }) => source(id, 1, [ref("loop", id === "one" ? "two" : "one")])))).toBe("SYNCED_CYCLE");
  const finite = await resolveSyncedContent([ref("a", "shared", 2)], scope, async ({ revision }) => source("shared", revision, revision === 2 ? [ref("older", "shared", 1)] : [text()]));
  expect(finite.expandedNodes).toBe(3);
});

test("budgets charge expanded occurrences, not just cached unique sources", async () => {
  let reads = 0;
  const blocks = Array.from({ length: 41 }, (_, n) => ref(`copy-${n}`, "shared"));
  expect(await code(() => resolveSyncedContent(blocks, scope, async () => { reads++; return source(); }))).toBe("SYNCED_NODE_BUDGET");
  expect(reads).toBe(1);
  const chain = [ref("root", "source-1")];
  expect(await code(() => resolveSyncedContent(chain, scope, async ({ id }) => source(id, 1, [ref("next", `source-${Number(id.split("-")[1]) + 1}`)])))).toBe("SYNCED_DEPTH_BUDGET");
});

test("unique reads stop before exceeding the configured request budget", async () => {
  let reads = 0;
  const blocks = Array.from({ length: SYNCED_CONTENT_LIMITS.reads + 1 }, (_, n) => ref(`copy-${n}`, `shared-${n}`));
  expect(await code(() => resolveSyncedContent(blocks, scope, async ({ id }) => { reads++; return source(id); }))).toBe("SYNCED_READ_BUDGET");
  expect(reads).toBe(SYNCED_CONTENT_LIMITS.reads);
});

test("expanded page-wide anchors cannot collide across reused or ordinary content", async () => {
  expect(await code(() => resolveSyncedContent([text("root", "contact"), ref("a", "shared")], scope, async () => source("shared", 1, [text("nested", "contact")])))).toBe("SYNCED_ANCHOR_CONFLICT");
  expect(await code(() => resolveSyncedContent([ref("a", "shared"), ref("b", "shared")], scope, async () => source("shared", 1, [text("nested", "contact")])))).toBe("SYNCED_ANCHOR_CONFLICT");
});

test("ordinary child depth counts toward the same expanded depth budget", async () => {
  let node: unknown = ref("ref", "shared");
  for (let n = 0; n < 7; n++) node = { id: `group-${n}`, name: "core/group", version: 1, attrs: {}, children: [node] };
  expect(await code(() => resolveSyncedContent([node], scope, async () => source()))).toBe("SYNCED_DEPTH_BUDGET");
});

test("byte budgets include every expansion and the aggregate of distinct source reads", async () => {
  const large = Array.from({ length: 20 }, (_, n) => ({ id: `html-${n}`, name: "core/custom-html", version: 1, attrs: { html: "x".repeat(15000) } }));
  expect(await code(() => resolveSyncedContent([ref("a", "shared"), ref("b", "shared")], scope, async () => source("shared", 1, large)))).toBe("SYNCED_EXPANSION_BUDGET");
  expect(await code(() => resolveSyncedContent([ref("a", "one"), ref("b", "two")], scope, async ({ id }) => source(id, 1, large)))).toBe("SYNCED_SOURCE_BUDGET");
});
