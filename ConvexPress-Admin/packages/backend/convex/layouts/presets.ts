/**
 * Layout System - Preset Configurations
 *
 * 7 built-in layout presets. Each defines a complete section arrangement
 * and content width configuration. These are seeded into the database
 * on first run and cannot be deleted by users.
 *
 * Section types: hero, breadcrumbs, toc, topics, summary, sources, sidebar, related
 */

/**
 * Type for a preset layout (without timestamps — those are added at insert time).
 */
export interface PresetLayout {
  name: string;
  slug: string;
  description: string;
  type: "preset";
  config: {
    contentWidth: "narrow" | "medium" | "wide" | "full";
    sections: Array<{
      type: string;
      enabled: boolean;
      variant?: string;
      options?: any;
    }>;
  };
  isDefault?: boolean;
}

export const PRESET_LAYOUTS: PresetLayout[] = [
  // ─── 1. Magazine ──────────────────────────────────────────────────────────────
  {
    name: "Magazine",
    slug: "magazine",
    description:
      "Bold editorial layout with full-width hero, image-rich topic grid, and sidebar navigation.",
    type: "preset",
    config: {
      contentWidth: "wide",
      sections: [
        { type: "hero", enabled: true, variant: "full-banner" },
        { type: "breadcrumbs", enabled: true },
        { type: "topics", enabled: true, variant: "grid-2col", options: { showImages: true } },
        { type: "sidebar", enabled: true, variant: "right" },
        { type: "summary", enabled: true, variant: "callout" },
        { type: "sources", enabled: true, variant: "list" },
        { type: "related", enabled: true, variant: "grid", options: { columns: 3 } },
      ],
    },
    isDefault: true,
  },

  // ─── 2. Clean Blog ────────────────────────────────────────────────────────────
  {
    name: "Clean Blog",
    slug: "clean-blog",
    description:
      "Minimal reading-focused layout with split hero, inline summary, and no sidebar distractions.",
    type: "preset",
    config: {
      contentWidth: "medium",
      sections: [
        { type: "hero", enabled: true, variant: "split" },
        { type: "breadcrumbs", enabled: true },
        { type: "topics", enabled: true, variant: "stacked", options: { showImages: false } },
        { type: "sidebar", enabled: false },
        { type: "summary", enabled: true, variant: "inline" },
        { type: "sources", enabled: true, variant: "list" },
        { type: "related", enabled: false },
      ],
    },
  },

  // ─── 3. Documentation ─────────────────────────────────────────────────────────
  {
    name: "Documentation",
    slug: "documentation",
    description:
      "Technical documentation layout with table of contents sidebar, expandable sources, and no hero.",
    type: "preset",
    config: {
      contentWidth: "wide",
      sections: [
        { type: "hero", enabled: false },
        { type: "breadcrumbs", enabled: true },
        { type: "toc", enabled: true, variant: "sidebar" },
        { type: "topics", enabled: true, variant: "stacked" },
        { type: "sidebar", enabled: true, variant: "left" },
        { type: "summary", enabled: false },
        { type: "sources", enabled: true, variant: "expandable" },
        { type: "related", enabled: false },
      ],
    },
  },

  // ─── 4. Landing Page ──────────────────────────────────────────────────────────
  {
    name: "Landing Page",
    slug: "landing-page",
    description:
      "High-impact landing layout with tall hero CTA, 3-column topic cards, and summary banner.",
    type: "preset",
    config: {
      contentWidth: "full",
      sections: [
        { type: "hero", enabled: true, variant: "full-tall", options: { showCta: true } },
        { type: "breadcrumbs", enabled: false },
        {
          type: "topics",
          enabled: true,
          variant: "cards-3col",
          options: { showImages: true },
        },
        { type: "summary", enabled: true, variant: "banner" },
        { type: "sources", enabled: false },
        { type: "sidebar", enabled: false },
        { type: "related", enabled: false },
      ],
    },
  },

  // ─── 5. Sidebar Focus ─────────────────────────────────────────────────────────
  {
    name: "Sidebar Focus",
    slug: "sidebar-focus",
    description:
      "Navigation-heavy layout with wide left sidebar containing TOC and related articles.",
    type: "preset",
    config: {
      contentWidth: "wide",
      sections: [
        { type: "hero", enabled: true, variant: "minimal" },
        { type: "breadcrumbs", enabled: false },
        { type: "toc", enabled: true, variant: "in-sidebar" },
        { type: "topics", enabled: true, variant: "grid-2col" },
        { type: "summary", enabled: true, variant: "callout" },
        { type: "sources", enabled: true, variant: "list" },
        {
          type: "sidebar",
          enabled: true,
          variant: "left-wide",
          options: { includeRelated: true },
        },
        { type: "related", enabled: true, variant: "in-sidebar" },
      ],
    },
  },

  // ─── 6. Visual Story ──────────────────────────────────────────────────────────
  {
    name: "Visual Story",
    slug: "visual-story",
    description:
      "Immersive visual layout with tall hero, zigzag image topics, and related article carousel.",
    type: "preset",
    config: {
      contentWidth: "wide",
      sections: [
        { type: "hero", enabled: true, variant: "full-tall" },
        { type: "breadcrumbs", enabled: false },
        { type: "topics", enabled: true, variant: "zigzag", options: { showImages: true } },
        { type: "summary", enabled: true, variant: "banner" },
        { type: "sources", enabled: false },
        { type: "sidebar", enabled: false },
        { type: "related", enabled: true, variant: "carousel" },
      ],
    },
  },

  // ─── 7. Compact ───────────────────────────────────────────────────────────────
  {
    name: "Compact",
    slug: "compact",
    description:
      "Dense, space-efficient layout with accordion topics, footnote sources, and no hero or sidebar.",
    type: "preset",
    config: {
      contentWidth: "medium",
      sections: [
        { type: "hero", enabled: false },
        { type: "breadcrumbs", enabled: true },
        { type: "topics", enabled: true, variant: "accordion" },
        { type: "summary", enabled: true, variant: "inline" },
        { type: "sources", enabled: true, variant: "footnotes" },
        { type: "sidebar", enabled: false },
        { type: "related", enabled: false },
      ],
    },
  },
];
