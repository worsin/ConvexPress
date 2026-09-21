import { useEffect, useMemo, useState } from "react";
import { createDemoContentPageHost, type InstalledDemoPageData } from "../src/templates/sdk/block-data/demo-channel";
import { stableKey } from "../src/templates/sdk/block-data/portable/contracts";
import { parsePollDefinition } from "../src/templates/sdk/block-data/portable/pollContracts";
import { resolvePollDemo } from "./poll-adapter";
import { prepareBlocks, type BlockInstance, type RendererRegistry } from "../src/templates/sdk/block-renderer/model";
import { PollProvider, PollView, type PollSnapshot } from "../src/templates/sdk/block-renderer/poll";
const context = { scope: { websiteKey: "block-demo", instanceKey: "isolated-demo" }, documentKey: "synthetic-poll", revision: "1", viewerKey: "preview" };
const policy = { enabledPlugins: ["forms"], capabilities: ["poll.submission"], disabledBlocks: [] };
function Interactive({ initial }: { initial: PollSnapshot }) {
  const [poll, setPoll] = useState(initial), [fail, setFail] = useState(false), [reset, setReset] = useState(0);
  const attrs = parsePollDefinition({ question: poll.question, options: poll.options.map(({ key, label }) => ({ key, label })), showResults: poll.total !== null, responsePolicy: poll.responsePolicy });
  return <><div className="specimen-controls"><label><input type="checkbox" checked={fail} onChange={event => setFail(event.target.checked)} /> Simulate a failed submission</label><button type="button" onClick={() => { setPoll(initial); setReset(value => value + 1); }}>Reset poll demo</button></div>
    <PollView key={reset} attrs={attrs} poll={poll} onVote={async key => {
      await new Promise(resolve => setTimeout(resolve, 450));
      if (fail) throw new Error("Synthetic failure");
      setPoll(previous => ({ ...previous, canVote: false, votedKey: key, total: previous.total === null ? null : previous.total + 1, options: previous.options.map(option => ({ ...option, count: option.count === null ? null : option.count + (option.key === key ? 1 : 0) })) }));
      return { accepted: true, optionKey: key };
    }} /></>;
}
export function PollDemo({ instance, registry }: { instance: BlockInstance; registry: RendererRegistry }) {
  const host = useMemo(() => createDemoContentPageHost(), []), tree = [instance], key = stableKey(tree);
  const [state, setState] = useState<{ key: string; grant: InstalledDemoPageData } | null>(null), [error, setError] = useState<string | null>(null), [interactive, setInteractive] = useState(false);
  useEffect(() => {
    let active = true; host.invalidate(); setError(null);
    void resolvePollDemo(tree, context.scope, policy).then(envelope => { if (active) setState({ key, grant: host.install({ tree, context, policy, envelope }) }); })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : "Poll fixture refused"); });
    return () => { active = false; host.invalidate(); };
  }, [host, key]);
  const view = error ? <p role="status">{error}</p> : state?.key === key ? prepareBlocks(tree, registry, policy, { media: {} }, { grant: state.grant, current: context }) : <p role="status">Preparing poll…</p>;
  return <div data-demo-ready={state?.key === key ? "true" : "false"}><p className="specimen-note">Synthetic poll · example results · no responses sent</p><button type="button" onClick={() => setInteractive(value => !value)}>{interactive ? "Show read-only preview" : "Try interactive demo"}</button>
    {interactive ? <PollProvider value={{ render: poll => <Interactive key={`${key}-${poll.definitionVersion}`} initial={poll} /> }}>{view}</PollProvider> : view}
  </div>;
}
