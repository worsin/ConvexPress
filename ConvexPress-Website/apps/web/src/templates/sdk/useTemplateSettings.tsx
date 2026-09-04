/**
 * Template settings for the active pack: pack defaults ← saved values
 * (`appearance.template.settings[packId]`) ← live Customizer draft.
 *
 * The draft arrives over `postMessage` from the admin's Customize screen
 * (which shows the site in an iframe) or from the on-site panel; it is never
 * persisted here. `TemplateSettingsInjector` turns the merged values into CSS
 * variables so colour, font and radius changes paint immediately.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useSettings } from "@/contexts/SettingsContext";
import { defaultsFor, modulesFor, settingsCss, type SettingsModule } from "./settingsModules";
import { useTemplate } from "./useTemplate";

export const CUSTOMIZE_MESSAGE = "convexpress:customize";

type Values = Record<string, Record<string, unknown>>;

interface DraftState {
  packId: string | null;
  values: Values;
  variants: Record<string, string>;
}

const DraftContext = createContext<DraftState>({ packId: null, values: {}, variants: {} });

function isDraftMessage(data: unknown): data is { type: typeof CUSTOMIZE_MESSAGE; packId: string; values?: Values; variants?: Record<string, string> } {
  return !!data && typeof data === "object" && (data as { type?: unknown }).type === CUSTOMIZE_MESSAGE && typeof (data as { packId?: unknown }).packId === "string";
}

/** Mount once near the root. Listens for Customizer drafts when the page is opened for preview. */
export function TemplateSettingsDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<DraftState>({ packId: null, values: {}, variants: {} });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const previewing = params.get("customize") === "preview";
    if (!previewing) return;
    const onMessage = (event: MessageEvent) => {
      if (!isDraftMessage(event.data)) return;
      setDraft({ packId: event.data.packId, values: event.data.values ?? {}, variants: event.data.variants ?? {} });
    };
    window.addEventListener("message", onMessage);
    // Tell the host we are ready to receive the current draft.
    window.parent?.postMessage({ type: `${CUSTOMIZE_MESSAGE}:ready` }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return <DraftContext.Provider value={draft}>{children}</DraftContext.Provider>;
}

export interface TemplateSettings {
  packId: string;
  modules: SettingsModule[];
  values: Values;
  /** Convenience accessor: `get("header", "sticky")`. */
  get: <T = unknown>(moduleId: string, fieldId: string) => T | undefined;
  drafting: boolean;
}

export function useTemplateSettings(): TemplateSettings {
  const template = useTemplate();
  const settings = useSettings();
  const draft = useContext(DraftContext);
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
      defaults.typography.scale = brand?.typography?.scale ?? defaults.typography.scale;
    }
    if (defaults.layout) defaults.layout.radius = brand?.radius ?? null;
    // The pack's own defaults sit between the module defaults and the site's saved values.
    for (const [moduleId, fields] of Object.entries(manifest?.defaults ?? {})) {
      defaults[moduleId] = { ...(defaults[moduleId] ?? {}), ...fields };
    }
    const drafting = draft.packId === packId;
    const values: Values = {};
    for (const module of modules) {
      values[module.id] = {
        ...(defaults[module.id] ?? {}),
        ...(saved[module.id] ?? {}),
        ...(drafting ? draft.values[module.id] ?? {} : {}),
      };
    }
    return {
      packId,
      modules,
      values,
      get: <T,>(moduleId: string, fieldId: string) => values[moduleId]?.[fieldId] as T | undefined,
      drafting,
    };
  }, [manifest, packId, saved, brand, draft]);
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
      <style id="convexpress-template-settings" dangerouslySetInnerHTML={{ __html: css }} />
    </>
  );
}

/** The draft's variant choices (Customizer previewing shop layouts, page templates…). */
export function useDraftVariants(): Record<string, string> {
  const draft = useContext(DraftContext);
  const template = useTemplate();
  return draft.packId === template.config.active ? draft.variants : {};
}
