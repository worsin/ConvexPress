import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useOperatorDraftRecovery } from "@/lib/auth/OperatorDraftContext";
import { useWebsiteOperator } from "@/lib/auth/WebsiteOperatorContext";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTemplate } from "./useTemplate";
import {
  useTemplateCustomizer,
  useTemplateSettings,
  CUSTOMIZE_MESSAGE,
} from "./useTemplateSettings";
import {
  FooterRowsSettings,
  FooterMenuColumnsSettings,
} from "./FooterRowsSettings";
import { EMPTY_PREVIEW } from "./customizeContext";
import { fieldIsRelevant, isDraftValues } from "./customizeModel";
import {
  readDraftField,
  applyColorPreset,
  resetDraftBrand,
  applyDraftChange,
  createDraftHistory,
  draftChanges,
  redoDraft,
  resetDraftModule,
  setDraftField,
  undoDraft,
  type DraftSnapshot,
} from "./draftModel";
import { listTemplatePacks } from "./registry";
import type { TemplateSettingsField } from "./types";
import { activateTemplate } from "./templateActivation";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

const controlClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground";

export default function CustomizerPanel({ recoveryOwner }: { recoveryOwner: string }) {
  const recovery = useOperatorDraftRecovery();
  const operator = useWebsiteOperator();
  const [recovered] = useState(() => recovery?.read(recoveryOwner) ?? null);
  const controller = useTemplateCustomizer();
  const template = useTemplate();
  const { modules, values } = useTemplateSettings();
  const snapshot = useQuery(api.settings.templateDrafts.snapshot, {});
  const publish = useMutation(api.settings.templateDrafts.publish);
  const [packId, setPackId] = useState(recovered?.packId ?? template.config.active);
  const storedDraft = useQuery(api.settings.templateDrafts.getDraft, {
    packId,
  });
  const saveDraft = useMutation(api.settings.templateDrafts.saveDraft);
  const discardDraft = useMutation(api.settings.templateDrafts.discardDraft);
  const [draftRevision, setDraftRevision] = useState<string | null | undefined>(
    recovered?.draftRevision,
  );
  const [notice, setNotice] = useState<string | null>(recovered ? "Recovered your unsaved changes and history from this tab. Review them before publishing." : null);
  useEffect(() => {
    if (draftRevision === undefined && storedDraft !== undefined)
      setDraftRevision(storedDraft?.revision ?? null);
  }, [draftRevision, storedDraft]);
  const [base, setBase] = useState<DraftSnapshot | null>(recovered?.base ?? null);
  const [revision, setRevision] = useState<string | null>(recovered?.revision ?? null);
  const [history, setHistory] = useState(() =>
    recovered?.history ?? createDraftHistory({ values: {}, variants: {} }),
  );
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState("desktop");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState(false);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const frame = useRef<HTMLIFrameElement>(null);
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    trigger.current = document.activeElement as HTMLElement;
    panel.current?.focus();
    return () => trigger.current?.focus();
  }, []);
  useEffect(() => {
    if (!snapshot || base) return;
    const initial = {
      values: snapshot.values.settings?.[packId] ?? {},
      variants: snapshot.values.variants ?? {},
    };
    setBase(initial);
    setHistory(createDraftHistory(initial));
    setRevision(snapshot.revision);
  }, [snapshot, base, packId]);
  useEffect(() => {
    if (base) controller.setDraft({ packId, ...history.present });
  }, [base, packId, history.present, controller.setDraft]);
  const sendFrame = () =>
    frame.current?.contentWindow?.postMessage(
      { type: CUSTOMIZE_MESSAGE, packId, ...history.present },
      window.location.origin,
    );
  useEffect(() => {
    sendFrame();
  }, [history.present, packId, device]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (
        event.source === frame.current?.contentWindow &&
        event.origin === window.location.origin &&
        event.data?.type === `${CUSTOMIZE_MESSAGE}:ready`
      )
        sendFrame();
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [history.present, packId]);
  useEffect(() => {
    if (!picking) {
      setHovered(null);
      return;
    }
    const pick = (event: MouseEvent) => {
      const element =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-customize]")
          : null;
      if (!element || panel.current?.contains(element)) return;
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
      setSelected(element.dataset.customize ?? null);
      setPicking(false);
    };
    const hover = (event: MouseEvent) => {
      const element =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-customize]")
          : null;
      setHovered(
        element && !panel.current?.contains(element)
          ? (element.dataset.customize ?? null)
          : null,
      );
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPicking(false);
      window.requestAnimationFrame(() => panel.current?.focus());
    };
    document.addEventListener("keydown", cancel);
    document.addEventListener("click", pick, true);
    document.addEventListener("mouseover", hover);
    return () => {
      document.removeEventListener("keydown", cancel);
      document.removeEventListener("click", pick, true);
      document.removeEventListener("mouseover", hover);
    };
  }, [picking]);
  useEffect(() => {
    if (!selected) return;
    const target = panel.current?.querySelector<HTMLElement>(
      `[data-customize-field="${CSS.escape(selected)}"]`,
    );
    if (target) {
      const details = target.closest("details");
      if (details) details.open = true;
      target.scrollIntoView({ block: "nearest" });
      target.focus();
    }
  }, [selected]);
  const changes = useMemo(
    () => [...(base ? draftChanges(base, history.present) : []), ...(snapshot && packId !== snapshot.values.active ? ["template.active"] : [])],
    [base, history.present, packId, snapshot],
  );
  const conflict = revision !== null && snapshot?.revision !== revision;
  useLayoutEffect(() => {
    if (!base || !revision || !snapshot) return;
    recovery?.write(recoveryOwner, changes.length ? { packId, base, revision, history, draftRevision } : null);
  }, [recovery, recoveryOwner, base, revision, history, packId, draftRevision, changes, snapshot]);
  const close = () => {
    recovery?.write(recoveryOwner, null);
    controller.setDraft(EMPTY_PREVIEW);
    controller.setOpen(false);
  };
  const change = (next: DraftSnapshot) => {
    setReview(false);
    setHistory((old) => applyDraftChange(old, next));
  };
  const switchPack = (next: string) => {
    if (!snapshot) return;
    const activated = activateTemplate(snapshot.values, next);
    setPackId(next);
    setDraftRevision(undefined);
    const initial = {
      values: activated.settings?.[next] ?? {},
      variants: activated.variants ?? {},
    };
    setBase(initial);
    setHistory(createDraftHistory(initial));
    setReview(false);
  };
  const savePrivateDraft = async () => {
    if (!revision || draftRevision === undefined) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveDraft({
        packId,
        sourceRevision: revision,
        expectedDraftRevision: draftRevision,
        ...history.present,
      });
      if (!mounted.current) return;
      setDraftRevision(result.revision);
      setNotice("Draft saved for your account.");
    } catch (cause) {
      if (!mounted.current) return;
      setError(
        getErrorMessage(cause, "Could not save this draft."),
      );
    } finally {
      if (mounted.current) setSaving(false);
    }
  };
  const restoreDraft = () => {
    if (!storedDraft) return;
    if (!isDraftValues(storedDraft.values)) {
      setError("The saved draft contains invalid module settings. Reload the published settings or save a new draft.");
      return;
    }
    setHistory(
      createDraftHistory({
        values: storedDraft.values,
        variants: storedDraft.variants,
      }),
    );
    setDraftRevision(storedDraft.revision);
    setRevision(storedDraft.sourceRevision);
    setReview(false);
  };
  const doPublish = async () => {
    if (!snapshot || !revision || conflict) return;
    if (!review) {
      setReview(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const activated = activateTemplate(snapshot.values, packId);
      const next = {
        ...activated,
        active: packId,
        variants: history.present.variants,
        settings: {
          ...activated.settings,
          [packId]: history.present.values,
        },
      };
      await publish({
        values: next,
        expectedRevision: revision,
        confirmLive: true,
      });
      if (!mounted.current) return;
      if (draftRevision) {
        try { await discardDraft({ packId, expectedDraftRevision: draftRevision }); }
        catch { if (mounted.current) toast.info("Published successfully. A newer saved draft was retained."); }
      }
      if (!mounted.current) return;
      toast.success("Template settings published.");
      close();
    } catch (cause) {
      if (!mounted.current) return;
      setError(
        getErrorMessage(cause, "Publishing failed. Your draft is still open."),
      );
    } finally {
      if (mounted.current) setSaving(false);
    }
  };
  const previewUrl =
    typeof window === "undefined"
      ? ""
      : (() => {
          const url = new URL(window.location.href);
          url.searchParams.set("customize", "preview");
          return url.href;
        })();
  if (!base) return (
    <aside ref={panel} tabIndex={-1} role="region" aria-label="Customize template" aria-busy="true"
      onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) close(); }}
      className="fixed inset-y-0 right-0 z-[100] flex w-full max-w-sm flex-col gap-4 border-l border-border bg-background p-4 text-foreground shadow-xl">
      <h2 className="text-lg font-semibold">Customize</h2>
      <p role="status">Loading published settings…</p>
      <button type="button" onClick={close} className="self-start rounded px-2 py-1 text-sm">Close and discard</button>
    </aside>
  );
  return (
    <>
      {hovered && (
        <div className="pointer-events-none fixed bottom-4 left-4 z-[110] rounded bg-foreground px-3 py-2 text-xs text-background">
          Click to edit{" "}
          {modules
            .flatMap((module) =>
              module.fields.map((field) => ({
                key: `${module.id}.${field.id}`,
                label: field.label,
              })),
            )
            .find((field) => field.key === hovered)?.label ?? hovered}
        </div>
      )}
      {picking && (
        <>
          <style>{`[data-customize]:hover { outline: 2px solid var(--primary); outline-offset: 3px; cursor: crosshair; }`}</style>
          <button
            type="button"
            autoFocus
            className="fixed bottom-4 right-4 z-[110] rounded bg-background px-4 py-2 text-sm text-foreground shadow-xl ring-1 ring-border"
            onClick={() => {
              setPicking(false);
              window.requestAnimationFrame(() => panel.current?.focus());
            }}
          >
            Cancel selecting
          </button>
        </>
      )}
      <aside
        ref={panel}
        style={{ visibility: picking ? "hidden" : undefined }}
        tabIndex={-1}
        role="region"
        aria-label="Customize template"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) close();
        }}
        className="fixed inset-y-0 right-0 z-[100] flex w-full max-w-sm flex-col border-l border-border bg-background text-foreground shadow-xl"
      >
        <header className="space-y-3 border-b border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Customize</h2>
            <button
              type="button"
              onClick={close}
              className="rounded px-2 py-1 text-sm"
            >
              Close and discard
            </button>
          </div>
          {operator.active && operator.expiresAt && <p className="text-xs text-muted-foreground">{operator.canReconnect ? "Keep ConvexPress open and signed in. Editing access renews automatically; if the connection stops, your draft stays in this tab." : `Editing access ends at ${new Date(operator.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Keep this tab open to recover unsaved changes with a fresh editing link.`}</p>}
          {operator.canReconnect && operator.error && <div role="alert" className="text-xs"><p>{operator.error}</p><button type="button" className="mt-2 underline" disabled={operator.pending} onClick={operator.reconnect}>{operator.pending ? "Reconnecting…" : "Reconnect editing"}</button></div>}
          <label className="block text-xs">
            Template
            <select
              className={controlClass}
              value={packId}
              onChange={(event) => switchPack(event.target.value)}
            >
              {listTemplatePacks().map((pack) => (
                <option key={pack.manifest.id} value={pack.manifest.id}>
                  {pack.manifest.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            aria-pressed={picking}
            className="text-xs underline"
            onClick={() => {
              setSelected(null);
              setPicking(!picking);
            }}
          >
            {picking ? "Cancel selecting" : "Select a setting on the page"}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => change(resetDraftBrand(history.present, modules))}
            >
              Use brand
            </button>
            <button
              type="button"
              disabled={!history.past.length}
              onClick={() => setHistory(undoDraft)}
            >
              Undo
            </button>
            <button
              type="button"
              disabled={!history.future.length}
              onClick={() => setHistory(redoDraft)}
            >
              Redo
            </button>
            <select
              aria-label="Preview device"
              value={device}
              onChange={(event) => setDevice(event.target.value)}
            >
              <option value="desktop">Desktop</option>
              <option value="tablet">Tablet</option>
              <option value="phone">Phone</option>
            </select>
          </div>
          <div className="flex gap-3 text-xs">
            <button
              type="button"
              disabled={saving || !base}
              onClick={savePrivateDraft}
            >
              Save private draft
            </button>
            <button
              type="button"
              disabled={!storedDraft}
              onClick={restoreDraft}
            >
              Load saved draft
            </button>
          </div>
          <input
            className={controlClass}
            aria-label="Find a setting"
            placeholder="Find a setting"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!snapshot && <p role="status">Loading template settings…</p>}
          {conflict && (
            <div
              role="alert"
              className="mb-4 rounded border border-destructive p-3 text-sm"
            >
              Someone published while this draft was open. Close and reopen
              Customize to load their changes before publishing.
            </div>
          )}
          {modules.map((module) => {
            const fields = module.fields.filter((field) =>
              `${module.title} ${field.label}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            );
            const relevant = fields.some((field) =>
              fieldIsRelevant(
                module.id,
                field,
                controller.surfaceIds,
                controller.readFields,
              ),
            );
            if (!fields.length) return null;
            return (
              <details
                key={module.id}
                open={relevant || undefined}
                className="mb-3 rounded-md border border-border p-3"
              >
                <summary className="cursor-pointer font-medium">
                  {module.title}
                  {!relevant && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      Other pages
                    </span>
                  )}
                </summary>
                <div className="mt-3 space-y-3">
                  {module.presets?.map((preset) => (
                    <button
                      type="button"
                      key={preset.id}
                      className="mr-2 rounded border border-border px-2 py-1 text-xs"
                      onClick={() =>
                        change(applyColorPreset(history.present, preset.colors))
                      }
                    >
                      {preset.name}
                    </button>
                  ))}
                  {fields.map((field) => (
                    <SettingField
                      key={field.id}
                      field={
                        field.type === "select" && !field.options
                          ? {
                              ...field,
                              options: (
                                template.pack?.manifest.variants?.[
                                  field.surfaces?.[0] ?? ""
                                ] ?? []
                              ).map((value) => ({ value, label: value })),
                            }
                          : field
                      }
                      module={module.id}
                      value={readDraftField(values[module.id] ?? {}, field.id)}
                      onChange={(value) =>
                        change(
                          setDraftField(
                            history.present,
                            module.id,
                            field.id,
                            value,
                          ),
                        )
                      }
                    />
                  ))}
                  {module.id === "footer" && (
                    <FooterMenuColumnsSettings
                      columns={readDraftField(
                        values.footer,
                        "navColumns.columns",
                      )}
                      onChange={(columns) =>
                        change(
                          setDraftField(
                            history.present,
                            "footer",
                            "navColumns.columns",
                            columns,
                          ),
                        )
                      }
                    />
                  )}
                  {module.id === "footer" && (
                    <FooterRowsSettings
                      rows={values.footer?.rows}
                      onChange={(rows) =>
                        change(
                          setDraftField(
                            history.present,
                            "footer",
                            "rows",
                            rows,
                          ),
                        )
                      }
                    />
                  )}
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() =>
                      change(resetDraftModule(history.present, module.id))
                    }
                  >
                    Reset {module.title.toLowerCase()}
                  </button>
                </div>
              </details>
            );
          })}
          {review && (
            <section
              aria-label="Review changes"
              className="border-t border-border pt-3"
            >
              <h3 className="font-medium">Review changes</h3>
              <p className="my-2 text-sm">
                {snapshot?.identity?.environmentKind === "live"
                  ? "These changes will publish to the live site."
                  : "These changes will publish to this site's environment."}
              </p>
              <ul className="list-inside list-disc text-xs">
                {changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </section>
          )}
          {notice && (
            <p role="status" className="mt-3 text-sm">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <footer className="border-t border-border p-4">
          <button
            type="button"
            disabled={!base || saving || conflict}
            onClick={doPublish}
            className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving
              ? "Publishing…"
              : review
                ? "Confirm and publish"
                : "Review and publish"}
          </button>
        </footer>
      </aside>
      {device !== "desktop" && (
        <div className="fixed inset-y-4 left-4 right-96 z-[90] flex justify-center bg-muted/90 p-4">
          <iframe
            ref={frame}
            title={`${device} template preview`}
            src={previewUrl}
            onLoad={sendFrame}
            className="h-full border border-border bg-background"
            style={{ width: device === "phone" ? 390 : 768, maxWidth: "100%" }}
          />
        </div>
      )}
    </>
  );
}

function SettingField({
  module,
  field,
  value,
  onChange,
}: {
  module: string;
  field: TemplateSettingsField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = `customize-${module}-${field.id}`;
  const common = {
    id,
    "data-customize-field": `${module}.${field.id}`,
    className: controlClass,
  };
  return (
    <label htmlFor={id} className="block space-y-1 text-xs">
      <span>{field.label}</span>
      {field.type === "toggle" ? (
        <Checkbox
          {...common}
          className="ml-2 size-4"
          checked={value === true}
          onCheckedChange={onChange}
        />
      ) : field.type === "select" ? (
        <Select
          value={String(value ?? "")}
          onValueChange={(next) => onChange(next || null)}
        >
          <SelectTrigger {...common}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Template default</SelectItem>
            {field.options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <input
          {...common}
          type={
            field.type === "number" || field.type === "range"
              ? "number"
              : "text"
          }
          min={field.min}
          max={field.max}
          value={
            typeof value === "string" || typeof value === "number" ? value : ""
          }
          placeholder={field.brandBound ? "Site brand default" : undefined}
          onChange={(event) =>
            onChange(
              field.type === "number" || field.type === "range"
                ? Number(event.target.value)
                : event.target.value || null,
            )
          }
        />
      )}
    </label>
  );
}
