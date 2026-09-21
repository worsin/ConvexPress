import { useEffect, useMemo, useState } from "react";
import { createDemoContentPageHost, type InstalledDemoPageData } from "../src/templates/sdk/block-data/demo-channel";
import { stableKey } from "../src/templates/sdk/block-data/portable/contracts";
import { blockSchemas } from "../src/templates/sdk/block-data/portable/generated/schemas";
import { prepareBlocks, type BlockInstance, type RendererRegistry } from "../src/templates/sdk/block-renderer/model";
import { BundleProvider, type BundleHostProps } from "../src/templates/sdk/block-renderer/bundle";
import { bundleDemo, demoBundleQuote, resolveBundleDemo } from "./bundle-adapter";
const context = { scope: { websiteKey: "block-demo", instanceKey: "isolated-demo" }, documentKey: "synthetic-bundle", revision: "1", viewerKey: "synthetic-public-viewer" };
const policy = { enabledPlugins: ["commerce", "commerceBundles"], capabilities: ["reference.targetResolution"], disabledBlocks: [] };
function DemoHost({ offer, children }: BundleHostProps) {
  const [choices, setChoices] = useState(offer.defaults), [message, setMessage] = useState("");
  return children({ choices, quote: demoBundleQuote(offer, choices), ready: true, busy: false, message,
    change: next => { setChoices(next); setMessage(""); }, reset: () => { setChoices(offer.defaults); setMessage(""); },
    add: async () => { setMessage("Demo only — your set is ready. No cart or order was created."); },
  });
}
export function BundleDemo({ instance, registry, packId }: { instance: BlockInstance; registry: RendererRegistry; packId: string }) {
  const host = useMemo(() => createDemoContentPageHost(), []), [scenario, setScenario] = useState("configurable");
  const tree = [{ ...instance, attrs: { ...blockSchemas["commerce/bundle-offer"].parse(instance.attrs), bundle: scenario === "unavailable" ? "demo-unavailable" : bundleDemo.id, title: "Make room for a slower morning." } }];
  const key = stableKey([tree, scenario]), [resolved, setResolved] = useState<{ key: string; grant: InstalledDemoPageData } | null>(null), [failure, setFailure] = useState<string | null>(null);
  useEffect(() => { let active = true; host.invalidate(); setFailure(null);
    void resolveBundleDemo(tree, context.scope, policy, scenario).then(envelope => { if (active) setResolved({ key, grant: host.install({ tree, context, policy, envelope }) }); }).catch(error => { if (active) setFailure(error instanceof Error ? error.message : "Bundle fixture refused"); });
    return () => { active = false; host.invalidate(); };
  }, [host, key]);
  return <div aria-label="Bundle offer study" data-demo-ready={resolved?.key === key ? "true" : "false"}>
    <p className="specimen-note">Fictional bundle, prices and purchase interaction for design testing</p>
    <label className="specimen-note">Bundle preview <select aria-label="Bundle preview scenario" value={scenario} onChange={event => setScenario(event.target.value)} style={{ minHeight: 44, marginLeft: 12, padding: "0 12px", color: "var(--foreground)", background: "var(--background)", border: "1px solid var(--border)", borderRadius: 6 }}>
      <option value="configurable">Build your set</option><option value="fixed">Fixed set</option><option value="sold-out">Unavailable configuration</option><option value="unavailable">Unavailable selection</option>
    </select></label>
    {failure ? <p role="status">{failure}</p> : resolved?.key === key ? <BundleProvider key={key} host={DemoHost}>{prepareBlocks(tree, registry, policy, { media: {} }, { grant: resolved.grant, current: context }, packId)}</BundleProvider> : <p role="status">Loading bundle study…</p>}
  </div>;
}
