/**
 * @deprecated 2026-05-11 — Legacy in-admin Theme/Template Builder.
 *
 * STATUS:  Frozen. Hidden from active nav. Do NOT extend or fix issues here.
 * REASON:  A pre-built section enum + preset theme picker limits what each
 *          site can look like. Replaced by AI-generated React components,
 *          one per route, generated per site by the design:* skill kit.
 * REPLACEMENT:  See ConvexPress-Website/design-kit/README.md
 * REMOVAL:  Safe to delete once at least one site is fully shipped via the
 *           skill kit and nothing else references this file.
 */
export type ContentWidth = "narrow" | "medium" | "wide" | "full";

export type SectionType =
  | "hero"
  | "breadcrumbs"
  | "toc"
  | "topics"
  | "summary"
  | "sources"
  | "sidebar"
  | "related";

export interface SectionConfig {
  type: SectionType;
  enabled: boolean;
  variant?: string;
  options?: Record<string, unknown>;
}

export interface LayoutConfig {
  contentWidth: ContentWidth;
  sections: SectionConfig[];
}

export interface Layout {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  type: "preset" | "custom" | "ai";
  config: LayoutConfig;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

// Section definition metadata for the composer UI
export interface VariantDef {
  id: string;
  label: string;
}

export interface OptionDef {
  id: string;
  label: string;
  type: "select" | "toggle" | "text" | "number";
  values?: { value: string; label: string }[];
  defaultValue: unknown;
  appliesTo?: string[]; // which variants this option applies to
}

export interface SectionDef {
  type: SectionType;
  label: string;
  hint: string;
  alwaysOn?: boolean;
  variants?: VariantDef[];
  options?: OptionDef[];
}
