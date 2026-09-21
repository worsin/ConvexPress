/**
 * Appearance › Customize.
 *
 * The WordPress-Customizer idea done live: the active template's settings
 * modules on the left, the real storefront on the right. Every change is
 * pushed into the preview over `postMessage` and painted immediately (the
 * site merges the draft over its saved values); nothing persists until
 * Publish writes `appearance.template.settings[packId]` and `variants`.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { Check, ChevronDown, Loader2, Monitor, RotateCcw, Save, Smartphone, SlidersHorizontal, Tablet, Undo2, Redo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { modulesFor, type SettingsModule, type TemplateSettingsField } from "@/lib/templates/settingsModules";
import { getTemplatePack } from "@/lib/templates/packs";
import { useControlShell, useControlClient } from "@/control/ControlShellContext";
import { HeaderSettingsEditor } from "@/components/appearance/HeaderComposer";
import { FooterSettingsEditor } from "@/components/appearance/FooterComposer";
import { FooterRowsBuilder } from "@/components/appearance/FooterRowsBuilder";
import { createDraftHistory, applyDraftChange, setDraftField, readDraftField, resetDraftModule, resetDraftBrand, applyColorPreset, undoDraft, redoDraft, draftChanges, type DraftSnapshot, type Values } from "@/lib/templates/draftModel";
import { prepareTemplatePromotion, type TemplateSnapshot, type PromotionReview } from "@/lib/templates/templatePublishing";
import { cn, getErrorMessage } from "@/lib/utils";
import { getElectronBridge } from "@/lib/electron";
import { createWebsiteOperatorLink } from "@/lib/templates/websiteOperatorLink";
import { useWebsiteEditing } from "@/control/WebsiteEditingProvider";
import { useVerifiedSiteRuntime } from "@/control/SiteRuntimeProvider";

export const Route = createFileRoute("/_authenticated/_admin/appearance/customize")({
  component: CustomizePage,
});

const CUSTOMIZE_MESSAGE = "convexpress:customize";

const PREVIEW_PAGES = [
  { id: "home", label: "Home", path: "/" },
  { id: "shop", label: "Shop", path: "/products" },
  { id: "blog", label: "Blog", path: "/blog" },
  { id: "cart", label: "Cart", path: "/cart" },
  { id: "login", label: "Sign in", path: "/login" },
];

const DEVICES = [
  { id: "desktop", label: "Desktop", width: null, Icon: Monitor },
  { id: "tablet", label: "Tablet", width: 834, Icon: Tablet },
  { id: "phone", label: "Phone", width: 390, Icon: Smartphone },
] as const;

const FONT_SUGGESTIONS = ["Inter", "Fraunces", "Space Grotesk", "Playfair Display", "DM Sans", "Instrument Serif", "Lora", "Manrope", "Newsreader", "Source Serif 4", "IBM Plex Sans", "Work Sans"];

function CustomizePage() {
  const websiteEditing = useWebsiteEditing();
  const verifiedRuntime = useVerifiedSiteRuntime();
  const server = useQuery(api.settings.templateDrafts.snapshot, {}) as TemplateSnapshot | undefined;
  const general = useQuery(api.settings.queries.getBySection, { section: "general" }) as { siteUrl?: string } | undefined;
  const publishSettings = useMutation(api.settings.templateDrafts.publish);
  const saveStoredDraft = useMutation(api.settings.templateDrafts.saveDraft);
  const discardStoredDraft = useMutation(api.settings.templateDrafts.discardDraft);
  const createOperatorHandoff = useMutation(api.auth.operatorHandoffs.create);
  const [openingWebsite, setOpeningWebsite] = useState(false);
  const shell = useControlShell();
  const control = useControlClient();
  const [base, setBase] = useState<TemplateSnapshot | null>(null);
  const [history, setHistory] = useState(() => createDraftHistory({ values: {}, variants: {} }));
  const stored = base?.values ?? server?.values;
  const activeId = stored?.active ?? "core";
  const pack = getTemplatePack(activeId);
  const modules = useMemo<SettingsModule[]>(() => modulesFor(pack).map((module) => module.id !== "shop" ? module : {
    ...module,
    fields: module.fields.map((field) => field.id === "catalogVariant" ? { ...field, options: (pack?.variants?.["shop.catalog"] ?? []).map((value) => ({ value, label: value })) } : field.id === "productVariant" ? { ...field, options: (pack?.variants?.["shop.product"] ?? []).map((value) => ({ value, label: value })) } : field),
  }), [pack]);
  const values = history.present.values;
  const variants = history.present.variants;
  const savedDraft = useQuery(api.settings.templateDrafts.getDraft, { packId: activeId }) as { values: Values; variants: Record<string, string>; sourceRevision: string; revision: string } | null | undefined;
  const [savedRevision, setSavedRevision] = useState<string | null | undefined>();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [page, setPage] = useState(PREVIEW_PAGES[0]);
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("desktop");
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);
  const [promotion, setPromotion] = useState<PromotionReview | null>(null);
  const [confirmPromotion, setConfirmPromotion] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const scope = server?.identity?.instanceKey ?? "single-site";
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const seed = useCallback((snapshot: TemplateSnapshot) => {
    setBase(snapshot);
    setHistory(createDraftHistory({ values: snapshot.values.settings[snapshot.values.active] ?? {}, variants: snapshot.values.variants }));
    setReviewing(false); setConfirmLive(false); setSavedRevision(undefined); setSaving(false);
  }, []);
  useEffect(() => {
    if (server && (!base || (base.identity?.instanceKey ?? "single-site") !== scope)) {
      seed(server); setOpenGroup(modules[0]?.id ?? null);
    }
  }, [server, base, scope, seed, modules]);
  useEffect(() => () => promotion?.dispose(), [promotion]);
  useEffect(() => { setPromotion(null); setConfirmPromotion(false); }, [scope]);
  const baseline: DraftSnapshot = { values: stored?.settings[activeId] ?? {}, variants: stored?.variants ?? {} };
  const changes = draftChanges(baseline, history.present);
  const dirty = changes.length > 0;
  const conflict = !!base && !!server && base.revision !== server.revision;
  const isLive = !server?.identity || server.identity.environmentKind === "live";
  const change = (next: DraftSnapshot) => { setHistory((current) => applyDraftChange(current, next)); setReviewing(false); };
  const setField = (moduleId: string, fieldId: string, value: unknown) => change(setDraftField(history.present, moduleId, fieldId, value));
  const resetModule = (moduleId: string) => change(resetDraftModule(history.present, moduleId));
  const setModule = (moduleId: string, value: Record<string, unknown>) => change({ ...history.present, values: { ...values, [moduleId]: value } });
  const live = shell?.websiteEnvironments.find((environment) => environment.kind === "live");

  const siteUrl = general?.siteUrl?.replace(/\/$/, "") ?? "";
  const previewUrl = siteUrl ? `${siteUrl}${page.path}${page.path.includes("?") ? "&" : "?"}customize=preview&template=${activeId}` : null;

  const openWebsiteEditor = async () => {
    if (!siteUrl || !server?.identity || openingWebsite) return;
    const requestScope = scope;
    const bridge = getElectronBridge();
    if (!bridge?.siteRunner?.openUrl) { toast.error("Open website editing from the ConvexPress desktop app."); return; }
    setOpeningWebsite(true);
    try {
      if (websiteEditing && verifiedRuntime && bridge.websiteEditing) {
        const launch = await websiteEditing.start(verifiedRuntime.target, siteUrl);
        if (scopeRef.current !== requestScope) { await launch.stop(); return; }
        try { await bridge.siteRunner.openUrl(launch.url); }
        catch (error) { await launch.stop(); throw error; }
        return;
      }
      const url = await createWebsiteOperatorLink(createOperatorHandoff, { siteUrl, instanceKey: server.identity.instanceKey });
      if (scopeRef.current !== requestScope) return;
      await bridge.siteRunner.openUrl(url);
    } catch { if (scopeRef.current === requestScope) toast.error("Could not open website editing. Check the site's public URL and your access, then try again."); }
    finally { setOpeningWebsite(false); }
  };

  // Push the draft whenever it changes, and whenever the preview says it is ready.
  const post = useCallback(() => {
    if (!previewUrl) return;
    const origin = new URL(previewUrl).origin;
    frameRef.current?.contentWindow?.postMessage({ type: CUSTOMIZE_MESSAGE, packId: activeId, values, variants }, origin);
  }, [activeId, values, variants, previewUrl]);

  useEffect(() => {
    post();
  }, [post]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source === frameRef.current?.contentWindow && previewUrl && event.origin === new URL(previewUrl).origin && event.data && typeof event.data === "object" && (event.data as { type?: string }).type === `${CUSTOMIZE_MESSAGE}:ready`) post();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post, previewUrl]);

  const saveDraft = async () => {
    if (!base) return;
    setSaving(true); const requestScope = scope;
    try {
      const result = await saveStoredDraft({ packId: activeId, sourceRevision: base.revision, expectedDraftRevision: savedRevision === undefined ? savedDraft?.revision ?? null : savedRevision, values, variants });
      if (scopeRef.current !== requestScope) return;
      setSavedRevision(result.revision); toast.success("Draft saved. Published settings are unchanged.");
    } catch (error) { if (scopeRef.current === requestScope) toast.error(getErrorMessage(error, "Could not save the draft.")); }
    finally { if (scopeRef.current === requestScope) setSaving(false); }
  };
  const publish = async () => {
    if (!base || conflict) return;
    setSaving(true); const requestScope = scope;
    try {
      const next = await publishSettings({ values: { ...base.values, variants, settings: { ...base.values.settings, [activeId]: values } }, expectedRevision: base.revision, confirmLive });
      if (scopeRef.current !== requestScope) return;
      seed(next); toast.success("Template settings published.");
      const revision = savedRevision === undefined ? savedDraft?.revision : savedRevision;
      if (revision) {
        try { await discardStoredDraft({ packId: activeId, expectedDraftRevision: revision }); if (scopeRef.current === requestScope) setSavedRevision(null); }
        catch { if (scopeRef.current === requestScope) toast.info("Published successfully. A newer saved draft was retained."); }
      }
    } catch (error) { if (scopeRef.current === requestScope) toast.error(getErrorMessage(error, "Could not publish.")); }
    finally { if (scopeRef.current === requestScope) setSaving(false); }
  };
  const reviewPromotion = async () => {
    if (!server || !live || !control || dirty || conflict) return;
    setSaving(true); const requestScope = scope;
    try {
      const review = await prepareTemplatePromotion(server, live, control);
      if (scopeRef.current !== requestScope) { review.dispose(); return; }
      setPromotion(review); setConfirmPromotion(false);
    } catch (error) { if (scopeRef.current === requestScope) toast.error(getErrorMessage(error, "Could not prepare promotion.")); }
    finally { if (scopeRef.current === requestScope) setSaving(false); }
  };
  const promote = async () => {
    if (!promotion || !confirmPromotion) return;
    setSaving(true); const requestScope = scope;
    try { await promotion.publish(); if (scopeRef.current === requestScope) toast.success("Staging template settings promoted to live."); }
    catch (error) { if (scopeRef.current === requestScope) toast.error(getErrorMessage(error, "Promotion failed. Prepare a fresh live review before retrying.")); }
    finally { promotion.dispose(); if (scopeRef.current === requestScope) { setPromotion(null); setSaving(false); } }
  };

  if (!stored) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading…
      </div>
    );
  }

  const deviceWidth = DEVICES.find((d) => d.id === device)?.width ?? null;

  return (
    <div className="space-y-[18px]">
      <PageHeader
        eyebrow="Appearance"
        title="Customize"
        meta={[
          <span key="pack">
            Template: <strong className="text-foreground">{pack?.name ?? activeId}</strong> ·{" "}
            <Link to="/appearance/templates" className="text-primary hover:underline">
              change
            </Link>
          </span>,
          dirty ? "Unpublished changes" : "Everything published",
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={openingWebsite || !siteUrl || !server?.identity} onClick={() => void openWebsiteEditor()}>{openingWebsite ? "Opening website…" : "Customize on website"}</Button>
            <Button variant="outline" aria-label="Undo draft change" disabled={!history.past.length || saving} onClick={() => { setHistory(undoDraft); setReviewing(false); }}><Undo2 className="size-4" /></Button>
            <Button variant="outline" aria-label="Redo draft change" disabled={!history.future.length || saving} onClick={() => { setHistory(redoDraft); setReviewing(false); }}><Redo2 className="size-4" /></Button>
            <Button variant="outline" onClick={() => change(resetDraftBrand(history.present, modules))} disabled={saving}>Use brand values</Button>
            <Button variant="outline" onClick={() => void saveDraft()} disabled={saving || !dirty}>Save draft</Button>
            {server?.identity?.environmentKind === "staging" && live && control && <Button variant="outline" onClick={() => void reviewPromotion()} disabled={saving || dirty || conflict}>Promote to live</Button>}
            <Button onClick={() => { setReviewing(true); setConfirmLive(false); }} disabled={saving || !dirty || conflict}>
              {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />} Review changes
            </Button>
          </div>
        }
      />

      {conflict && <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">Published settings changed while this draft was open. Your edits are preserved. <Button variant="outline" size="sm" disabled={saving} onClick={() => server && seed(server)}>Reload published version</Button></div>}
      {savedDraft && savedRevision !== null && <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">A saved draft is available for this template.
        <Button variant="outline" size="sm" disabled={saving} onClick={() => { if (!base) return; setHistory(createDraftHistory({ values: savedDraft.values, variants: savedDraft.variants })); setBase({ ...base, revision: savedDraft.sourceRevision }); setSavedRevision(savedDraft.revision); }}>Load saved draft</Button>
      </div>}
      {reviewing && <section className="space-y-3 rounded-lg border p-4" aria-label="Review template changes">
        <p className="text-sm font-medium">{changes.length} changed settings · {isLive ? "Live site" : server?.identity?.environmentKind}</p>
        <ul className="list-inside list-disc text-sm text-muted-foreground">{changes.map((field) => <li key={field}>{field}</li>)}</ul>
        {isLive && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmLive} onChange={(event) => setConfirmLive(event.target.checked)} /> Publish these changes to the live site.</label>}
        <Button onClick={() => void publish()} disabled={saving || conflict || (isLive && !confirmLive)}>Publish settings</Button>
      </section>}
      {promotion && <section className="space-y-3 rounded-lg border p-4" aria-label="Review staging promotion">
        <p className="font-medium">Promote to {promotion.targetLabel}</p>
        <p className="text-sm">Replace the live template “{promotion.target.values.active}” settings with the reviewed staging template “{promotion.source.values.active}” settings.</p>
        <details className="text-sm"><summary>Review settings to copy</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(promotion.source.values, null, 2)}</pre></details>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmPromotion} onChange={(event) => setConfirmPromotion(event.target.checked)} /> Apply this staging snapshot to the live environment.</label>
        <div className="flex gap-2"><Button onClick={() => void promote()} disabled={!confirmPromotion || saving}>Promote settings</Button><Button variant="outline" onClick={() => setPromotion(null)} disabled={saving}>Cancel</Button></div>
      </section>}

      <div className="grid gap-[18px] xl:grid-cols-[360px_minmax(0,1fr)]">
        {/* Groups */}
        <aside className="space-y-2 self-start rounded-xl border border-border bg-card p-2" aria-label="Template settings">
          <fieldset disabled={saving} className="space-y-2">
          {modules.length === 0 && (
            <p className="p-3 text-[12.5px] text-muted-foreground">This template exposes no settings.</p>
          )}
          {modules.map((module) => {
            const open = openGroup === module.id;
            const touched = Object.keys(values[module.id] ?? {}).length > 0;
            return (
              <section key={module.id} className="rounded-lg border border-border bg-surface-2/60">
                <button
                  type="button"
                  onClick={() => setOpenGroup(open ? null : module.id)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[13.5px] font-medium text-foreground"
                >
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    {module.title}
                    {touched && <span className="size-1.5 rounded-full bg-primary" aria-label="customised" />}
                  </span>
                  <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
                </button>
                {open && (
                  <div className="grid gap-3 border-t border-border px-3 py-3">
                    {module.presets?.length ? <div className="flex flex-wrap gap-2">{module.presets.map((preset) => <Button key={preset.id} size="sm" variant="outline" onClick={() => change(applyColorPreset(history.present, preset.colors))}>{preset.name}</Button>)}</div> : null}
                    {module.id === "header" ? <HeaderSettingsEditor value={values.header ?? {}} onChange={(next) => setModule("header", next)} /> : module.id === "footer" ? <><FooterSettingsEditor value={values.footer ?? {}} onChange={(next) => setModule("footer", next)} /><FooterRowsBuilder value={values.footer ?? {}} onChange={(next) => setModule("footer", next)} /></> : module.fields.map((field) => (
                      <FieldControl key={field.id} field={field} value={readDraftField(values[module.id], field.id)} onChange={(value) => setField(module.id, field.id, value)} />
                    ))}
                    {touched && (
                      <button type="button" onClick={() => resetModule(module.id)} className="inline-flex items-center gap-1 self-start text-[12px] font-medium text-primary hover:underline">
                        <RotateCcw className="size-3" aria-hidden="true" /> Reset to template defaults
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
          <p className="px-3 pb-1 pt-2 text-[11.5px] text-muted-foreground">
            Header and footer changes are saved with this template. Site title, logo and menu content remain shared across templates.
          </p>
          </fieldset>
        </aside>

        {/* Preview */}
        <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-xl border border-border bg-surface-2/60" aria-label="Live preview">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
            <div role="tablist" aria-label="Preview page" className="flex flex-wrap gap-1">
              {PREVIEW_PAGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={page.id === item.id}
                  onClick={() => setPage(item)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors",
                    page.id === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="Device" className="flex gap-1">
              {DEVICES.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={device === id}
                  aria-label={label}
                  onClick={() => setDevice(id)}
                  className={cn("flex size-8 items-center justify-center rounded-md transition-colors", device === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground")}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
          {previewUrl ? (
            <div className="flex flex-1 justify-center overflow-auto bg-surface-2/40 p-3">
              <iframe
                ref={frameRef}
                key={previewUrl}
                title="Site preview"
                src={previewUrl}
                onLoad={post}
                style={{ width: deviceWidth ? `${deviceWidth}px` : "100%" }}
                className="h-[calc(70vh-3rem)] min-h-[560px] rounded-lg border border-border bg-background shadow-sm"
              />
            </div>
          ) : (
            <p className="p-6 text-[12.5px] text-muted-foreground">Set the site address in Settings › General to preview the site here.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function FieldControl({ field, value, onChange }: { field: TemplateSettingsField; value: unknown; onChange: (value: unknown) => void }) {
  const id = `customize-${field.id}`;
  const label = (
    <Label htmlFor={id} className="flex items-center justify-between gap-2">
      <span>{field.label}</span>
      {field.brandBound && value == null && <span className="text-[11px] font-normal text-muted-foreground">from site / brand</span>}
    </Label>
  );

  switch (field.type) {
    case "color": {
      const current = typeof value === "string" ? value : "";
      return (
        <div className="grid gap-1.5">
          {label}
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`${field.label} colour`}
              value={/^#[0-9a-fA-F]{6}$/.test(current) ? current : "#888888"}
              onChange={(event) => onChange(event.target.value)}
              className="size-9 cursor-pointer rounded-md border border-input bg-card p-0.5"
            />
            <Input id={id} value={current} placeholder="#rrggbb" onChange={(event) => onChange(event.target.value || null)} className="font-mono" />
            {current && (
              <Button variant="ghost" size="sm" onClick={() => onChange(null)} aria-label={`Reset ${field.label}`}>
                <RotateCcw />
              </Button>
            )}
          </div>
        </div>
      );
    }
    case "font":
      return (
        <div className="grid gap-1.5">
          {label}
          <Input id={id} list="customize-fonts" value={typeof value === "string" ? value : ""} placeholder="Google Fonts family name" onChange={(event) => onChange(event.target.value || null)} />
          <datalist id="customize-fonts">
            {FONT_SUGGESTIONS.map((font) => (
              <option key={font} value={font} />
            ))}
          </datalist>
        </div>
      );
    case "select":
      return (
        <div className="grid gap-1.5">
          {label}
          <select
            id={id}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value || null)}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">{field.default == null ? "Template default" : `Default (${String(field.default)})`}</option>
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      );
    case "toggle": {
      const checked = typeof value === "boolean" ? value : Boolean(field.default);
      return (
        <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
          <span className="text-[13px] font-medium text-foreground">{field.label}</span>
          <span className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", checked ? "bg-primary" : "bg-border")}>
            <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
            <span className={cn("absolute size-4 rounded-full bg-background shadow transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} aria-hidden="true" />
            {checked && <Check className="absolute left-1 size-3 text-primary-foreground" aria-hidden="true" />}
          </span>
        </label>
      );
    }
    case "number":
    case "range":
      return (
        <div className="grid gap-1.5">
          {label}
          <Input id={id} type="number" min={field.min} max={field.max} value={typeof value === "number" ? value : ""} placeholder={String(field.default ?? "")} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} />
        </div>
      );
    default:
      return (
        <div className="grid gap-1.5">
          {label}
          <Input id={id} value={typeof value === "string" ? value : ""} placeholder={typeof field.default === "string" ? field.default : ""} onChange={(event) => onChange(event.target.value || null)} />
        </div>
      );
  }
}
