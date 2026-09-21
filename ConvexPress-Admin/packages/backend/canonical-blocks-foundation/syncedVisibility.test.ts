import { expect, test } from "bun:test";
import { resolveSyncedOccurrencesSnapshot, type SyncedOccurrence } from "./syncedOccurrences";
import { projectSyncedDisplay, resolveSyncedDisplay } from "./syncedDisplay";
import { syncedContentDigest } from "./syncedContent";
import { collectCanonicalDisplayMediaIds } from "./documentContracts";
const scope = { websiteKey: "studio", instanceKey: "staging", deploymentOrigin: "https://studio.convex.cloud" };
const text = (id: string, value: string) => ({ id, name: "core/paragraph", version: 2, attrs: { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: value }] }] } } });
const ref = (id: string, source: string) => ({ id, name: "core/synced", version: 1, attrs: { syncedBlock: source, revisionPolicy: "latest" } });
function fixture() {
  const root = [text("public", "PUBLIC"), text("private-root", "PRIVATE_ROOT"), ref("first", "shared"), ref("second", "shared"), ref("hidden-source", "private-source")];
  const blocks = [text("always", "ALWAYS_VISIBLE"), text("conditional", "VISIBLE_IN_FIRST"), text("never", "NEVER_VISIBLE"), { id: "private-image", name: "core/image", version: 2, attrs: { mediaId: "PRIVATE_MEDIA", alt: "Private" } }];
  const plan = resolveSyncedOccurrencesSnapshot(root, scope, request => {
    const title = request.id === "shared" ? "Shared" : "PRIVATE_SOURCE_TITLE", body = request.id === "shared" ? blocks : [text("private", "PRIVATE_SOURCE_BODY")];
    return { id: request.id, revision: 1, title, blocks: body, digest: syncedContentDigest(title, body), scope, published: true };
  });
  const visible = new Set<string>();
  const visit = (nodes: SyncedOccurrence[]) => { for (const node of nodes) {
    if (["private-root", "hidden-source", "never", "private-image"].includes(node.node.id) || node.node.id === "conditional" && node.path[0] === "second") continue;
    visible.add(node.id);visit(node.children);
  } };
  visit(plan.roots);
  return { plan, visible };
}
test("different reusable placements retain their own visible children without leaking hidden-only bodies, media or source metadata", () => {
  const f = fixture(), before = JSON.stringify(f.plan.resolution), projected = projectSyncedDisplay(f.plan, f.visible);
  const payload = JSON.stringify({ blocks: projected.blocks, synced: projected.synced });
  for (const secret of ["PRIVATE_ROOT", "NEVER_VISIBLE", "PRIVATE_MEDIA", "PRIVATE_SOURCE_TITLE", "PRIVATE_SOURCE_BODY", "private-source"]) expect(payload).not.toContain(secret);
  expect(payload).toContain("VISIBLE_IN_FIRST");expect(projected.synced.revisions).toHaveLength(1);expect(projected.synced.omitted).toHaveLength(1);
  const decoded = resolveSyncedDisplay(projected.synced, projected.blocks, scope);
  expect(decoded.roots.map(node => node.node.id)).toEqual(["public", "first", "second"]);
  expect(decoded.roots[1]!.children.map(node => node.node.id)).toEqual(["always", "conditional"]);
  expect(decoded.roots[2]!.children.map(node => node.node.id)).toEqual(["always"]);
  expect(collectCanonicalDisplayMediaIds(decoded.resolverTree)).toEqual([]);
  expect(decoded.resolverTree.map(node => node.id)).toEqual(projected.resolverTree.map(node => node.id));
  expect(JSON.stringify(f.plan.resolution)).toBe(before);
});
test("omissions cannot smuggle hidden-only source content or target roots, unknown IDs, or duplicate placements", () => {
  const f = fixture(), projected = projectSyncedDisplay(f.plan, f.visible);
  const first = [...projected.displayPlan.byId.values()].find(node => node.node.id === "conditional")!;
  for (const omitted of [[...projected.synced.omitted!, first.id], ["public"], ["unknown"], [...projected.synced.omitted!, ...projected.synced.omitted!]]) {
    expect(() => resolveSyncedDisplay({ ...projected.synced, omitted }, projected.blocks, scope)).toThrow();
  }
  const broken = new Set(f.visible);broken.add("unknown");expect(() => projectSyncedDisplay(f.plan, broken)).toThrow();
  const orphan = new Set(f.visible);orphan.delete("first");expect(() => projectSyncedDisplay(f.plan, orphan)).toThrow("every ancestor");
});
test("nested reused groups can be omitted independently and hidden-only descendant source metadata is removed", () => {
  const root = [ref("first", "outer"), ref("second", "outer")];
  const plan = resolveSyncedOccurrencesSnapshot(root, scope, request => {
    const blocks = request.id === "outer" ? [text("public", "PUBLIC"), ref("nested", "inner")] : [text("inside", "INNER")];
    return { id: request.id, revision: 1, title: request.id, blocks, digest: syncedContentDigest(request.id, blocks), scope, published: true };
  });
  const visible = new Set<string>();
  const visit = (nodes: SyncedOccurrence[]) => { for (const node of nodes) { if (node.node.id === "nested" && node.path[0] === "second") continue;visible.add(node.id);visit(node.children); } };visit(plan.roots);
  const projected = projectSyncedDisplay(plan, visible);
  expect(projected.displayPlan.roots[0]!.children[1]!.children[0]!.node.id).toBe("inside");
  expect(projected.displayPlan.roots[1]!.children.map(node => node.node.id)).toEqual(["public"]);
  expect(projected.synced.revisions).toHaveLength(2);
  for (const node of plan.byId.values()) if (node.path.includes("nested")) visible.delete(node.id);
  const noInner = projectSyncedDisplay(plan, visible);
  expect(noInner.synced.revisions.map(source => source.id)).toEqual(["outer"]);
  expect(noInner.synced.selections.map(item => item.request.id)).toEqual(["outer"]);
  expect(JSON.stringify(noInner.synced)).not.toContain("INNER");
});
