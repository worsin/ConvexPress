import { LegacySyncedImport } from "./LegacySyncedImport";
import { SyncedContentEditor } from "./SyncedContentEditor";
import { SyncedRefreshStatus } from "./SyncedRefreshStatus";
import { SyncedConsumerIndex } from "./SyncedConsumerIndex";
import { useMemo, useState } from "react";
import { useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { validateCanonicalTree } from "@backend/canonical-blocks-foundation/generated/instances";
import type { CanonicalTree } from "@backend/canonical-blocks-foundation/generated/types";
import { syncedContentDigest } from "@backend/canonical-blocks-foundation/syncedContent";
import { useAuth } from "@/lib/auth-context";
import { useVerifiedSiteRuntime } from "@/control/SiteRuntimeProvider";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { Button } from "@/components/ui/button";
import { SchemaBlockForm } from "@/components/blocks/schema-editor/SchemaBlockForm";

type Scope = { websiteKey: string; instanceKey: string };
export function SyncedContentLibrary() {
  const { can, isLoading, user } = useAuth(), client = useConvex(), runtime = useVerifiedSiteRuntime();
  if (isLoading) return <p role="status">Opening synced content…</p>;
  if (!can("post.read")) return <p role="alert">You do not have permission to view this website’s synced content.</p>;
  if (!runtime?.target.websiteKey) return <p role="status">Select a website environment to view its synced content.</p>;
  return <Library key={`${client.url}:${user?._id}:${runtime.generation}`} scope={{ websiteKey: runtime.target.websiteKey, instanceKey: runtime.target.instanceKey }} />;
}
function Library({ scope }: { scope: Scope }) {
  const { can } = useAuth();
  const create = useMutation(api.syncedBlocks.content.create);
  const [creating, setCreating] = useState(false), [newTitle, setNewTitle] = useState(""), [createError, setCreateError] = useState(""), [createPending, setCreatePending] = useState(false);
  useUnsavedChangesWarning({ isDirty: creating && (newTitle.length > 0 || createPending), enabled: true });
  const inventory = usePaginatedQuery(api.syncedBlocks.queries.list, {}, { initialNumItems: 20 });
  const [importLocked,setImportLocked]=useState(false);
  const [selection, setSelection] = useState<Id<"syncedBlocks"> | null>(null), [locked, setLocked] = useState(false);
  return <div className="space-y-6 p-6">
    <header className="max-w-3xl space-y-2"><h1 className="text-2xl font-semibold tracking-tight">Synced content</h1><p className="text-sm text-muted-foreground">Review reusable content and its saved revisions. Restoring creates a new draft; publishing updates references that follow the latest published revision.</p></header>
    {can("manage_options") && <SyncedConsumerIndex />}
    {can("post.create") && can("post.update") && <LegacySyncedImport scope={scope} disabled={creating || locked} lock={setImportLocked} onImported={setSelection} />}
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(16rem,0.8fr)_minmax(0,2fr)]">
      <section aria-label="Synced content library" className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Your library</h2>{can("post.create") && can("post.update") && <Button size="sm" variant="outline" disabled={locked || creating || importLocked} onClick={() => { setCreating(true);setLocked(true);setNewTitle("");setCreateError(""); }}>New synced content</Button>}</div>
        {creating && <form className="space-y-3 rounded-md border border-border p-3" onSubmit={async event => {
          event.preventDefault();if (createPending || createError || !newTitle.trim()) return;
          setCreatePending(true);
          try { const result = await create({ title: newTitle.trim(), blocks: [] });setSelection(result.id);setCreating(false);setNewTitle("");setLocked(false); }
          catch { setCreateError("Creation could not be confirmed. Reload the library and check for this title before creating another source."); }
          finally { setCreatePending(false); }
        }}><label className="block space-y-2 text-sm font-medium">Reusable content title<input value={newTitle} maxLength={512} disabled={createPending || !!createError} onChange={event => setNewTitle(event.target.value)} className="block w-full rounded-md border border-input bg-background px-3 py-2" /></label>{createError && <p role="alert" className="text-sm text-destructive">{createError}</p>}<div className="flex flex-wrap gap-2"><Button size="sm" disabled={createPending || !!createError || !newTitle.trim()} type="submit">{createPending ? "Creating…" : "Create draft"}</Button><Button size="sm" variant="outline" type="button" disabled={createPending} onClick={() => { setCreating(false);setNewTitle("");setLocked(false); }}>Cancel</Button></div></form>}
        {inventory.status === "LoadingFirstPage" ? <p role="status">Loading saved content…</p> : inventory.results.length === 0 ? <p className="text-sm text-muted-foreground">No synced content has been saved in this environment yet.</p> :
          <ul className="space-y-2">{inventory.results.map(item => <li key={item.id}><button type="button" disabled={locked || importLocked} aria-current={selection === item.id ? "true" : undefined} onClick={() => setSelection(item.id)} className="w-full rounded-md border border-border px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring aria-[current=true]:bg-muted disabled:opacity-50"><span className="block break-words text-sm font-medium">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">Draft {item.revision} · {item.publishedRevision === null ? "Not published" : `Published ${item.publishedRevision}`}</span></button></li>)}</ul>}
        {inventory.status !== "Exhausted" && inventory.status !== "LoadingFirstPage" && <Button variant="outline" disabled={locked || importLocked || inventory.status === "LoadingMore"} onClick={() => inventory.loadMore(20)}>{inventory.status === "LoadingMore" ? "Loading…" : "Load more content"}</Button>}
      </section>
      {selection && !creating && !importLocked ? <RevisionWorkspace key={selection} id={selection} scope={scope} setLocked={setLocked} /> : <section className="rounded-lg border border-dashed border-border p-8"><h2 className="font-medium">Choose content to review</h2><p className="mt-2 text-sm text-muted-foreground">Inspect saved fields, compare revision titles, and restore or publish a reviewed version.</p></section>}
    </div>
  </div>;
}
function RevisionWorkspace({ id, scope, setLocked }: { id: Id<"syncedBlocks">; scope: Scope; setLocked: (locked: boolean) => void }) {
  const { can } = useAuth(), client = useConvex();
  const current = useQuery(api.syncedBlocks.queries.head, { id });
  const history = usePaginatedQuery(api.syncedBlocks.queries.revisions, { id }, { initialNumItems: 10 });
  const [selected, setSelected] = useState<number | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [editing, setEditing] = useState(false), [editorDirty, setEditorDirty] = useState(false);
  const [review, setReview] = useState<{ generation: number; revision: number; digest: string; dependencies: number } | null>(null);
  const revision = selected ?? current?.revision;
  const snapshot = useQuery(api.syncedBlocks.queries.revision, revision === undefined ? "skip" : { id, revision });
  const unlock = useMutation(api.syncedBlocks.content.unlockImported);
  const restore = useMutation(api.syncedBlocks.content.restore), publish = useMutation(api.syncedBlocks.content.publish), withdraw = useMutation(api.syncedBlocks.content.withdraw);
  const checked = useMemo(() => {
    if (!snapshot || snapshot.state !== "ready") return null;
    try { const blocks = validateCanonicalTree(snapshot.blocks); return syncedContentDigest(snapshot.title, blocks) === snapshot.digest ? blocks : null; }
    catch { return null; }
  }, [snapshot]);
  useUnsavedChangesWarning({ isDirty: busy || review !== null, enabled: true });
  async function act(action: () => Promise<string>) {
    if (busy) return;
    setBusy(true);setLocked(true);setError("");setMessage("");
    try { setMessage(await action()); }
    catch { setReview(null);setError("The content or your access changed, or the request could not be completed. Review the current revision before trying again."); }
    finally { setBusy(false);setLocked(false); }
  }
  const onEditorDirty = useMemo(() => (dirty: boolean) => { setEditorDirty(dirty);setLocked(dirty); }, [setLocked]);
  const choose = (value: number | null) => { setSelected(value);setReview(null);setError("");setMessage(""); };
  // A new head changes the revision query arguments. Keep the composer mounted
  // while that independent history read loads, or local edits would be lost.
  if (!current || (!editing && !snapshot)) return <p role="status">Opening the saved revision…</p>;
  const viewedRevision = snapshot?.revision ?? current.revision;
  const ready = snapshot?.state === "ready" ? snapshot : null;
  const reviewCurrent = review && review.generation === current.generation && review.revision === viewedRevision;
  return <section className="min-w-0 space-y-5" aria-label="Synced content revisions">
    <header className="space-y-2"><h2 className="break-words text-xl font-semibold">{ready?.title ?? `Revision ${viewedRevision} unavailable`}</h2><p className="text-sm text-muted-foreground">Viewing revision {viewedRevision} · Current draft {current.revision} · {current.publishedRevision === null ? "Not published" : `Published revision ${current.publishedRevision}`}</p></header>
    {message && <p role="status" className="rounded-md border border-border bg-muted p-3 text-sm">{message}</p>}
    {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
    {current.isLocked && <div className="rounded-md border border-border p-3 text-sm"><p>This imported source has an editing lock.</p>{can("post.update") && <Button variant="outline" disabled={busy} onClick={()=>void act(async()=>{await unlock({id,expectedGeneration:current.generation});return "Editing lock released. Existing content history is retained.";})}>Unlock imported content</Button>}</div>}
    <SyncedRefreshStatus key={id} id={id} generation={current.generation} published={current.publishedRevision !== null} canRetry={can(current.publishedRevision === null ? "post.unpublish" : "post.publish")} disabled={busy || editorDirty || review !== null} />
    {editing ? <div className="space-y-4"><div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={editorDirty} onClick={() => { setEditing(false);setLocked(false); }}>Return to revision review</Button><p className="text-sm text-muted-foreground">Save your changes before returning to revision review. Publication is reviewed separately.</p></div><SyncedContentEditor id={id} onDirtyChange={onEditorDirty} /></div> : <>
    <div className="flex flex-wrap gap-2">{can("post.update") && <Button variant="outline" disabled={busy || review !== null || current.isLocked} onClick={() => { setSelected(null);setEditing(true);setReview(null); }}>Edit current draft</Button>}<Button variant="outline" disabled={busy} onClick={() => choose(null)}>Current draft</Button>
      {ready && can("post.restore") && can("post.update") && <Button variant="outline" disabled={busy || current.isLocked || !checked || viewedRevision === current.revision} onClick={() => void act(async () => { const result = await restore({ id, expectedGeneration: current.generation, revision: viewedRevision, expectedDigest: ready.digest });setReview(null);return result.changed ? `Restored as new draft revision ${result.revision}. The published revision has not changed.` : "The current draft already matches this revision."; })}>Restore as new draft</Button>}
      {ready && can("post.publish") && <Button disabled={busy || !checked || review !== null} onClick={() => void act(async () => { const result = await client.query(api.syncedBlocks.content.reviewPublication, { id, expectedGeneration: current.generation, revision: viewedRevision });setReview({ generation: current.generation, revision: viewedRevision, digest: result.digest, dependencies: new Set(result.dependencies.map(item => `${item.id}:${item.revision}`)).size });return "Publication review is ready. Check the saved content below before confirming."; })}>Review publication</Button>}
      {can("post.unpublish") && current.publishedRevision !== null && <Button variant="outline" disabled={busy || review !== null} onClick={() => { setReview(null);void act(async () => { await withdraw({ id, expectedGeneration: current.generation });return "Synced content withdrawn. Published references to this source are now unavailable."; }); }}>Withdraw publication</Button>}
    </div>
    {review && <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4" aria-label="Publication review"><p className="text-sm">{reviewCurrent ? `Publish revision ${review.revision}? This review covers ${review.dependencies} reusable ${review.dependencies === 1 ? "revision" : "revisions"}. References following the latest publication will update; pinned references keep their selected revision.` : "This content changed after review. Review it again before publishing."}</p><div className="flex gap-2"><Button disabled={busy || !reviewCurrent || !can("post.publish")} onClick={() => void act(async () => { await publish({ id, expectedGeneration: review.generation, revision: review.revision, reviewDigest: review.digest });setReview(null);return `Revision ${review.revision} published.`; })}>Confirm publication</Button><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Cancel review</Button></div></div>}
    <section aria-label="Revision history" className="space-y-3 rounded-lg border border-border p-4"><h3 className="font-semibold">Revision history</h3><ol className="divide-y divide-border">{history.results.map(item => <li key={item.revision} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words text-sm font-medium">Revision {item.revision} · {item.title}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()} · {item.isPublished ? "Currently published" : item.wasPublished ? "Previously published" : "Draft"}</p></div><Button variant="outline" size="sm" disabled={busy} onClick={() => choose(item.revision)}>Review revision {item.revision}</Button></li>)}</ol>{history.status === "LoadingFirstPage" && <p role="status">Loading revision history…</p>}{history.status !== "Exhausted" && history.status !== "LoadingFirstPage" && <Button variant="outline" disabled={busy || history.status === "LoadingMore"} onClick={() => history.loadMore(10)}>{history.status === "LoadingMore" ? "Loading…" : "Load older revisions"}</Button>}</section>
    <section aria-label="Saved block fields" className="space-y-3"><h3 className="font-semibold">Saved block fields</h3><p className="text-sm text-muted-foreground">These fields show the saved revision and are read-only.</p>{checked ? checked.length ? <BlockFields blocks={checked} scope={scope} revision={viewedRevision} /> : <p className="text-sm text-muted-foreground">This revision has no blocks.</p> : <p role="alert">This revision failed its content integrity check.</p>}</section>
    </>}
  </section>;
}
function BlockFields({ blocks, scope, revision }: { blocks: CanonicalTree; scope: Scope; revision: number }) {
  return <div className="space-y-3">{blocks.map(block => <details key={block.id} open className="min-w-0 rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-medium">{block.name.split("/").pop()?.replaceAll("-", " ")}</summary><div className="mt-4"><SchemaBlockForm mode="preview" disabled blockId={block.id} name={block.name} version={block.version} value={block.attrs} revision={String(revision)} scope={scope} />{block.children?.length ? <div className="mt-4"><BlockFields blocks={block.children} scope={scope} revision={revision} /></div> : null}</div></details>)}</div>;
}
