import { useEffect, useId, useRef, useState } from "react";
import { aiFailureMessage } from "@backend/lib/aiFailure";
import { packDesigns } from "@backend/canonical-blocks-foundation/generated/pack-designs";
import { Button } from "@/components/ui/button";
import { FieldDesigner } from "./FieldDesigner";
import { CompositionDesigner } from "./CompositionDesigner";
import { checkedSaved, starterDefinition, type DefinitionId } from "./model";
import { checkedNew, type ComposeRequest, type DefinitionCreationClient, type DefinitionScope, type ResourceKind } from "./create-model";

export function NewDefinition({ client, scope, disabled, canAi, canMedia, onCreated, onCancel, initialPackId = "core" }: {
  client: DefinitionCreationClient; scope: DefinitionScope; disabled: boolean; canAi: boolean; canMedia: boolean;
  onCreated: (id: DefinitionId) => void; onCancel: () => void; initialPackId?: string;
}) {
  const id = useId();
  const [title, setTitle] = useState(""), [slug, setSlug] = useState(""), [prompt, setPrompt] = useState(""), [packId, setPackId] = useState(initialPackId);
  const [source, setSource] = useState<string | null>(null), [request, setRequest] = useState<(ComposeRequest & { expectedFingerprint: string }) | null>(null);
  const [selections, setSelections] = useState<Array<{ kind: ResourceKind; id: string; title: string }>>([]);
  const [choices, setChoices] = useState<{ kind: ResourceKind; page: Array<{ id: string; title: string }>; cursor: string | null } | null>(null);
  const [busy, setBusy] = useState<"generate" | "save" | "resources" | null>(null), [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false), [fieldInvalid, setFieldInvalid] = useState(false);
  const state = useRef({ alive: true, pending: false, disabled, canAi, canMedia });
  Object.assign(state.current, { disabled, canAi, canMedia });
  useEffect(() => { state.current.alive = true; return () => { state.current.alive = false; }; }, []);
  const name = `composed/${slug}`, validName = /^[a-z][a-z0-9-]*$/.test(slug) && slug.length <= 150;
  const locked = disabled || !!busy || uncertain, aiLocked = locked || !canAi;
  let invalid = "";
  if (source !== null) { try { checkedNew(source, name); } catch (issue) { invalid = issue instanceof Error ? issue.message : "Check the definition."; } }
  async function run(phase: NonNullable<typeof busy>, action: () => Promise<void>) {
    if (state.current.pending || state.current.disabled || uncertain) return;
    state.current.pending = true; setBusy(phase); setError("");
    try { await action(); }
    catch (failure) {
      if (state.current.alive) {
        if (phase === "save") setUncertain(true);
        setError(phase === "save" ? "Creation could not be confirmed. Your source is retained. Close this review and check the library for this block name before trying again."
          : phase === "generate" ? aiFailureMessage(failure, "No proposal could be verified. Check your AI configuration, permissions and selected content, then try again. Nothing was saved.")
          : "These resources could not be loaded. Check this website’s features and your permissions.");
      }
    } finally { state.current.pending = false; if (state.current.alive) setBusy(null); }
  }
  function generate() {
    if (aiLocked || !validName || !prompt.trim()) return;
    const args: ComposeRequest = { name, packId, expectedScope: scope, resources: { products: selections.filter(item => item.kind === "product").map(item => item.id), media: selections.filter(item => item.kind === "media").map(item => item.id) } };
    void run("generate", async () => {
      const proposal = await client.compose({ ...args, prompt: prompt.trim() });
      if (!state.current.alive || state.current.disabled || !state.current.canAi) return;
      const checked = checkedNew(proposal.definitionJson, args.name, proposal.digest);
      if (!proposal.fingerprint) throw Error("Missing review context");
      setRequest({ ...args, expectedFingerprint: proposal.fingerprint });
      setSource(JSON.stringify(checked.definition, null, 2)); setChoices(null); setFieldInvalid(false);
    });
  }
  function choose(kind: ResourceKind, cursor: string | null = null) {
    if (aiLocked || kind === "media" && !canMedia) return;
    void run("resources", async () => {
      const result = await client.options({ kind, cursor, expectedScope: scope });
      if (state.current.alive && !state.current.disabled && state.current.canAi && (kind !== "media" || state.current.canMedia)) setChoices({ kind, ...result });
    });
  }
  function save() {
    if (locked || source === null || invalid || fieldInvalid || request && !canAi) return;
    const value = checkedNew(source, name);
    void run("save", async () => {
      const receipt = request ? await client.accept({ ...request, definitionJson: value.json }) : await client.create({ definitionJson: value.json });
      if (receipt.name !== name || receipt.version !== 1 || receipt.generation !== 1 || receipt.digest !== value.digest) throw Error("Creation receipt mismatch");
      const saved = await client.get({ id: receipt.id }); checkedSaved(saved);
      if (saved.id !== receipt.id || saved.name !== name || saved.version !== 1 || saved.generation !== 1 || saved.digest !== value.digest || saved.versionStatus !== "draft" || saved.activeVersion !== null) throw Error("Reopened draft changed");
      if (state.current.alive && !state.current.disabled) onCreated(receipt.id);
    });
  }
  const inputClass = "block min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return <section aria-label="New custom block" className="min-w-0 space-y-5 rounded-lg border border-border bg-card p-5">
    <header className="space-y-2"><h2 className="text-xl font-semibold">{source === null ? "Create a reusable block" : "Make this block yours"}</h2><p className="text-sm text-muted-foreground">{source === null ? "Start with an editable heading or describe a complete block. You’ll review its fields and layout before saving." : "Review the editable fields and composition. Saving creates an unapproved draft; you can then preview it on your Website and approve it for page editors."}</p></header>
    {source === null ? <>
      <label htmlFor={id + "-name"} className="block space-y-2 text-sm font-medium"><span>Block name</span><input id={id + "-name"} value={slug} maxLength={150} disabled={locked} onChange={event => setSlug(event.target.value)} placeholder="studio-introduction" className={inputClass} /></label>
      <p className="text-xs text-muted-foreground">Use lowercase letters, numbers and hyphens. This permanent name identifies the block within this website.</p>
      <section aria-label="Start a simple block" className="space-y-3"><label htmlFor={id + "-title"} className="block space-y-2 text-sm font-medium"><span>Block title</span><input id={id + "-title"} value={title} maxLength={120} disabled={locked} onChange={event => setTitle(event.target.value)} className={inputClass} /></label><Button type="button" variant="outline" disabled={locked || !validName || !title.trim()} onClick={() => { const value = starterDefinition(title, slug); setSource(JSON.stringify(value.definition, null, 2)); setRequest(null); setFieldInvalid(false); setError(""); }}>Start with a heading</Button></section>
      {canAi && <section aria-label="AI custom block generator" className="space-y-3 border-t border-border pt-5">
        <h3 className="font-semibold">Design with AI</h3>
        <label htmlFor={id + "-pack"} className="block text-sm font-medium">Design template</label><select id={id + "-pack"} value={packId} disabled={aiLocked} onChange={event => setPackId(event.target.value)} className={inputClass}>{Object.values(packDesigns).map(pack => <option key={pack.id} value={pack.id}>{pack.name}</option>)}</select>
        <label htmlFor={id + "-prompt"} className="block text-sm font-medium">Describe your block</label><textarea id={id + "-prompt"} value={prompt} maxLength={8000} rows={4} disabled={aiLocked} onChange={event => setPrompt(event.target.value)} placeholder="A studio services grid with an introduction, editable service cards and a clear invitation to get in touch…" className={inputClass} />
        <p className="text-xs text-muted-foreground">Choose any products or media the block should use. Only selected items are shared with your configured AI provider.</p>
        <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={aiLocked} onClick={() => choose("product")}>Choose products</Button>{canMedia && <Button type="button" size="sm" variant="outline" disabled={aiLocked} onClick={() => choose("media")}>Choose media</Button>}</div>
        {choices && <section aria-label="Available resources" className="space-y-2 rounded-md border border-border p-3">{choices.page.length === 0 && <p className="text-sm text-muted-foreground">No available items on this page.</p>}<ul className="space-y-1">{choices.page.map(item => <li key={item.id}><Button type="button" variant="ghost" className="h-auto min-h-11 max-w-full whitespace-normal text-left" disabled={aiLocked || selections.some(value => value.kind === choices.kind && value.id === item.id) || selections.filter(value => value.kind === choices.kind).length >= (choices.kind === "product" ? 6 : 12)} onClick={() => setSelections(items => [...items, { ...item, kind: choices.kind }])}>Add {item.title}</Button></li>)}</ul>{choices.cursor !== null && <Button type="button" variant="outline" disabled={aiLocked} onClick={() => choose(choices.kind, choices.cursor)}>More resources</Button>}</section>}
        {selections.length > 0 && <ul aria-label="Selected resources" className="space-y-1">{selections.map(item => <li key={`${item.kind}:${item.id}`} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 break-words">{item.title}</span><Button type="button" size="sm" variant="ghost" disabled={aiLocked} aria-label={`Remove ${item.title}`} onClick={() => setSelections(items => items.filter(value => value !== item))}>Remove</Button></li>)}</ul>}
        <Button type="button" disabled={aiLocked || !validName || !prompt.trim()} onClick={generate}>{busy === "generate" ? "Generating block…" : "Generate block proposal"}</Button>
      </section>}
    </> : <>
      <p className="break-all text-xs text-muted-foreground">{name} · Version 1 · Unsaved proposal</p>
      <FieldDesigner source={source} onChange={setSource} onInvalidChange={setFieldInvalid} disabled={locked || !!request && !canAi} />
      <CompositionDesigner source={source} onChange={setSource} disabled={locked || !!request && !canAi} />
      <details><summary className="cursor-pointer text-sm font-medium">Advanced definition source</summary><label htmlFor={id + "-source"} className="block text-sm font-medium">Definition source</label><textarea id={id + "-source"} value={source} spellCheck={false} rows={16} maxLength={480 * 1024} disabled={locked || !!request && !canAi} onChange={event => setSource(event.target.value)} className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs" /></details>
      {invalid && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-destructive">{invalid}</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={locked || !!invalid || fieldInvalid || !!request && !canAi} onClick={save}>{busy === "save" ? "Saving draft…" : "Save reviewed draft"}</Button><Button type="button" variant="outline" disabled={locked} onClick={() => { setSource(null); setRequest(null); setError(""); setFieldInvalid(false); }}>Discard proposal</Button></div>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {busy === "resources" && <p role="status" className="text-sm">Loading resources…</p>}
    {!canAi && request && <p role="alert" className="text-sm text-destructive">AI access changed. Your proposal is retained, but cannot be saved with this session.</p>}
    <div className="border-t border-border pt-3"><Button type="button" variant="ghost" disabled={!!busy} onClick={onCancel}>{source === null ? "Cancel" : "Close review"}</Button></div>
  </section>;
}
