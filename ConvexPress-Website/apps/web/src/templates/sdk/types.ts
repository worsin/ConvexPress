/**
 * Template pack contract (storefront SDK, v1).
 *
 * A pack is a folder under `templates/packs/<id>/` with a `template.json`
 * manifest and one component per surface it implements. Packs render from
 * SDK view models and token classes only; they never call the backend.
 */

import type { ComponentType } from "react";

import type { TemplateSettingsGroup } from "./settingsSchema";
export type { TemplateSettingsField, TemplateSettingsGroup } from "./settingsSchema";

export interface TemplateManifest {
  /** Explicit per-block treatment opt-ins; generated backend support uses the same manifest. */
  blocks?: { hidden?: import("../../../../../../blocks/.generated/types").BlockName[]; styles?: Partial<Record<import("../../../../../../blocks/.generated/types").BlockName, string[]>>; renderers?: Partial<Record<import("../../../../../../blocks/.generated/types").BlockName, string>>; patterns?: "./patterns/*.json"; treatments?: Partial<Record<import("../../../../../../blocks/.generated/types").BlockName, string[]>> };
  id: string;
  name: string;
  version: string;
  /** Storefront SDK range this pack was written against. */
  sdk: string;
  tagline: string;
  description: string;
  author?: string;
  bestFor?: string[];
  /** Surface ids this pack implements itself (everything else falls back to Core). */
  surfaces: string[];
  /** Variant ids offered per surface, with the first as the default. */
  variants?: Record<string, string[]>;
  /** Settings modules included from the SDK (colors, typography, layout, header, footer, menuLayout, shop, pageTemplates). */
  modules?: string[];
  /** Pack-specific Customize groups. */
  settings?: TemplateSettingsGroup[];
  /** Named settings presets offered by the pack. */
  presets?: Record<string, Array<{ id: string; name: string; colors: Record<string, string> }>>;
  /** Per-pack defaults for module fields, e.g. { layout: { contentWidth: "full" } }. */
  defaults?: Record<string, Record<string, unknown>>;
  /** Menu locations rendered, keyed by role. */
  menuLocations?: Record<string, string>;
}

/** Props every surface component receives. `data` is the surface's view model. */
export interface SurfaceProps<TData = unknown> {
  data: TData;
  variant?: string;
  packId: string;
}

export type SurfaceComponent<TData = unknown> = ComponentType<SurfaceProps<TData>>;

export interface TemplatePack {
  manifest: TemplateManifest;
  surfaces: Record<string, SurfaceComponent<any>>;
}

export interface TemplateConfig {
  active: string;
  overrides: Record<string, string>;
  variants: Record<string, string>;
  settings: Record<string, Record<string, unknown>>;
}
