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
import type { LayoutConfig } from "./types";

export const PRESET_CONFIGS: Record<
  string,
  { name: string; description: string; config: LayoutConfig }
> = {
  magazine: {
    name: "Magazine",
    description:
      "Full hero, 2-column topic grid with images, right sidebar, summary callout, and related grid.",
    config: {
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
    },
  },
  "clean-blog": {
    name: "Clean Blog",
    description:
      "Split hero, stacked topics without images, inline summary. Clean and focused reading experience.",
    config: {
      contentWidth: "medium",
      sections: [
        { type: "hero", enabled: true, variant: "split", options: { height: "medium", overlay: "none", showCTA: false } },
        { type: "breadcrumbs", enabled: true },
        { type: "toc", enabled: false, variant: "inline" },
        { type: "topics", enabled: true, variant: "stacked", options: { columns: "1", showImages: false, showSubtitles: true, showVideos: false, imagePosition: "top", cardStyle: "flat", spacing: "normal", numbered: false } },
        { type: "summary", enabled: true, variant: "inline" },
        { type: "sources", enabled: true, variant: "list" },
        { type: "sidebar", enabled: false, variant: "right", options: { width: "standard" } },
        { type: "related", enabled: false, variant: "grid", options: { count: "3" } },
      ],
    },
  },
  documentation: {
    name: "Documentation",
    description:
      "No hero, sidebar ToC, stacked topics, expandable sources. Ideal for technical content.",
    config: {
      contentWidth: "wide",
      sections: [
        { type: "hero", enabled: false, variant: "minimal", options: { height: "short", overlay: "none", showCTA: false } },
        { type: "breadcrumbs", enabled: true },
        { type: "toc", enabled: true, variant: "sidebar" },
        { type: "topics", enabled: true, variant: "stacked", options: { columns: "1", showImages: false, showSubtitles: true, showVideos: false, imagePosition: "top", cardStyle: "flat", spacing: "normal", numbered: true } },
        { type: "summary", enabled: false, variant: "callout" },
        { type: "sources", enabled: true, variant: "expandable" },
        { type: "sidebar", enabled: true, variant: "left", options: { width: "standard" } },
        { type: "related", enabled: false, variant: "grid", options: { count: "3" } },
      ],
    },
  },
  "landing-page": {
    name: "Landing Page",
    description:
      "Full-screen hero with CTA, 3-column cards with images, summary banner. Designed for conversion.",
    config: {
      contentWidth: "full",
      sections: [
        { type: "hero", enabled: true, variant: "full-banner", options: { height: "tall", overlay: "dark", showCTA: true } },
        { type: "breadcrumbs", enabled: false },
        { type: "toc", enabled: false, variant: "sidebar" },
        { type: "topics", enabled: true, variant: "cards", options: { columns: "3", showImages: true, showSubtitles: true, showVideos: false, imagePosition: "top", cardStyle: "elevated", spacing: "relaxed", numbered: false } },
        { type: "summary", enabled: true, variant: "banner" },
        { type: "sources", enabled: false, variant: "list" },
        { type: "sidebar", enabled: false, variant: "right", options: { width: "standard" } },
        { type: "related", enabled: false, variant: "grid", options: { count: "3" } },
      ],
    },
  },
  "sidebar-focus": {
    name: "Sidebar Focus",
    description:
      "Minimal hero, left sidebar with ToC, 2-column grid, summary callout. Content-focused with easy navigation.",
    config: {
      contentWidth: "wide",
      sections: [
        { type: "hero", enabled: true, variant: "minimal", options: { height: "short", overlay: "none", showCTA: false } },
        { type: "breadcrumbs", enabled: true },
        { type: "toc", enabled: true, variant: "sidebar" },
        { type: "topics", enabled: true, variant: "grid", options: { columns: "2", showImages: true, showSubtitles: true, showVideos: false, imagePosition: "top", cardStyle: "flat", spacing: "normal", numbered: false } },
        { type: "summary", enabled: true, variant: "callout" },
        { type: "sources", enabled: true, variant: "list" },
        { type: "sidebar", enabled: true, variant: "left", options: { width: "wide" } },
        { type: "related", enabled: false, variant: "grid", options: { count: "3" } },
      ],
    },
  },
  "visual-story": {
    name: "Visual Story",
    description:
      "Full hero, zigzag topics with images, summary banner, related carousel. Immersive visual experience.",
    config: {
      contentWidth: "wide",
      sections: [
        { type: "hero", enabled: true, variant: "full-banner", options: { height: "tall", overlay: "dark", showCTA: false } },
        { type: "breadcrumbs", enabled: false },
        { type: "toc", enabled: false, variant: "floating" },
        { type: "topics", enabled: true, variant: "zigzag", options: { columns: "1", showImages: true, showSubtitles: true, showVideos: false, imagePosition: "left", cardStyle: "flat", spacing: "relaxed", numbered: false } },
        { type: "summary", enabled: true, variant: "banner" },
        { type: "sources", enabled: false, variant: "list" },
        { type: "sidebar", enabled: false, variant: "right", options: { width: "standard" } },
        { type: "related", enabled: true, variant: "carousel", options: { count: "4" } },
      ],
    },
  },
  compact: {
    name: "Compact",
    description:
      "No hero, accordion topics, footnote sources, inline summary. Dense and information-rich.",
    config: {
      contentWidth: "medium",
      sections: [
        { type: "hero", enabled: false, variant: "minimal", options: { height: "short", overlay: "none", showCTA: false } },
        { type: "breadcrumbs", enabled: true },
        { type: "toc", enabled: false, variant: "inline" },
        { type: "topics", enabled: true, variant: "accordion", options: { columns: "1", showImages: false, showSubtitles: true, showVideos: false, imagePosition: "top", cardStyle: "flat", spacing: "compact", numbered: false } },
        { type: "summary", enabled: true, variant: "inline" },
        { type: "sources", enabled: true, variant: "footnotes" },
        { type: "sidebar", enabled: false, variant: "right", options: { width: "standard" } },
        { type: "related", enabled: false, variant: "grid", options: { count: "3" } },
      ],
    },
  },
};
