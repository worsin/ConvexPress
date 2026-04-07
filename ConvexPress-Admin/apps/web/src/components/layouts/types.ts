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
