import { resolveSyncedOccurrencesSnapshot } from "../src/templates/sdk/block-data/portable/syncedOccurrences";
import { projectSyncedDisplay } from "../src/templates/sdk/block-data/portable/syncedDisplay";
import { syncedContentDigest } from "../src/templates/sdk/block-data/portable/syncedContent";
import type { DataScope } from "../src/templates/sdk/block-data/portable/contracts";

const rich = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
export const sharedPlacements = [
  { id: "first", name: "core/synced", version: 1, layout: { spacing: "compact" }, attrs: { syncedBlock: "demo-studio-note", revisionPolicy: "latest" } },
  { id: "second", name: "core/synced", version: 1, layout: { spacing: "compact", tone: "muted" }, attrs: { syncedBlock: "demo-studio-note", revisionPolicy: "pinned", revision: 1 } },
];
/** Explicitly fictional, browser-local publication source. Never imported by
 * the production renderer or used as a fallback for unavailable real content. */
export function syncedExample(input: unknown, scope: DataScope, revision = 1, unavailable = false, hideSecond = false) {
  const installation = { ...scope, deploymentOrigin: "https://block-demo.invalid" };
  const plan = resolveSyncedOccurrencesSnapshot(input, installation, request => {
    if (request.id === "demo-studio-collection") {
      const title = "Shared studio collection", blocks = [{ id: "collection-layout", name: "core/group", version: 1, attrs: {}, layout: { spacing: "none" }, children: sharedPlacements }];
      return { id: request.id, revision: 1, title, blocks, digest: syncedContentDigest(title, blocks), scope: installation, published: true };
    }
    if (unavailable || request.id !== "demo-studio-note") return null;
    const selected = request.revisionPolicy === "pinned" ? request.revision : revision;
    const title = "Studio signature";
    const blocks = [
      { id: "headline", name: "core/heading", version: 2, layout: { spacing: "none" }, attrs: { level: 2, text: rich(selected === 1 ? "One idea. Everywhere." : "Good things grow together.") } },
      { id: "copy", name: "core/paragraph", version: 2, layout: { spacing: "none" }, attrs: { body: rich(selected === 1 ? "A small studio with a shared point of view. Thoughtful work, made to last." : "Our next chapter: more room for collaboration, more care in every detail.") } },
    ];
    return { id: request.id, revision: selected, title, blocks, digest: syncedContentDigest(title, blocks), scope: installation, published: true };
  });
  const visible = new Set(plan.byId.keys());
  if (hideSecond) for (const node of plan.byId.values()) if (node.path.includes("second") && node.owner) visible.delete(node.id);
  return projectSyncedDisplay(plan, visible);
}
