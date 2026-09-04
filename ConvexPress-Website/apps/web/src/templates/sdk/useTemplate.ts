/**
 * Active template for this site: the saved `appearance.template` section
 * (public as `templateConfig`) with `?template=` / `?variant.<surface>=`
 * preview overrides that are never persisted.
 */

import { useSearch } from "@tanstack/react-router";
import { useMemo } from "react";

import { useSettings } from "@/contexts/SettingsContext";
import { DEFAULT_TEMPLATE_CONFIG, getTemplatePack, resolveSurface, resolveVariant } from "./registry";
import type { TemplateConfig, TemplatePack } from "./types";

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface ActiveTemplate {
  config: TemplateConfig;
  pack: TemplatePack | undefined;
  previewing: boolean;
  resolve: (surfaceId: string) => ReturnType<typeof resolveSurface> & { variant?: string };
}

export function useTemplate(): ActiveTemplate {
  const settings = useSettings();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const stored = (settings as { templateConfig?: Partial<TemplateConfig> } | null)?.templateConfig;

  return useMemo(() => {
    const base: TemplateConfig = {
      active: typeof stored?.active === "string" && SLUG.test(stored.active) && getTemplatePack(stored.active) ? stored.active : DEFAULT_TEMPLATE_CONFIG.active,
      overrides: stored?.overrides ?? {},
      variants: { ...(stored?.variants ?? {}) },
      settings: stored?.settings ?? {},
    };
    let previewing = false;
    const previewPack = search.template;
    if (typeof previewPack === "string" && SLUG.test(previewPack) && getTemplatePack(previewPack) && previewPack !== base.active) {
      base.active = previewPack;
      previewing = true;
    }
    for (const [key, value] of Object.entries(search)) {
      if (key.startsWith("variant.") && typeof value === "string" && SLUG.test(value)) {
        base.variants[key.slice("variant.".length)] = value;
        previewing = true;
      }
    }
    return {
      config: base,
      pack: getTemplatePack(base.active),
      previewing,
      resolve: (surfaceId: string) => {
        const resolved = resolveSurface(surfaceId, base);
        return { ...resolved, variant: resolveVariant(surfaceId, base, resolved.packId) };
      },
    };
  }, [stored, search]);
}
