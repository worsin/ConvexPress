import { DefinitionPreviewPanel } from "./DefinitionPreviewPanel";
import { useMemo, useState } from "react";
import { useConvex, usePaginatedQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { useAuth } from "@/lib/auth-context";
import { useVerifiedSiteRuntime } from "@/control/SiteRuntimeProvider";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { Button } from "@/components/ui/button";
import { NewDefinition } from "./NewDefinition";
import type { DefinitionCreationClient } from "./create-model";
import { DefinitionWorkbench } from "./DefinitionWorkbench";
import { type DefinitionClient, type DefinitionId } from "./model";

export function CustomBlockLibrary() {
  const { can, isLoading, user } = useAuth(), client = useConvex(), runtime = useVerifiedSiteRuntime();
  if (isLoading) return <p role="status">Opening custom blocks…</p>;
  if (!can("blocks.compose") || !can("post.read")) return <p role="alert" className="p-6">You do not have permission to manage custom block definitions.</p>;
  if (!runtime?.target.websiteKey) return <p role="status">Select a website environment to view its custom blocks.</p>;
  return <Library key={`${client.url}:${user?._id}:${runtime.generation}`} />;
}
function Library() {
  const { can } = useAuth(), convex = useConvex(), runtime = useVerifiedSiteRuntime()!;
  const creationClient = useMemo<DefinitionCreationClient>(() => ({
    compose: args => convex.action(api.blockDefinitions.ai.compose, args),
    create: args => convex.mutation(api.blockDefinitions.drafts.create, args),
    accept: args => convex.mutation(api.blockDefinitions.composeContext.createDraft, args),
    get: args => convex.query(api.blockDefinitions.drafts.get, args),
    options: args => convex.query(api.blockDefinitions.composeResources.options, args),
  }), [convex]);
  const inventory = usePaginatedQuery(api.blockDefinitions.management.list, {}, { initialNumItems: 20 });
  const client = useMemo<DefinitionClient>(() => ({
    promotion: {
      exportPackage: args => convex.query(api.blockDefinitions.promotion.exportPackage, args),
      inspect: args => convex.query(api.blockDefinitions.promotion.inspect, args),
      confirm: args => convex.mutation(api.blockDefinitions.promotion.confirm, args),
    },
    styleForPack: args => convex.action(api.blockDefinitions.ai.styleForPack, args),
    get: args => convex.query(api.blockDefinitions.drafts.get, args),
    history: args => convex.query(api.blockDefinitions.drafts.history, args),
    save: args => convex.mutation(api.blockDefinitions.drafts.save, args),
    restore: args => convex.mutation(api.blockDefinitions.drafts.restore, args),
    review: args => convex.mutation(api.blockDefinitions.publication.setVersionState, args),
  }), [convex]);
  const [selected, setSelected] = useState<DefinitionId | null>(null), [locked, setLocked] = useState(false);
  const [creating, setCreating] = useState(false);
  useUnsavedChangesWarning({ isDirty: locked || creating, enabled: true });
  return <div className="space-y-6 p-6"><header className="max-w-3xl space-y-2"><h1 className="text-2xl font-semibold tracking-tight">Custom blocks</h1><p className="text-sm text-muted-foreground">Create reusable elements for this website. Each saved definition has its own version; approval makes it available in the page editor.</p></header>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(16rem,0.8fr)_minmax(0,2fr)]">
    <section aria-label="Custom block library" className="space-y-3 rounded-lg border border-border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Your definitions</h2>{can("post.create") && <Button size="sm" variant="outline" disabled={locked || creating} onClick={() => setCreating(true)}>New custom block</Button>}</div>
    {inventory.status === "LoadingFirstPage" ? <p role="status">Loading definitions…</p> : inventory.results.length === 0 ? <p className="text-sm text-muted-foreground">No custom definitions have been saved in this environment yet.</p> : <ul className="space-y-2">{inventory.results.map(item => <li key={item.id}><button type="button" disabled={locked || creating} aria-current={selected === item.id ? "true" : undefined} onClick={() => setSelected(item.id)} className="w-full rounded-md border border-border px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring aria-[current=true]:bg-muted disabled:opacity-50"><span className="block break-words text-sm font-medium">{item.title}</span><span className="mt-1 block break-all text-xs text-muted-foreground">{item.name}</span><span className="mt-1 block text-xs text-muted-foreground">Latest version {item.lastVersion} · {item.status === "promoted" ? "Promoted to SDK library" : item.activeVersion === null ? "Awaiting approval" : `Approved version ${item.activeVersion}`}</span></button></li>)}</ul>}
    {inventory.status !== "Exhausted" && inventory.status !== "LoadingFirstPage" && <Button variant="outline" disabled={locked || creating || inventory.status === "LoadingMore"} onClick={() => inventory.loadMore(20)}>{inventory.status === "LoadingMore" ? "Loading…" : "Load more definitions"}</Button>}
    </section>
    {creating ? <NewDefinition client={creationClient} scope={{ websiteKey: runtime.target.websiteKey!, instanceKey: runtime.target.instanceKey, deploymentOrigin: runtime.target.deploymentOrigin }} disabled={!can("post.create")} canAi={can("blocks.ai")} canMedia={can("media.read")} onCreated={id => { setSelected(id); setCreating(false); }} onCancel={() => setCreating(false)} /> : selected ? <DefinitionWorkbench key={selected} id={selected} client={client} canAi={can("blocks.ai")} canPromote={can("blocks.promote")} canEdit={can("post.update")} canRestore={can("post.restore") && can("post.update")} canApprove={can("post.publish") && can("post.update")} onLocked={setLocked} renderPreview={input => <DefinitionPreviewPanel {...input} />} /> : <section className="rounded-lg border border-dashed border-border p-8"><h2 className="font-medium">Choose a block to review</h2><p className="mt-2 text-sm text-muted-foreground">Inspect its fields and version history, save a new draft, or approve an exact saved version for use in pages.</p></section>}
    </div>
  </div>;
}
