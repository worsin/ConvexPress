import type { SectionDef, LayoutConfig } from "./types";

export const SECTION_DEFINITIONS: SectionDef[] = [
  {
    type: "hero",
    label: "Hero",
    hint: "Top banner area with title, subtitle, and optional call-to-action",
    variants: [
      { id: "full-banner", label: "Full Banner" },
      { id: "split", label: "Split" },
      { id: "minimal", label: "Minimal" },
      { id: "video-bg", label: "Video Background" },
    ],
    options: [
      {
        id: "height",
        label: "Height",
        type: "select",
        values: [
          { value: "short", label: "Short" },
          { value: "medium", label: "Medium" },
          { value: "tall", label: "Tall" },
          { value: "full-screen", label: "Full Screen" },
        ],
        defaultValue: "medium",
      },
      {
        id: "overlay",
        label: "Overlay",
        type: "select",
        values: [
          { value: "dark", label: "Dark" },
          { value: "light", label: "Light" },
          { value: "none", label: "None" },
        ],
        defaultValue: "dark",
      },
      {
        id: "showCTA",
        label: "Show CTA Button",
        type: "toggle",
        defaultValue: true,
      },
    ],
  },
  {
    type: "breadcrumbs",
    label: "Breadcrumbs",
    hint: "Navigation breadcrumb trail below the header",
  },
  {
    type: "toc",
    label: "Table of Contents",
    hint: "Auto-generated table of contents from headings",
    variants: [
      { id: "sidebar", label: "Sidebar" },
      { id: "inline", label: "Inline" },
      { id: "floating", label: "Floating" },
    ],
  },
  {
    type: "topics",
    label: "Topics",
    hint: "Main content sections displayed in various layouts",
    variants: [
      { id: "grid", label: "Grid" },
      { id: "stacked", label: "Stacked" },
      { id: "accordion", label: "Accordion" },
      { id: "cards", label: "Cards" },
      { id: "timeline", label: "Timeline" },
      { id: "zigzag", label: "Zigzag" },
      { id: "masonry", label: "Masonry" },
      { id: "alternating", label: "Alternating" },
      { id: "featured-first", label: "Featured First" },
      { id: "tabbed", label: "Tabbed" },
    ],
    options: [
      {
        id: "columns",
        label: "Columns",
        type: "select",
        values: [
          { value: "1", label: "1 Column" },
          { value: "2", label: "2 Columns" },
          { value: "3", label: "3 Columns" },
          { value: "4", label: "4 Columns" },
        ],
        defaultValue: "2",
        appliesTo: ["grid", "cards", "masonry"],
      },
      {
        id: "showImages",
        label: "Show Images",
        type: "toggle",
        defaultValue: true,
      },
      {
        id: "showSubtitles",
        label: "Show Subtitles",
        type: "toggle",
        defaultValue: true,
      },
      {
        id: "showVideos",
        label: "Show Videos",
        type: "toggle",
        defaultValue: false,
      },
      {
        id: "imagePosition",
        label: "Image Position",
        type: "select",
        values: [
          { value: "top", label: "Top" },
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
          { value: "background", label: "Background" },
        ],
        defaultValue: "top",
        appliesTo: ["grid", "cards", "featured-first"],
      },
      {
        id: "cardStyle",
        label: "Card Style",
        type: "select",
        values: [
          { value: "flat", label: "Flat" },
          { value: "elevated", label: "Elevated" },
          { value: "bordered", label: "Bordered" },
          { value: "glass", label: "Glass" },
        ],
        defaultValue: "flat",
        appliesTo: ["cards", "grid"],
      },
      {
        id: "spacing",
        label: "Spacing",
        type: "select",
        values: [
          { value: "compact", label: "Compact" },
          { value: "normal", label: "Normal" },
          { value: "relaxed", label: "Relaxed" },
        ],
        defaultValue: "normal",
      },
      {
        id: "numbered",
        label: "Numbered",
        type: "toggle",
        defaultValue: false,
        appliesTo: ["stacked", "accordion", "timeline"],
      },
    ],
  },
  {
    type: "summary",
    label: "Summary",
    hint: "Brief overview or key takeaways section",
    variants: [
      { id: "callout", label: "Callout" },
      { id: "banner", label: "Banner" },
      { id: "inline", label: "Inline" },
    ],
  },
  {
    type: "sources",
    label: "Sources",
    hint: "References and citations section",
    variants: [
      { id: "list", label: "List" },
      { id: "expandable", label: "Expandable" },
      { id: "footnotes", label: "Footnotes" },
    ],
  },
  {
    type: "sidebar",
    label: "Sidebar",
    hint: "Side panel with supplementary content or navigation",
    variants: [
      { id: "left", label: "Left" },
      { id: "right", label: "Right" },
    ],
    options: [
      {
        id: "width",
        label: "Width",
        type: "select",
        values: [
          { value: "narrow", label: "Narrow" },
          { value: "standard", label: "Standard" },
          { value: "wide", label: "Wide" },
        ],
        defaultValue: "standard",
      },
    ],
  },
  {
    type: "related",
    label: "Related Content",
    hint: "Related articles or pages shown at the bottom",
    variants: [
      { id: "grid", label: "Grid" },
      { id: "list", label: "List" },
      { id: "carousel", label: "Carousel" },
    ],
    options: [
      {
        id: "count",
        label: "Number of Items",
        type: "select",
        values: [
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "4", label: "4" },
          { value: "6", label: "6" },
        ],
        defaultValue: "3",
      },
    ],
  },
];

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  contentWidth: "wide",
  sections: [
    { type: "hero", enabled: true, variant: "full-banner", options: { height: "medium", overlay: "dark", showCTA: true } },
    { type: "breadcrumbs", enabled: true },
    { type: "toc", enabled: false, variant: "sidebar" },
    { type: "topics", enabled: true, variant: "grid", options: { columns: "2", showImages: true, showSubtitles: true, showVideos: false, imagePosition: "top", cardStyle: "flat", spacing: "normal", numbered: false } },
    { type: "summary", enabled: true, variant: "callout" },
    { type: "sources", enabled: true, variant: "list" },
    { type: "sidebar", enabled: true, variant: "right", options: { width: "standard" } },
    { type: "related", enabled: true, variant: "grid", options: { count: "3" } },
  ],
};

export const CONTENT_WIDTH_OPTIONS = [
  { value: "narrow", label: "Narrow" },
  { value: "medium", label: "Medium" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full" },
] as const;
