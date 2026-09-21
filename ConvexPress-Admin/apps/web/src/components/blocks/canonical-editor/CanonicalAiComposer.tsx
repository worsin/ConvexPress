import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { CanonicalDocumentDto } from "@backend/canonical-blocks-foundation/documentContracts";
import { CanonicalEditor } from "./CanonicalEditor";
import { canonicalEditorAdapter, checkedDraft, documentSnapshot, draftDigest, readForEditor, verifiedWriteSnapshot, type CanonicalDraft } from "./document-adapter";
import { checkedProposalPreview, proposalIssue, proposalRequest, type AiProposalClient, type AiProposalRequest, type AiResourceSelection } from "./ai-proposal";
import type { DocumentKey, SaveRequest } from "./session";

export function CanonicalAiComposer({ documentKey, source, client, disabled, pickResource, onEditingChange, onSaved, onPreview }: {
  documentKey: DocumentKey; source: CanonicalDocumentDto;
  client: AiProposalClient & { get(): Promise<unknown> }; disabled: boolean;
  pickResource: ComponentProps<typeof CanonicalEditor>["pickResource"];
  onEditingChange: (editing: boolean) => void;
  onSaved: () => Promise<unknown>;
  onPreview: (document: CanonicalDocumentDto, request: AiProposalRequest) => void;
}) {
  const [selections, setSelections] = useState<Array<{ kind: "product" | "media"; id: string; title: string }>>([]);
  const pickerAbort = useRef<AbortController | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [open, setOpen] = useState(false), [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<"generating" | "previewing" | "applying" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{ request: AiProposalRequest; document: CanonicalDocumentDto; base: CanonicalDocumentDto } | null>(null);
  const contextKey = `${source.document.revision}:${source.presentation.revision}`;
  const current = useRef({ active: true, epoch: 0, busy: false, disabled, contextKey, openedContext: contextKey });
  current.current.disabled = disabled;
  current.current.contextKey = contextKey;
  const inputId = useId();
  useEffect(() => {
    current.current.active = true;
    return () => { current.current.active = false; current.current.epoch++; pickerAbort.current?.abort(); onEditingChange(false); };
  }, []);
  const changeOpen = (next: boolean) => {
    if (next && current.current.disabled || phase === "applying") return;
    current.current.epoch++;
    if (next) current.current.openedContext = contextKey;
    setOpen(next); onEditingChange(next);
    if (!next) { pickerAbort.current?.abort(); setSelections([]); setProposal(null); setError(null); }
  };
  useEffect(() => {
    // A save subscription can precede its own receipt. Keep that review alive
    // until receipt verification; all other revision/template changes cancel it.
    if (open && phase !== "applying" && current.current.openedContext !== contextKey) changeOpen(false);
  }, [open, phase, contextKey]);
  const available = (epoch: number, accepting = false) => current.current.active && current.current.epoch === epoch
    && (accepting || current.current.contextKey === current.current.openedContext);
  const choose = async (kind: "product" | "media") => {
    if (!pickResource || current.current.busy || choosing) return;
    const epoch = current.current.epoch, controller = new AbortController();
    pickerAbort.current = controller; setChoosing(true); setError(null);
    try {
      const field = kind === "product"
        ? { id: "value", type: "reference" as const, of: "product" as const, storage: "id" as const, required: true, max: 256 }
        : { id: "mediaId", type: "media" as const, storage: "id" as const };
      const result = await pickResource({ blockId: "ai-request", name: kind === "product" ? "commerce/product-compare" : "core/image",
        path: kind === "product" ? ["products", 0] : ["mediaId"], scope: source.scope, revision: String(source.document.revision), field, signal: controller.signal });
      if (!available(epoch) || controller.signal.aborted || !result) return;
      if (result.scope.websiteKey !== source.scope.websiteKey || result.scope.instanceKey !== source.scope.instanceKey || typeof result.value !== "string" || !result.value || result.value.length > 256) throw Error("Resource selection changed");
      const id = result.value;
      setSelections(items => items.some(item => item.kind === kind && item.id === id) || items.filter(item => item.kind === kind).length >= (kind === "product" ? 6 : 12) ? items : [...items, { kind, id, title: result.label || (kind === "product" ? "Selected product" : "Selected media") }]);
    } catch (failure) { if (available(epoch)) setError(proposalIssue(failure)); }
    finally { if (pickerAbort.current === controller) pickerAbort.current = null; if (current.current.active) setChoosing(false); }
  };
  const generate = async () => {
    if (current.current.busy || current.current.disabled || choosing || !prompt.trim()) return;
    const epoch = ++current.current.epoch;
    current.current.busy = true; setPhase("generating"); setError(null);
    try {
      const resources: AiResourceSelection | undefined = selections.length ? { products: selections.filter(item => item.kind === "product").map(item => item.id), media: selections.filter(item => item.kind === "media").map(item => item.id) } : undefined;
      const request = proposalRequest(await client.generateAi({ expectedRevision: source.document.revision, prompt: prompt.trim(), ...(resources ? { resources } : {}) }), source.document.revision, resources);
      if (!available(epoch)) return;
      const document = checkedProposalPreview(await client.previewAi(request), documentKey, request);
      if (available(epoch)) setProposal({ request, document, base: source });
    } catch (failure) { if (available(epoch)) setError(proposalIssue(failure)); }
    finally { current.current.busy = false; if (current.current.active) setPhase(null); }
  };
  const preview = async (draft: CanonicalDraft) => {
    if (!proposal || current.current.busy) return;
    const epoch = current.current.epoch;
    current.current.busy = true; setPhase("previewing"); setError(null);
    try {
      const checked = checkedDraft(draft), request = { ...proposal.request, title: checked.title, blocks: checked.blocks };
      const document = checkedProposalPreview(await client.previewAi(request), documentKey, request);
      if (available(epoch)) onPreview(document, request);
    } catch (failure) { if (available(epoch)) setError(proposalIssue(failure)); }
    finally { current.current.busy = false; if (current.current.active) setPhase(null); }
  };
  const apply = async (request: SaveRequest<CanonicalDraft>) => {
    if (!proposal || current.current.busy || !current.current.active) throw Error("Proposal unavailable");
    const epoch = current.current.epoch;
    current.current.busy = true; setPhase("applying"); setError(null);
    try {
      const draft = checkedDraft(request.value);
      const result = verifiedWriteSnapshot(await client.applyAi({ ...proposal.request, title: draft.title, blocks: draft.blocks }), request);
      if (!available(epoch, true)) throw Error("Review environment changed");
      const reopened = readForEditor(await client.get(), documentKey);
      if (!reopened || reopened.contract !== "canonical-document-v1" || reopened.document.revision < result.revision || reopened.document.revision === result.revision && reopened.document.digest !== draftDigest(draft))
        throw Error("Accepted proposal could not be reopened");
      if (!available(epoch, true)) throw Error("Review environment changed");
      await onSaved();
      if (available(epoch, true)) { setOpen(false); setProposal(null); onEditingChange(false); }
      return result;
    } catch (failure) { if (available(epoch, true)) setError("Your proposal is still here. Reopen the saved document to check whether it was applied before trying again."); throw failure; }
    finally { current.current.busy = false; if (current.current.active) setPhase(null); }
  };
  return <>
    <Button type="button" variant="outline" disabled={disabled} onClick={() => changeOpen(true)}>Create with AI</Button>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className={proposal ? "max-w-[min(1200px,96vw)]" : "max-w-xl"}>
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{proposal ? "Make it yours" : "Start with an idea"}</DialogTitle>
          <DialogDescription>{proposal ? "Review and edit the proposed page. Apply it when you’re ready to replace the saved content." : "Describe the page you want to create. You’ll review the result before anything is saved."}</DialogDescription>
        </DialogHeader>
        {!proposal ? <div className="space-y-4">
          <label htmlFor={inputId} className="text-sm font-medium">What would you like to create?</label>
          <Textarea id={inputId} value={prompt} maxLength={8000} rows={5} disabled={!!phase} onChange={event => setPrompt(event.target.value)} placeholder="A welcoming homepage for a small architecture studio, with a clear introduction and an invitation to get in touch." />
          {<div className="space-y-3 rounded-lg border border-border p-3">
            <div><p className="text-sm font-medium">Use content from your website</p><p className="text-xs text-muted-foreground">Choose products or media to include. Product prices stay live.</p></div>
            <div className="flex flex-wrap gap-2">
              {source.policy.enabledPlugins.includes("commerce") && <Button type="button" variant="outline" size="sm" disabled={!!phase || choosing || selections.filter(item => item.kind === "product").length >= 6} onClick={() => void choose("product")}>Choose a product</Button>}
              <Button type="button" variant="outline" size="sm" disabled={!!phase || choosing || selections.filter(item => item.kind === "media").length >= 12} onClick={() => void choose("media")}>Choose media</Button>
            </div>
            {selections.length > 0 && <ul className="space-y-1">{selections.map(item => <li key={`${item.kind}:${item.id}`} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 break-words">{item.title}</span><Button type="button" variant="ghost" size="sm" disabled={!!phase || choosing} aria-label={`Remove ${item.title}`} onClick={() => setSelections(items => items.filter(value => value !== item))}>Remove</Button></li>)}</ul>}
          </div>}
          <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Uses your website’s available blocks and template.</p><Button type="button" disabled={!!phase || choosing || !prompt.trim()} onClick={() => void generate()}>{phase === "generating" ? "Creating proposal…" : "Generate proposal"}</Button></div>
        </div> : <CanonicalEditor key={proposal.request.expectedFingerprint} snapshot={documentSnapshot(proposal.base, documentKey)} authorityReady
          adapter={canonicalEditorAdapter(proposal.document.policy, proposal.document.presentation.packId, proposal.document.document.composedDefinitions)}
          proposal={{ initialDraft: documentSnapshot(proposal.document, documentKey).value, onPreview: draft => void preview(draft) }}
          contentLocked={phase === "previewing" || phase === "applying"} pickResource={pickResource} save={apply} />}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {phase === "previewing" && <p role="status" className="text-sm text-muted-foreground">Preparing the Website preview…</p>}
        <div className="flex justify-end border-t border-border pt-4"><Button type="button" variant="ghost" disabled={phase === "applying"} onClick={() => changeOpen(false)}>{proposal ? "Discard proposal" : "Cancel"}</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
