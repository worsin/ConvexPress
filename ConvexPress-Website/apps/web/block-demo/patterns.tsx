import { useEffect, useMemo, useState } from "react";
import { templatePatterns, type TemplatePattern } from "../../../../blocks/.generated/patterns";
import { PrimitiveProvider, type PackPartsRegistry } from "../src/templates/sdk/primitives";
import { createDemoContentPageHost, type InstalledDemoPageData } from "../src/templates/sdk/block-data/demo-channel";
import { prepareBlocks } from "../src/templates/sdk/block-renderer/model";
import { stagedRenderers } from "../src/templates/sdk/block-renderer/discovery";
import { resolvePostGridDemo } from "./post-grid-adapter";
import { resolveProductsDemo } from "./products-adapter";
const policy = { enabledPlugins: ["commerce"], capabilities: ["tree.children", "reference.targetResolution"], disabledBlocks: [] };
export function PatternStudies({ packId, registry }: { packId: string; registry: PackPartsRegistry }) {
  const [selected, setSelected] = useState("welcome");
  const patterns = templatePatterns.filter(pattern => pattern.packId === packId);
  const pattern = patterns.find(item => item.id === `${packId}/${selected}`) ?? patterns[0];
  if (!pattern) return null;
  return <section id="patterns" aria-label="Template section studies" className="pattern-studies">
    <div className="pattern-heading">
      <div><p className="lab-kicker">Ready to make your own</p><h2>A place to start.</h2><p>Composed from the same editable blocks. Styled by the selected template.</p></div>
      <label>Explore a section<select id="template-pattern" value={pattern.id} onChange={event => setSelected(event.target.value.split("/")[1])}>{patterns.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    </div>
    <p className="specimen-note">{pattern.description} Collection previews use synthetic records; starter sections contain no record IDs.</p>
    <div className="pattern-canvas" data-pattern={pattern.id}>
      <PrimitiveProvider packId={packId} registry={registry}><PatternPreview key={`${packId}:${pattern.id}`} pattern={pattern} packId={packId} /></PrimitiveProvider>
    </div>
  </section>;
}
function PatternPreview({ pattern, packId }: { pattern: TemplatePattern; packId: string }) {
  const host = useMemo(() => createDemoContentPageHost(), []);
  const context = useMemo(() => ({ scope: { websiteKey: "block-demo", instanceKey: "isolated-demo" }, documentKey: `pattern:${pattern.id}`, revision: "1", viewerKey: "synthetic-public-viewer" }), [pattern.id]);
  const [grant, setGrant] = useState<InstalledDemoPageData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const resolve = pattern.id === "depot/explore" ? resolveProductsDemo : resolvePostGridDemo;
    void resolve(pattern.blocks, context.scope, policy).then(envelope => {
      if (active) setGrant(host.install({ tree: pattern.blocks, context, policy, envelope }));
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; host.invalidate(); };
  }, [host, pattern, context]);
  return <div data-demo-ready={grant ? "true" : "false"}>{failed ? <p role="alert">This section preview could not load.</p> : grant ? prepareBlocks(pattern.blocks, stagedRenderers, policy, { media: {} }, { grant, current: context }, packId) : <p role="status">Preparing this section…</p>}</div>;
}
