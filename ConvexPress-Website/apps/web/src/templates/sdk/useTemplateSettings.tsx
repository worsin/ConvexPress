/**
 * Template settings for the active pack: pack defaults ← saved values
 * (`appearance.template.settings[packId]`) ← live Customizer draft.
 *
 * The draft arrives over `postMessage` from the admin's Customize screen
 * (which shows the site in an iframe) or from the on-site panel; it is never
 * persisted here. `TemplateSettingsInjector` turns the merged values into CSS
 * variables so colour, font and radius changes paint immediately.
 */

import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useSettings } from "@/contexts/SettingsContext";
import {
  defaultsFor,
  modulesFor,
  settingsCss,
  type SettingsModule,
} from "./settingsModules";
import { useTemplate } from "./useTemplate";
import { readDraftField } from "./draftModel";
import {
  acceptsPreviewMessage,
  mergeSettingsObject,
  mergeTemplateValues,
} from "./customizeModel";
import {
  TemplateDraftContext,
  EMPTY_PREVIEW,
  type PreviewDraft,
} from "./customizeContext";

export const CUSTOMIZE_MESSAGE = "convexpress:customize";

type Values = Record<string, Record<string, unknown>>;

/** One shared preview state for the iframe host and authorized on-site editor. */
export function TemplateSettingsDraftProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<PreviewDraft>(EMPTY_PREVIEW);
  const [open, setOpen] = useState(false);
  const [surfaceMap, setSurfaceMap] = useState<Record<string, string>>({});
  const [readMap, setReadMap] = useState<Record<string, string[]>>({});
  const reportSurface = useCallback(
    (instance: string, surface: string | null) =>
      setSurfaceMap((old) => {
        if (old[instance] === surface || (!surface && !old[instance]))
          return old;
        const next = { ...old };
        if (surface) next[instance] = surface;
        else delete next[instance];
        return next;
      }),
    [],
  );
  const reportReads = useCallback(
    (instance: string, fields: string[] | null) =>
      setReadMap((old) => {
        if (
          JSON.stringify(old[instance]) === JSON.stringify(fields ?? undefined)
        )
          return old;
        const next = { ...old };
        if (fields) next[instance] = fields;
        else delete next[instance];
        return next;
      }),
    [],
  );
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("customize") === "1") setOpen(true);
    const previewing = params.get("customize") === "preview";
    const onMessage = (event: MessageEvent) => {
      if (
        !acceptsPreviewMessage(
          previewing,
          event.source,
          window.parent,
          window,
          event.data,
        )
      )
        return;
      setDraft({
        packId: event.data.packId,
        values: event.data.values ?? {},
        variants: event.data.variants ?? {},
      });
    };
    window.addEventListener("message", onMessage);
    if (previewing && window.parent !== window)
      window.parent.postMessage({ type: `${CUSTOMIZE_MESSAGE}:ready` }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const value = useMemo(
    () => ({
      draft,
      open,
      setOpen,
      setDraft,
      reportSurface,
      reportReads,
      surfaceIds: [...new Set(Object.values(surfaceMap))],
      readFields: [...new Set(Object.values(readMap).flat())],
    }),
    [draft, open, surfaceMap, readMap, reportSurface, reportReads],
  );
  return (
    <TemplateDraftContext.Provider value={value}>
      {children}
    </TemplateDraftContext.Provider>
  );
}

export function useTemplateCustomizer() {
  return useContext(TemplateDraftContext);
}

export interface TemplateSettings {
  packId: string;
  savedPackId: string;
  modules: SettingsModule[];
  values: Values;
  /** Convenience accessor: `get("header", "sticky")`. */
  get: <T = unknown>(moduleId: string, fieldId: string) => T | undefined;
  drafting: boolean;
}

export function useTemplateSettings(): TemplateSettings {
  const template = useTemplate();
  const settings = useSettings();
  const { draft, reportReads } = useContext(TemplateDraftContext);
  const readId = useId();
  const readKeys = useRef(new Set<string>());
  readKeys.current.clear();
  useEffect(() => {
    reportReads(readId, [...readKeys.current]);
  });
  useEffect(() => () => reportReads(readId, null), [readId, reportReads]);
  const packId = template.config.active;
  const manifest = template.pack?.manifest;
  const saved = (template.config.settings?.[packId] ?? {}) as Values;
  const brand = settings?.brandConfig ?? null;

  return useMemo(() => {
    const modules = modulesFor(manifest);
    const defaults = defaultsFor(modules);
    // Brand-bound defaults come from Settings › Brand until overridden.
    if (defaults.typography) {
      defaults.typography.display = brand?.typography?.display || null;
      defaults.typography.body = brand?.typography?.body || null;
      defaults.typography.scale =
        brand?.typography?.scale ?? defaults.typography.scale;
    }
    if (defaults.layout) defaults.layout.radius = brand?.radius ?? null;
    // The pack's own defaults sit between the module defaults and the site's saved values.
    for (const [moduleId, fields] of Object.entries(manifest?.defaults ?? {})) {
      defaults[moduleId] = mergeSettingsObject(
        defaults[moduleId] ?? {},
        fields,
      );
    }
    const drafting = draft.packId === packId;
    const values = mergeTemplateValues(
      defaults,
      saved,
      drafting ? draft.values : undefined,
    );
    return {
      packId,
      savedPackId: template.savedPackId,
      modules,
      values,
      get: <T,>(moduleId: string, fieldId: string) => {
        readKeys.current.add(`${moduleId}.${fieldId}`);
        return readDraftField(values[moduleId] ?? {}, fieldId) as T | undefined;
      },
      drafting,
    };
  }, [manifest, packId, template.savedPackId, saved, brand, draft]);
}

/** Emits the CSS variables for the merged colour / typography / layout values. */
export function TemplateSettingsInjector() {
  const { values } = useTemplateSettings();
  const { css, fonts } = useMemo(() => settingsCss(values), [values]);
  if (!css) return null;
  const href = fonts.length
    ? `https://fonts.googleapis.com/css2?${fonts.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`).join("&")}&display=swap`
    : null;
  return (
    <>
      {href && <link rel="stylesheet" href={href} />}
      <style
        id="convexpress-template-settings"
        dangerouslySetInnerHTML={{ __html: css }}
      />
    </>
  );
}

/** The draft's variant choices (Customizer previewing shop layouts, page templates…). */
export function useDraftVariants(): Record<string, string> {
  const { draft } = useContext(TemplateDraftContext);
  const template = useTemplate();
  return draft.packId === template.config.active ? draft.variants : {};
}
