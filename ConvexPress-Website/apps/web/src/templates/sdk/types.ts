/**
 * Template pack contract (storefront SDK, v1).
 *
 * A pack is a folder under `templates/packs/<id>/` with a `template.json`
 * manifest and one component per surface it implements. Packs render from
 * SDK view models and token classes only; they never call the backend.
 */

import type { ComponentType } from "react";

export interface TemplateSettingsField {
  id: string;
  label: string;
  type: "color" | "font" | "select" | "toggle" | "text" | "number" | "image" | "menuLocation" | "range";
  default: unknown;
  options?: Array<{ value: string; label: string }>;
  /** Default comes from the brand doc / site identity until overridden. */
  brandBound?: boolean;
  /** Surfaces this field affects; used by the Customizer's context filter. */
  surfaces?: string[];
  min?: number;
  max?: number;
}

export interface TemplateSettingsGroup {
  id: string;
  title: string;
  fields: TemplateSettingsField[];
}

export interface TemplateManifest {
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
