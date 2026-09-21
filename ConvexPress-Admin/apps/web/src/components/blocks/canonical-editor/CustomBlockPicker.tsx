import { useEffect, useRef, useState } from "react";
import { appendCustomBlock, customBlockOptions, type CustomBlockChoice, type CustomBlockClient, type CustomBlockScope } from "./composed-picker";
import type { CanonicalDraft } from "./document-adapter";
import type { ResolverPolicy } from "@backend/canonical-blocks-foundation/contracts";

export function CustomBlockPicker({ client, scope, revision, policy, disabled, insert }: {
  client: CustomBlockClient; scope: CustomBlockScope; revision: number; policy: ResolverPolicy; disabled: boolean;
  insert: (transform: (draft: CanonicalDraft) => { draft: CanonicalDraft; id: string }) => boolean;
}) {
  const [page, setPage] = useState<ReturnType<typeof customBlockOptions> | null>(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const current = useRef({ active: true, disabled, revision });
  current.current.disabled = disabled; current.current.revision = revision;
  useEffect(() => { current.current.active = true; return () => { current.current.active = false; }; }, []);
  const available = () => current.current.active && !current.current.disabled && current.current.revision === revision;
  const load = async (cursor: string | null) => {
    if (busy || !available()) return;
    setBusy(true); setError(null); setChoice("");
    try {
      const next = customBlockOptions(await client.listCustomBlocks({ expectedRevision: revision, expectedScope: scope, paginationOpts: { numItems: 8, cursor } }), scope);
      if (available()) setPage(next);
    } catch { if (available()) setError("Custom blocks could not be loaded. Refresh the list to try again."); }
    finally { if (current.current.active) setBusy(false); }
  };
  const add = async (selected: CustomBlockChoice) => {
    if (busy || !available()) return;
    setBusy(true); setError(null);
    try {
      const result = await client.selectCustomBlock({ expectedRevision: revision, expectedScope: scope, id: selected.id, version: selected.version, expectedDigest: selected.digest });
      if (available() && !insert(draft => appendCustomBlock(draft, result, selected, scope, policy))) throw Error("Insertion refused");
    } catch { if (available()) setError("This block could not be added. Refresh its approval, or check the page’s size and enabled features. Your edits are still here."); }
    finally { if (current.current.active) setBusy(false); }
  };
  const selected = page?.page.find(item => item.id === choice);
  return <section aria-label="Custom blocks" className="space-y-3 rounded-lg border border-border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-medium">Custom blocks</h2><p className="text-sm text-muted-foreground">Approved designs for this website.</p></div>
      <button type="button" className="min-h-11 rounded-md border px-4 text-sm disabled:opacity-50" disabled={disabled || busy} onClick={() => void load(null)}>{page ? "Refresh custom blocks" : "Browse custom blocks"}</button></div>
    {page && <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm">Choose a custom block<select aria-label="Choose a custom block" className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3" value={choice} disabled={disabled || busy} onChange={event => setChoice(event.target.value)}><option value="">Choose a design</option>{page.page.map(item => <option key={item.id} value={item.id}>{item.title} · version {item.version}</option>)}</select></label>
      <button type="button" className="min-h-11 rounded-md border px-4 text-sm disabled:opacity-50" disabled={disabled || busy || !selected} onClick={() => selected && void add(selected)}>Add custom block</button>
      {!page.isDone && <button type="button" className="min-h-11 px-3 text-sm underline disabled:opacity-50" disabled={disabled || busy} onClick={() => void load(page.continueCursor)}>More custom blocks</button>}
      {!page.page.length && <p className="w-full text-sm text-muted-foreground">{page.isDone ? "No approved custom blocks on this page of results." : "No approved blocks in this group. Continue to see more."}</p>}</div>}
    {busy && <p role="status" className="text-sm text-muted-foreground">Loading custom blocks…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
