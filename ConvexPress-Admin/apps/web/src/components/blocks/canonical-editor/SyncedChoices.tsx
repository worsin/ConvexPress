import { useEffect, useRef, useState } from "react";
import { canonicalSyncedOptionsSchema, canonicalSyncedRevisionsSchema, canonicalSyncedSelectionSchema, type CanonicalSyncedOption } from "@backend/canonical-blocks-foundation/documentContracts";
import { sameScope, type PickerResult, type Scope } from "../schema-editor/model";
import type { ResourcePickerClient } from "./CanonicalResourcePicker";
type Page = { isDone: boolean; continueCursor: string };
type Revision = Omit<CanonicalSyncedOption, "id">;
const button = "min-h-11 rounded border border-border px-4 text-sm focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
export function SyncedChoices({ client, scope, signal, onResult }: { client: ResourcePickerClient; scope: Scope; signal: AbortSignal; onResult: (value: PickerResult | null) => void }) {
  const [sources, setSources] = useState<CanonicalSyncedOption[]>([]), [sourcePage, setSourcePage] = useState<Page | null>(null);
  const [selected, setSelected] = useState<CanonicalSyncedOption | null>(null), [revisions, setRevisions] = useState<Revision[]>([]), [revisionPage, setRevisionPage] = useState<Page | null>(null);
  const [policy, setPolicy] = useState<"latest" | "pinned">("pinned"), [revision, setRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const active = useRef(true), pending = useRef(false), generation = useRef(0);
  const live = () => active.current && !signal.aborted;
  async function load(cursor: string | null, source?: CanonicalSyncedOption) {
    if (pending.current || !live()) return;
    pending.current = true; setBusy(true); setError(null);
    const epoch = generation.current;
    try {
      await client.authorize();
      if (!live()) return;
      if (source) {
        const result = canonicalSyncedRevisionsSchema.parse(await client.syncedRevisions(source.id, source.revision, cursor));
        if (result.sourceId !== source.id || result.publishedRevision !== source.revision) throw Error("Source changed");
        if (live() && epoch === generation.current) {
          setRevisionPage(result);
          setRevisions(old => [...(cursor === null ? [{ title: source.title, revision: source.revision, digest: source.digest }] : old), ...result.page.filter(item => !(cursor === null ? [source] : old).some(row => row.revision === item.revision))]);
        }
      } else {
        const result = canonicalSyncedOptionsSchema.parse(await client.syncedOptions(cursor));
        if (live() && epoch === generation.current) {
          setSourcePage(result);
          setSources(old => cursor === null ? result.page : [...old, ...result.page.filter(item => !old.some(row => row.id === item.id))]);
        }
      }
    } catch { if (live()) setError("Choices could not be loaded. Retry, or reopen the picker if the publication changed."); }
    finally { pending.current = false; if (live()) setBusy(false); }
  }
  useEffect(() => {
    active.current = true; void load(null);
    return () => { active.current = false; };
  }, []);
  function choose(source: CanonicalSyncedOption) {
    if (pending.current) return;
    generation.current++; setSelected(source); setPolicy("pinned"); setRevision(source.revision);
    setRevisions([{ title: source.title, revision: source.revision, digest: source.digest }]); setRevisionPage(null);
    void load(null, source);
  }
  async function insert() {
    if (!selected || revision === null || pending.current || !live()) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      await client.authorize();
      if (!live()) return;
      const number = policy === "latest" ? selected.revision : revision;
      const result = canonicalSyncedSelectionSchema.parse(await client.syncedSelect(selected.id, selected.revision, policy, number));
      const expected = policy === "latest" ? selected : revisions.find(row => row.revision === number);
      if (!expected || !sameScope(scope, result.scope) || result.id !== selected.id || result.publishedRevision !== selected.revision || result.revisionPolicy !== policy || result.revision !== number || result.digest !== expected.digest) throw Error("Selection changed");
      if (live()) onResult({ scope: result.scope, value: result.id, syncedRevision: { revisionPolicy: result.revisionPolicy, revision: result.revision } });
    } catch { if (live()) setError("This selection changed or is no longer available. Reopen the picker to choose its current publication."); }
    finally { pending.current = false; if (live()) setBusy(false); }
  }
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Choose a published section from this website. Private drafts stay in the reusable content editor.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!selected ? <>
      <ul className="max-h-80 divide-y divide-border overflow-auto">
        {sources.map(source => <li key={source.id}><button type="button" disabled={busy} onClick={() => choose(source)} className="min-h-16 w-full rounded p-3 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
          <span className="block font-medium">{source.title}</span><span className="text-xs text-muted-foreground">Published revision {source.revision}</span>
        </button></li>)}
      </ul>
      {sourcePage?.isDone && !sources.length && <p>No published reusable content is available. Publish a section in Reusable content first.</p>}
      {(!sourcePage?.isDone || error) && <button type="button" className={button} disabled={busy} onClick={() => void load(sourcePage?.continueCursor ?? null)}>{busy ? "Loading…" : error ? "Retry loading" : "Load more sections"}</button>}
    </> : <>
      <div className="rounded-lg border border-border p-4"><p className="font-medium">{selected.title}</p><p className="mt-1 text-xs text-muted-foreground">Current publication: revision {selected.revision}</p></div>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="mb-2 text-sm font-medium">How should this section update?</legend>
        <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-3"><input type="radio" name="synced-policy" checked={policy === "pinned"} onChange={() => setPolicy("pinned")} /><span><span className="block text-sm font-medium">Pin a published revision</span><span className="text-xs text-muted-foreground">Keep this version until you choose another.</span></span></label>
        <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-3"><input type="radio" name="synced-policy" checked={policy === "latest"} onChange={() => setPolicy("latest")} /><span><span className="block text-sm font-medium">Follow the latest publication</span><span className="text-xs text-muted-foreground">Receive updates when this reusable content is published.</span></span></label>
      </fieldset>
      {policy === "pinned" && <div className="space-y-2">
        <label className="block text-sm font-medium">Published revision<select aria-label="Published revision" disabled={busy} value={revision ?? ""} onChange={event => setRevision(Number(event.target.value))} className="mt-2 block min-h-11 w-full rounded border border-border bg-background px-3">
          {revisions.map(item => <option key={item.revision} value={item.revision}>Revision {item.revision} — {item.title}</option>)}
        </select></label>
        {(!revisionPage?.isDone || error) && <button type="button" className={button} disabled={busy} onClick={() => void load(revisionPage?.continueCursor ?? null, selected)}>{busy ? "Loading…" : error ? "Retry loading revisions" : "Load older revisions"}</button>}
      </div>}
      <div className="flex flex-wrap justify-between gap-3">
        <button type="button" className={button} disabled={busy} onClick={() => { generation.current++; setSelected(null); setError(null); }}>Choose another section</button>
        <button type="button" disabled={busy || revision === null} onClick={() => void insert()} className={`${button} bg-primary text-primary-foreground`}>{busy ? "Checking…" : "Use this section"}</button>
      </div>
    </>}
  </div>;
}
