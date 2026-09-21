import { PromotionPanel } from "./PromotionPanel";
import { TemplateStylePrompt } from "./TemplateStylePrompt";
import { FieldDesigner } from "./FieldDesigner";
import { CompositionDesigner } from "./CompositionDesigner";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { checkedEdit, checkedSaved, nextDefinition, type DefinitionClient, type DefinitionHistory, type DefinitionId, type SavedDefinition } from "./model";

export function DefinitionWorkbench({ id, client, canAi = false, canPromote = false, canEdit, canRestore, canApprove, onLocked, renderPreview }: { id: DefinitionId; client: DefinitionClient; canAi?: boolean; canPromote?: boolean; canEdit: boolean; canRestore: boolean; canApprove: boolean; onLocked: (value: boolean) => void; renderPreview?: (input: { saved: SavedDefinition; source: string | null; disabled: boolean }) => ReactNode }) {
  const [saved, setSaved] = useState<SavedDefinition | null>(null), [history, setHistory] = useState<DefinitionHistory | null>(null);
  const [source, setSource] = useState<string | null>(null), [review, setReview] = useState<{ value: SavedDefinition; enabled: boolean } | null>(null);
  const [promotionLocked, setPromotionLocked] = useState(false);
  const [fieldInvalid, setFieldInvalid] = useState(false);
  const [startingTreatment, setStartingTreatment] = useState("default");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const alive = useRef(true), pending = useRef(false), readEpoch = useRef(0);
  const sourceId = useId();
  const mayGenerate = useRef(canAi && canEdit);
  mayGenerate.current = canAi && canEdit;
  const locked = source !== null || review !== null || busy || promotionLocked;
  useEffect(() => { onLocked(locked); }, [locked, onLocked]);
  useEffect(() => {
    alive.current = true;
    const epoch = ++readEpoch.current;
    let cancelled = false;
    Promise.all([client.get({ id }), client.history({ id })]).then(([value, versions]) => {
      if (cancelled || epoch !== readEpoch.current) return; checkedSaved(value); setSaved(value); setHistory(versions);
    }).catch(() => { if (!cancelled && epoch === readEpoch.current) setError("Could not open this definition. Your access or the saved content may have changed."); });
    return () => { cancelled = true; alive.current = false; readEpoch.current++; onLocked(false); };
  }, [id, client, onLocked]);
  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch { if (alive.current) { setReview(null); setError("The request could not be confirmed. Reload the saved version to check its state before another change. Unsaved source is retained."); } }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  async function refresh(version?: number) {
    const epoch = ++readEpoch.current;
    const [value, versions] = await Promise.all([client.get({ id, ...(version === undefined ? {} : { version }) }), client.history({ id })]);
    checkedSaved(value);
    if (alive.current && epoch === readEpoch.current) { setSaved(value); setHistory(versions); setReview(null); }
  }
  let validation = "";
  if (source !== null && saved) { try { checkedEdit(source, saved); } catch (issue) { validation = issue instanceof Error ? issue.message : "Invalid block definition"; } }
  const definition = saved ? checkedSaved(saved).definition : null;
  return <section className="min-w-0 space-y-5" aria-label="Custom block workspace">
    {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="rounded-md border border-border bg-muted p-3 text-sm">{message}</p>}
    {!saved || !definition ? <><p role="status">Opening the saved definition…</p><Button variant="outline" disabled={busy} onClick={() => void run(() => refresh())}>Reload saved definition</Button></> : <>
    <header className="space-y-2"><h2 className="text-xl font-semibold">{definition.spec.title}</h2><p className="text-sm text-muted-foreground">Version {saved.version} · {saved.versionStatus === "active" ? "Approved" : saved.versionStatus === "revoked" ? "Approval revoked" : "Draft"} · Latest version {saved.lastVersion}</p><p className="text-xs text-muted-foreground">{saved.name}</p></header>
    {source !== null ? <><form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!canEdit || busy || validation || fieldInvalid || error) return; const value = checkedEdit(source, saved); void run(async () => {
      const result = await client.save({ id, expectedGeneration: saved.generation, definitionJson: value.json });
      await refresh(result.version); if (alive.current) { setSource(null); setMessage(`Saved version ${result.version}. Approval is reviewed separately.`); }
    }); }}><FieldDesigner onInvalidChange={setFieldInvalid} source={source} onChange={setSource} disabled={busy || !canEdit} /><CompositionDesigner initialTreatment={startingTreatment} source={source} onChange={setSource} disabled={busy || !canEdit} /><details><summary className="cursor-pointer text-sm font-medium">Advanced definition source</summary><label htmlFor={sourceId} className="block text-sm font-medium">Definition source</label><textarea id={sourceId} spellCheck={false} value={source} disabled={busy || !canEdit} onChange={event => setSource(event.target.value)} maxLength={480 * 1024} rows={22} className="block w-full rounded-md border border-input bg-background p-3 font-mono text-xs leading-relaxed" /><p className="text-sm text-muted-foreground">Edit fields, primitive composition and template treatments. Saving creates a new version; existing pages keep their selected versions.</p></details>{validation && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-destructive">{validation}</p>}<div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || !canEdit || !!validation || fieldInvalid || !!error}>Save new version</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setSource(null);setError(""); }}>Discard source changes</Button></div></form>{renderPreview?.({ saved, source, disabled: busy || !canEdit || !!validation || fieldInvalid || !!error })}</> : <>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || promotionLocked || review !== null} onClick={() => void run(() => refresh())}>Reload latest version</Button>{canEdit && saved.status !== "promoted" && <Button variant="outline" disabled={busy || promotionLocked || review !== null || !!error} onClick={() => { setStartingTreatment("default"); setSource(nextDefinition(saved)); }}>Edit as new version</Button>}{canRestore && saved.version !== saved.lastVersion && saved.status !== "promoted" && <Button variant="outline" disabled={busy || promotionLocked || review !== null || !!error} onClick={() => void run(async () => { const result = await client.restore({ id, expectedGeneration: saved.generation, version: saved.version, expectedDigest: saved.digest });await refresh(result.version);if (alive.current) setMessage(`Restored as draft version ${result.version}.`); })}>Restore as new draft</Button>}{canApprove && (saved.status !== "promoted" || saved.versionStatus === "active") && <Button disabled={busy || promotionLocked || review !== null || !!error} onClick={() => setReview({ value: saved, enabled: saved.versionStatus !== "active" })}>{saved.versionStatus === "active" ? "Review revocation" : "Review approval"}</Button>}</div>
    {canAi && canEdit && saved.status !== "promoted" && <TemplateStylePrompt disabled={busy || promotionLocked || review !== null || !!error} busy={busy} onGenerate={(packId, prompt) => {
      if (!mayGenerate.current || pending.current || promotionLocked || review || error) return;
      const epoch = readEpoch.current;
      void run(async () => {
        const proposal = await client.styleForPack({ id, expectedGeneration: saved.generation, version: saved.version, expectedDigest: saved.digest, packId, prompt });
        if (!alive.current || epoch !== readEpoch.current || !mayGenerate.current) return;
        if (proposal.packId !== packId) throw Error("The proposal belongs to another template.");
        const proposed = checkedEdit(proposal.definitionJson, saved);
        if (proposed.digest !== proposal.digest) throw Error("The proposal content changed.");
        setStartingTreatment(packId);
        setSource(JSON.stringify(proposed.definition, null, 2));
        setMessage(`Generated a treatment for ${packId}. Review it in Composition, preview with that template active, then save a new draft when ready. Nothing has been saved or approved.`);
      });
    }} />}
    {review && <section aria-label="Definition approval review" className="space-y-3 rounded-lg border border-border bg-muted/40 p-4"><h3 className="font-semibold">{review.enabled ? "Approve" : "Revoke approval for"} version {review.value.version}</h3><p className="text-sm">{review.enabled ? "This exact saved version will be available to page editors and eligible for publication. Review its fields and composition below." : "Pages using this version will no longer be eligible for publication or public rendering. Saved content remains available for recovery."}</p><div className="flex flex-wrap gap-2"><Button disabled={busy || !canApprove} onClick={() => void run(async () => { const value = review.value; await client.review({ id, version: value.version, expectedGeneration: value.generation, expectedDigest: value.digest, enabled: review.enabled });await refresh(value.version);if (alive.current) setMessage(review.enabled ? `Version ${value.version} approved.` : `Approval revoked for version ${value.version}.`); })}>{review.enabled ? "Confirm approval" : "Confirm revocation"}</Button><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Cancel review</Button></div></section>}
    {renderPreview?.({ saved, source: null, disabled: busy || review !== null || !!error })}
    {canPromote && saved.status !== "promoted" && <PromotionPanel key={`${saved.id}:${saved.version}:${saved.generation}`} saved={saved} client={client.promotion} disabled={busy || review !== null || !!error} canConfirm={canApprove} onLocked={setPromotionLocked} onConfirmed={async () => { await refresh(saved.version);if (alive.current) setMessage("SDK promotion confirmed. Existing pages keep their pinned versions."); }} />}
    {saved.status === "promoted" && <p role="status" className="rounded-lg border border-border p-4 text-sm">This definition has been promoted to the SDK library. Existing pages retain their selected versions; their approvals can still be revoked.</p>}
    <section aria-label="Definition fields" className="space-y-3 rounded-lg border border-border p-4"><h3 className="font-semibold">Editable fields</h3><ul className="divide-y divide-border">{definition.spec.fields.map(field => <li key={field.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{field.title ?? field.id}</span><span className="text-muted-foreground">{field.type}</span></li>)}</ul><p className="text-sm text-muted-foreground">Template treatments: {Object.keys(definition.packTreatments ?? {}).join(", ") || "Uses the template’s default primitives"}</p><details><summary className="cursor-pointer text-sm font-medium">Inspect saved definition</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{JSON.stringify(definition, null, 2)}</pre></details></section>
    <section aria-label="Definition history" className="space-y-3 rounded-lg border border-border p-4"><h3 className="font-semibold">Version history</h3><ul className="space-y-2">{history?.versions.map(item => <li key={item.version} className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">Version {item.version} · {item.versionStatus === "active" ? "Approved" : item.versionStatus}</span><Button size="sm" variant="outline" disabled={busy || promotionLocked || review !== null} onClick={() => void run(() => refresh(item.version))}>View version {item.version}</Button></li>)}</ul>{history?.nextBeforeVersion != null && <Button variant="outline" disabled={busy || promotionLocked || review !== null} onClick={() => void run(async () => { const more = await client.history({ id, beforeVersion: history.nextBeforeVersion! });if (alive.current) setHistory({ ...more, versions: [...history.versions, ...more.versions] }); })}>Load older versions</Button>}</section>
    </>}
    </>}
  </section>;
}
