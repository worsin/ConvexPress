import { useState } from "react";
import { prepareBlocks, type RendererRegistry } from "../src/templates/sdk/block-renderer/model";
import { sharedPlacements, syncedExample } from "./synced-adapter";
import "./synced-preview.css";
const scope = { websiteKey: "block-demo", instanceKey: "isolated-demo" };
const policy = { enabledPlugins: [], capabilities: ["tree.children", "reference.targetResolution"], disabledBlocks: [] };
const nested = [{ id: "collection", name: "core/synced", version: 1, attrs: { syncedBlock: "demo-studio-collection", revisionPolicy: "latest" }, layout: { spacing: "none" } }];
export function SyncedDemo({ registry, packId }: { registry: RendererRegistry; packId: string }) {
  const [scenario, setScenario] = useState("original");
  const [composition, setComposition] = useState("direct");
  const tree = composition === "nested" ? nested : sharedPlacements;
  const projected = syncedExample(tree, scope, scenario === "updated" ? 2 : 1, scenario === "withdrawn", scenario === "restricted");
  return <div className="synced-study" aria-label="Shared content study">
    <div className="synced-study-controls">
    <label>Composition <select aria-label="Shared content composition" value={composition} onChange={event => setComposition(event.target.value)}><option value="direct">Two shared placements</option><option value="nested">Nested shared collection</option></select></label>
    <label>Publication <select aria-label="Shared content preview" value={scenario} onChange={event => setScenario(event.target.value)}>
      <option value="original">Original publication</option><option value="updated">Publish revision 2</option><option value="restricted">Second placement restricted</option><option value="withdrawn">Source withdrawn</option>
    </select></label>
    <p>The first placement follows the latest publication. The tinted placement stays pinned to revision 1. {composition === "nested" ? "Both are nested inside another reusable source." : "Both share the same studio signature."} This study uses fictional, local content.</p>
    </div>
    {prepareBlocks(projected.blocks, registry, policy, { media: {} }, undefined, packId, { source: projected.synced, scope })}
  </div>;
}
