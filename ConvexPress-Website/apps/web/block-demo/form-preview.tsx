import { ContactInteractiveDemo } from "./contact-live-preview";
import { useEffect, useMemo, useState } from "react";
import { createDemoContentPageHost, type InstalledDemoPageData } from "../src/templates/sdk/block-data/demo-channel";
import { stableKey } from "../src/templates/sdk/block-data/portable/contracts";
import { prepareBlocks, type BlockInstance, type RendererRegistry } from "../src/templates/sdk/block-renderer/model";
import { resolveFormDemo } from "./form-adapter";
const context = { scope: { websiteKey: "block-demo", instanceKey: "isolated-demo" }, documentKey: "synthetic-form", revision: "1", viewerKey: "preview" };
const policy = { enabledPlugins: ["forms"], capabilities: ["form.submission", "contact.submission", "reference.targetResolution"], disabledBlocks: [] };
export function FormDemo({ instance, registry }: { instance: BlockInstance; registry: RendererRegistry }) {
  const host = useMemo(() => createDemoContentPageHost(), []), tree = [instance], key = stableKey(tree);
  const [state, setState] = useState<{ key: string; grant: InstalledDemoPageData } | null>(null);
  const [interactive, setInteractive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true; host.invalidate(); setError(null);
    void resolveFormDemo(tree, context.scope, policy).then(envelope => { if (active) setState({ key, grant: host.install({ tree, context, policy, envelope }) }); })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : "Form fixture refused"); });
    return () => { active = false; host.invalidate(); };
  }, [host, key]);
  const view = error ? <p role="status">{error}</p> : state?.key === key ? prepareBlocks(tree, registry, policy, { media: {} }, { grant: state.grant, current: context }) : <p role="status">Preparing form…</p>;
  return <div data-demo-ready={state?.key === key ? "true" : "false"}>
    <p className="specimen-note">Synthetic form · shared fields and step navigation · no responses sent</p>
    {instance.name === "core/contact-form" && <button type="button" onClick={() => setInteractive(value => !value)}>{interactive ? "Show read-only preview" : "Try interactive demo"}</button>}
    {interactive && instance.name === "core/contact-form" ? <ContactInteractiveDemo key={key}>{view}</ContactInteractiveDemo> : view}
  </div>;
}
