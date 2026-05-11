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
import { HEADER_DEFAULTS, FOOTER_DEFAULTS } from "../settings/defaults";

/**
 * Preset Themes
 *
 * Each preset bundles header, footer, layout assignments, and color palette
 * into a complete appearance configuration. These are seeded once on first
 * install and cannot be deleted (only duplicated and customized).
 */

export const PRESET_THEMES = [
  // ── 1. ConvexPress Default ──────────────────────────────────────────────
  {
    name: "ConvexPress Default",
    slug: "default",
    description: "The standard ConvexPress look. Clean, professional, and content-focused.",
    type: "preset" as const,
    isActive: true,
    headerConfig: {
      ...HEADER_DEFAULTS,
    },
    footerConfig: {
      ...FOOTER_DEFAULTS,
    },
    layoutAssignments: {
      blogPostLayout: "magazine",
      pageLayout: "clean-blog",
      blogIndexLayout: "magazine",
      categoryArchiveLayout: "magazine",
      tagArchiveLayout: "magazine",
      authorArchiveLayout: "magazine",
      searchResultsLayout: "magazine",
      kbArticleLayout: "documentation",
    },
    colorPalette: {
      primary: "#3b82f6",
      secondary: "#6366f1",
      accent: "#f59e0b",
      background: "#ffffff",
      foreground: "#0f172a",
      muted: "#f1f5f9",
      mutedForeground: "#64748b",
    },
  },

  // ── 2. SaaS Product ────────────────────────────────────────────────────
  {
    name: "SaaS Product",
    slug: "saas-product",
    description: "Modern SaaS site with prominent CTAs, glass header, and newsletter-driven footer.",
    type: "preset" as const,
    isActive: false,
    headerConfig: {
      ...HEADER_DEFAULTS,
      layout: {
        ...HEADER_DEFAULTS.layout,
        background: "glass" as const,
      },
      cta: {
        ...HEADER_DEFAULTS.cta,
        enabled: true,
        label: "Start Free Trial",
        url: "/register",
        style: "filled" as const,
      },
      search: {
        ...HEADER_DEFAULTS.search,
        variant: "icon" as const,
      },
    },
    footerConfig: {
      ...FOOTER_DEFAULTS,
      layout: {
        ...FOOTER_DEFAULTS.layout,
        columns: "3" as const,
      },
      newsletter: {
        ...FOOTER_DEFAULTS.newsletter,
        enabled: true,
        heading: "Get Product Updates",
        subtext: "Join thousands of users getting the latest features and tips.",
        buttonText: "Subscribe",
      },
      contactInfo: {
        ...FOOTER_DEFAULTS.contactInfo,
        enabled: false,
      },
    },
    layoutAssignments: {
      blogPostLayout: "visual-story",
      pageLayout: "landing-page",
      blogIndexLayout: "magazine",
      categoryArchiveLayout: "magazine",
      tagArchiveLayout: "magazine",
      authorArchiveLayout: "magazine",
      searchResultsLayout: "magazine",
      kbArticleLayout: "documentation",
    },
    colorPalette: {
      primary: "#4f46e5",
      secondary: "#3b82f6",
      accent: "#06b6d4",
      background: "#ffffff",
      foreground: "#1e1b4b",
      muted: "#eef2ff",
      mutedForeground: "#6366f1",
    },
  },

  // ── 3. Corporate ───────────────────────────────────────────────────────
  {
    name: "Corporate",
    slug: "corporate",
    description: "Professional business presence with split header, contact info footer, and neutral tones.",
    type: "preset" as const,
    isActive: false,
    headerConfig: {
      ...HEADER_DEFAULTS,
      layout: {
        ...HEADER_DEFAULTS.layout,
        style: "split" as const,
      },
      search: {
        ...HEADER_DEFAULTS.search,
        enabled: false,
      },
      topBar: {
        ...HEADER_DEFAULTS.topBar,
        enabled: true,
        leftContent: "contact" as const,
        rightContent: "social" as const,
      },
    },
    footerConfig: {
      ...FOOTER_DEFAULTS,
      layout: {
        ...FOOTER_DEFAULTS.layout,
        columns: "4" as const,
      },
      contactInfo: {
        ...FOOTER_DEFAULTS.contactInfo,
        enabled: true,
      },
      newsletter: {
        ...FOOTER_DEFAULTS.newsletter,
        enabled: false,
      },
    },
    layoutAssignments: {
      blogPostLayout: "magazine",
      pageLayout: "documentation",
      blogIndexLayout: "magazine",
      categoryArchiveLayout: "magazine",
      tagArchiveLayout: "magazine",
      authorArchiveLayout: "magazine",
      searchResultsLayout: "magazine",
      kbArticleLayout: "documentation",
    },
    colorPalette: {
      primary: "#374151",
      secondary: "#4b5563",
      accent: "#1d4ed8",
      background: "#ffffff",
      foreground: "#111827",
      muted: "#f3f4f6",
      mutedForeground: "#6b7280",
    },
  },

  // ── 4. Creative Blog ───────────────────────────────────────────────────
  {
    name: "Creative Blog",
    slug: "creative-blog",
    description: "Content-focused blog with centered header, underline nav, and warm color palette.",
    type: "preset" as const,
    isActive: false,
    headerConfig: {
      ...HEADER_DEFAULTS,
      layout: {
        ...HEADER_DEFAULTS.layout,
        style: "centered" as const,
      },
      navigation: {
        ...HEADER_DEFAULTS.navigation,
        style: "underline" as const,
      },
      cta: {
        ...HEADER_DEFAULTS.cta,
        enabled: false,
      },
    },
    footerConfig: {
      ...FOOTER_DEFAULTS,
      layout: {
        ...FOOTER_DEFAULTS.layout,
        columns: "minimal" as const,
        padding: "compact" as const,
      },
      navColumns: {
        ...FOOTER_DEFAULTS.navColumns,
        enabled: false,
      },
      newsletter: {
        ...FOOTER_DEFAULTS.newsletter,
        enabled: true,
        heading: "Never Miss a Post",
        subtext: "Subscribe for fresh stories, ideas, and inspiration.",
        buttonText: "Join",
      },
      contactInfo: {
        ...FOOTER_DEFAULTS.contactInfo,
        enabled: false,
      },
    },
    layoutAssignments: {
      blogPostLayout: "clean-blog",
      pageLayout: "full-width",
      blogIndexLayout: "clean-blog",
      categoryArchiveLayout: "clean-blog",
      tagArchiveLayout: "clean-blog",
      authorArchiveLayout: "clean-blog",
      searchResultsLayout: "clean-blog",
      kbArticleLayout: "clean-blog",
    },
    colorPalette: {
      primary: "#b45309",
      secondary: "#d97706",
      accent: "#ea580c",
      background: "#fffbeb",
      foreground: "#292524",
      muted: "#fef3c7",
      mutedForeground: "#78716c",
    },
  },

  // ── 5. Portfolio ───────────────────────────────────────────────────────
  {
    name: "Portfolio",
    slug: "portfolio",
    description: "Visual portfolio site with compact header, dark palette, and landing page layouts.",
    type: "preset" as const,
    isActive: false,
    headerConfig: {
      ...HEADER_DEFAULTS,
      layout: {
        ...HEADER_DEFAULTS.layout,
        height: "compact" as const,
      },
      topBar: {
        ...HEADER_DEFAULTS.topBar,
        enabled: false,
      },
      search: {
        ...HEADER_DEFAULTS.search,
        enabled: false,
      },
      cta: {
        ...HEADER_DEFAULTS.cta,
        enabled: true,
        label: "Hire Me",
        url: "/contact",
        style: "outline" as const,
      },
    },
    footerConfig: {
      ...FOOTER_DEFAULTS,
      layout: {
        ...FOOTER_DEFAULTS.layout,
        columns: "centered" as const,
        background: "dark" as const,
        padding: "compact" as const,
      },
      navColumns: {
        ...FOOTER_DEFAULTS.navColumns,
        enabled: false,
      },
      newsletter: {
        ...FOOTER_DEFAULTS.newsletter,
        enabled: false,
      },
      contactInfo: {
        ...FOOTER_DEFAULTS.contactInfo,
        enabled: false,
      },
      branding: {
        ...FOOTER_DEFAULTS.branding,
        enabled: true,
        showLogo: false,
        showDescription: false,
        showSocial: true,
      },
    },
    layoutAssignments: {
      blogPostLayout: "visual-story",
      pageLayout: "landing-page",
      blogIndexLayout: "visual-story",
      categoryArchiveLayout: "visual-story",
      tagArchiveLayout: "visual-story",
      authorArchiveLayout: "visual-story",
      searchResultsLayout: "magazine",
      kbArticleLayout: "documentation",
    },
    colorPalette: {
      primary: "#e2e8f0",
      secondary: "#94a3b8",
      accent: "#38bdf8",
      background: "#0f172a",
      foreground: "#f1f5f9",
      muted: "#1e293b",
      mutedForeground: "#94a3b8",
    },
  },
];
