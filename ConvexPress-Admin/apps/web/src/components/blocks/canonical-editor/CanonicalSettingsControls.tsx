import { useEffect, useRef, useState } from "react";
import {
  canonicalDocumentSettingsSchema, canonicalWriteReceiptSchema,
  type CanonicalDocumentSettings, type CanonicalSettingsWrite,
} from "@backend/canonical-blocks-foundation/documentContracts";

export interface DocumentSettingsClient {
  getSettings(): Promise<unknown>;
  setSettings(args: CanonicalSettingsWrite): Promise<unknown>;
}
const layouts = [
  ["default", "Template default"], ["full-width", "Full width"], ["no-sidebar", "Reading width"],
  ["sidebar-left", "Sidebar on the left"], ["sidebar-right", "Sidebar on the right"],
  ["landing", "Landing page"], ["blank", "Blank canvas"],
] as const;
function failure(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = error.data;
    if (data && typeof data === "object" && "message" in data && typeof data.message === "string") return data.message;
  }
  return "Settings could not be saved. Reload the current document before retrying.";
}
export function CanonicalSettingsControls({postId,revision,disabled,client,onSaved,onEditingChange}: {
  postId:string; revision:number; disabled:boolean; client:DocumentSettingsClient; onSaved():Promise<unknown>; onEditingChange?(editing:boolean):void;
}) {
  const [saved,setSaved] = useState<CanonicalDocumentSettings | null>(null);
  const [draft,setDraft] = useState<CanonicalDocumentSettings | null>(null);
  const [busy,setBusy] = useState(false), [error,setError] = useState<string | null>(null);
  const [loading,setLoading] = useState(true);
  const [password,setPassword] = useState("");
  const active = useRef(true), pending = useRef(false), dirtyRef = useRef(false);
  const [incoming,setIncoming] = useState<CanonicalDocumentSettings | null>(null);
  const [reload,setReload] = useState(0);
  useEffect(() => {
    active.current = true;
    setLoading(true);
    let cancelled = false;
    void client.getSettings().then(value => {
      if (cancelled || !active.current) return;
      const settings = canonicalDocumentSettingsSchema.parse(value);
      if (settings.postId !== postId || settings.revision !== revision) throw new Error("Settings identity changed");
      if (dirtyRef.current) {
        setIncoming(settings);setError("This document changed while you were editing settings. Discard your settings changes to load the current version.");
      } else {setSaved(settings);setDraft(settings);setPassword("");setIncoming(null);setError(null);}
    }).catch(() => {if(!cancelled && active.current)setError("Document settings are unavailable. Reload to try again.");})
      .finally(() => {if(!cancelled && active.current)setLoading(false);});
    return () => {cancelled=true;active.current=false;};
  }, [client,postId,revision,reload]);
  const dirty = !!saved && !!draft && (password.length > 0 || ["slug","pageTemplate","hideHeader","hideFooter","visibility"].some(key => saved[key as keyof CanonicalDocumentSettings] !== draft[key as keyof CanonicalDocumentSettings]));
  dirtyRef.current = dirty;
  useEffect(() => { onEditingChange?.(dirty || busy); return () => onEditingChange?.(false); }, [dirty,busy,onEditingChange]);
  // A content save publishes its revision before the settings request settles.
  // Keep the previous values visible, but never let a new edit use that stale base.
  const locked = disabled || busy || loading || saved?.postId !== postId || saved?.revision !== revision;
  const invalidSlug = !!draft && draft.slug !== saved?.slug && (draft.slug.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug));
  const invalidPassword = draft?.visibility === "password" && (password.length > 128 || (!password && !saved?.hasPassword));
  return <section aria-label="Document settings" className="space-y-4 rounded-lg border border-border p-5">
    <div><h2 className="text-lg font-semibold">Document settings</h2><p className="text-sm text-muted-foreground">Choose the address, layout and who can read this document when published.</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!draft ? !error && <p role="status">Loading document settings…</p> : <>
      <label className="block space-y-1 text-sm"><span>URL slug</span><input aria-label="URL slug" value={draft.slug} disabled={locked} maxLength={200}
        onChange={event=>setDraft({...draft,slug:event.target.value})} className="block min-h-11 w-full rounded border bg-background px-3" /></label>
      <p className="break-all text-sm text-muted-foreground">Current address: {draft.type === "page" ? `/page${saved?.path}` : saved?.path}</p>
      {invalidSlug && <p role="alert" className="text-sm text-destructive">Use lowercase letters, numbers and hyphens.</p>}
      {draft.slug !== saved?.slug && <p className="text-sm">Changing the permalink changes the public URL. Existing links will need updating.</p>}
      {draft.type === "page" && <label className="block space-y-1 text-sm"><span>Page layout</span><select aria-label="Page layout" value={draft.pageTemplate} disabled={locked}
        onChange={event=>setDraft({...draft,pageTemplate:event.target.value as CanonicalDocumentSettings["pageTemplate"]})} className="block min-h-11 w-full rounded border bg-background px-3">
        {layouts.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
      <label className="block space-y-1 text-sm"><span>Visibility</span><select aria-label="Visibility" value={draft.visibility} disabled={locked}
        onChange={event=>{setDraft({...draft,visibility:event.target.value as CanonicalDocumentSettings["visibility"]});setPassword("");}} className="block min-h-11 w-full rounded border bg-background px-3">
        <option value="public">Public</option><option value="private">Private — editors only</option><option value="password">Password protected</option>
      </select></label>
      <p className="text-sm text-muted-foreground">Membership restrictions still apply. Changing visibility does not publish a draft.</p>
      {draft.visibility === "password" && <label className="block space-y-1 text-sm"><span>{saved?.hasPassword ? "New document password (optional)" : "Document password"}</span>
        <input aria-label="Document password" type="password" autoComplete="new-password" maxLength={128} value={password} disabled={locked}
          onChange={event=>setPassword(event.target.value)} className="block min-h-11 w-full rounded border bg-background px-3" />
        <span className="block text-muted-foreground">{saved?.hasPassword ? "A password is configured. Leave this empty to keep it." : "Enter a password before saving."}</span>
      </label>}
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={draft.hideHeader} disabled={locked} onChange={event=>setDraft({...draft,hideHeader:event.target.checked})} />Hide site header</label>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={draft.hideFooter} disabled={locked} onChange={event=>setDraft({...draft,hideFooter:event.target.checked})} />Hide site footer</label>
      {disabled && <p className="text-sm text-muted-foreground">Save or resolve your content changes before updating these settings.</p>}
      <div className="flex items-center gap-3"><button type="button" disabled={locked || !dirty || invalidSlug || invalidPassword || saved?.revision !== revision || !!incoming} className="min-h-11 rounded border px-4 text-sm disabled:opacity-50" onClick={()=>void(async()=>{
        if (pending.current || locked || !saved || !dirty || invalidSlug || invalidPassword || saved.revision !== revision || incoming) return;
        pending.current=true;setBusy(true);setError(null);
        try {
          const receipt=canonicalWriteReceiptSchema.parse(await client.setSettings({expectedRevision:revision,expectedSettingsDigest:saved.settingsDigest,slug:draft.slug,pageTemplate:draft.pageTemplate,hideHeader:draft.hideHeader,hideFooter:draft.hideFooter,visibility:draft.visibility,...(draft.visibility === "password" && password ? {password} : {})}));
          if (!active.current) return;
          if (receipt.postId!==postId || receipt.revision!==revision+(receipt.changed?1:0)) throw new Error("Settings receipt mismatch");
          dirtyRef.current=false;
          const accepted={...draft,revision:receipt.revision,hasPassword:draft.visibility === "password" && (Boolean(password) || saved.hasPassword)};setSaved(accepted);setDraft(accepted);setPassword("");setIncoming(null);
          await onSaved();
        } catch (error) {if(active.current)setError(failure(error));}
        finally {pending.current=false;if(active.current)setBusy(false);}
      })()}>{busy ? "Saving settings…" : "Save document settings"}</button>{dirty && <><button type="button" disabled={busy} className="min-h-11 rounded border px-4 text-sm" onClick={()=>{dirtyRef.current=false;setDraft(incoming ?? saved);setPassword("");if(incoming)setSaved(incoming);setIncoming(null);setError(null);setLoading(true);setReload(value=>value+1);}}>Discard settings changes</button><span className="text-sm text-muted-foreground">Unsaved settings</span></>}</div>
    </>}
  </section>;
}
