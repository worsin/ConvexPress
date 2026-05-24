# Layout System Design

**Date:** 2026-04-06
**Status:** Approved
**Mockup:** `specs/superpowers/mockups/layout-system-mockup.html`

---

## Overview

A data-driven layout system where layouts are JSON configurations stored in the Convex database. Each layout defines which content sections are visible, which visual variant to use for each section, and what options to apply. Layouts are assignable per content type (blog posts, pages, archives, etc.) with per-page overrides. AI can create new layouts by generating JSON configs — no code changes or deployment needed.

## Core Concepts

### What Is a Layout?

A layout is a saved JSON config that controls how the **content area** of a page renders. It does NOT control the site header or footer (those are global). A layout specifies:

- Which sections are enabled (hero, breadcrumbs, ToC, topics, summary, sources, sidebar, related content)
- Which variant each section uses (e.g., hero: "full-banner" vs "split" vs "minimal")
- Per-section options (e.g., topics grid columns, hero height, sidebar width)
- Content width (narrow, medium, wide, full)

### What Is NOT a Layout?

- **Header/Footer** — Global site-wide settings, not part of layouts
- **Colors/Theme** — Handled separately by the existing ThemeStyleInjector / CSS variables system
- **Content itself** — Layouts arrange existing post/page data fields; they don't create content

## Architecture

### Database: `layouts` Table

New table in `ConvexPress-Admin/packages/backend/convex/schema/layouts.ts`:

```typescript
export const layoutTables = {
  layouts: defineTable({
    name: v.string(),                    // Display name ("Magazine", "Clean Blog")
    slug: v.string(),                    // URL-safe identifier
    description: v.optional(v.string()), // What this layout is for
    type: v.union(                       // Origin type
      v.literal("preset"),              // Ships with ConvexPress
      v.literal("custom"),              // User-created
      v.literal("ai"),                  // AI-generated
    ),
    config: v.object({                   // The layout configuration
      contentWidth: v.union(v.literal("narrow"), v.literal("medium"), v.literal("wide"), v.literal("full")),
      sections: v.array(v.object({
        type: v.string(),               // Section identifier
        enabled: v.boolean(),
        variant: v.optional(v.string()),
        options: v.optional(v.any()),   // Section-specific options
      })),
    }),
    previewThumbnail: v.optional(v.string()), // Auto-generated mini preview data (SVG or JSON)
    isDefault: v.optional(v.boolean()),       // Whether this is a built-in preset
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_type", ["type"])
    .index("by_name", ["name"]),
};
```

### Database: Layout Assignments in Settings

Layout assignments (which layout each content type uses) stored in the existing `settings` table with a new `"layout"` section:

```typescript
// Added to settings section union
v.literal("layout")

// Settings values shape:
{
  blogPostLayout: layoutId,        // Default for single blog posts
  pageLayout: layoutId,            // Default for pages
  blogIndexLayout: layoutId,       // Blog listing page
  categoryArchiveLayout: layoutId, // Category archive
  tagArchiveLayout: layoutId,      // Tag archive
  authorArchiveLayout: layoutId,   // Author archive
  searchResultsLayout: layoutId,   // Search results
  kbArticleLayout: layoutId,       // KB articles
}
```

### Per-Page Override

Already supported via the existing `pageTemplate` field on posts. We repurpose this field (or add a `layoutId` field) to store a layout override:

```typescript
// On the posts table — add:
layoutId: v.optional(v.id("layouts")),  // Per-post/page layout override
hideHeader: v.optional(v.boolean()),     // Hide site header on this page
hideFooter: v.optional(v.boolean()),     // Hide site footer on this page
```

### Layout Resolution Order

When rendering a post/page on the website:

1. Check `post.layoutId` — if set, use that layout (per-page override)
2. Otherwise, check settings for the content type's default layout
3. If no setting, fall back to the "Magazine" preset (or first available preset)

## Section Types

Each section maps directly to a field on the post/page data model:

| Section | Data Source | Variants | Key Options |
|---------|------------|----------|-------------|
| **Hero** | `post.hero` | full-banner, split, minimal, video-bg | height, overlay, showCTA |
| **Breadcrumbs** | Route hierarchy | (toggle only) | — |
| **Table of Contents** | `post.topics[].title` | sidebar, inline, floating | sticky |
| **Topics** | `post.topics[]` | grid, stacked, accordion, cards, timeline, zigzag, masonry, alternating, featured-first, tabbed | columns, showImages, showSubtitles, showVideos, imagePosition, cardStyle, spacing, numbered |
| **Summary** | `post.summary` | callout, banner, inline | — |
| **Sources** | `post.sources` | list, expandable, footnotes | — |
| **Sidebar** | Composite (ToC, author, categories) | left, right | width (narrow/standard/wide) |
| **Related Content** | Query (same category/tag) | grid, list, carousel | count |
| **Content Width** | — | narrow, medium, wide, full | — |

### Section Rendering

Each section type has a corresponding React component set on the website:

```
ConvexPress-Website/apps/web/src/components/layout-sections/
  HeroSection/
    FullBannerHero.tsx
    SplitHero.tsx
    MinimalHero.tsx
    VideoBgHero.tsx
  TopicsSection/
    TopicsGrid.tsx          // N-column grid with optional images
    TopicsStacked.tsx       // Full-width sections, one after another
    TopicsAccordion.tsx     // Collapsible panels
    TopicsCards.tsx         // Elevated card style with shadows
    TopicsTimeline.tsx      // Vertical timeline with connectors
    TopicsZigzag.tsx        // Alternating image-left / image-right rows
    TopicsMasonry.tsx       // Pinterest-style varied-height grid
    TopicsAlternating.tsx   // Alternating background colors per topic
    TopicsFeaturedFirst.tsx // First topic large/hero, rest in grid below
    TopicsTabbed.tsx        // Tabbed interface, one topic visible at a time
  SummarySection/
    SummaryCallout.tsx
    SummaryBanner.tsx
    SummaryInline.tsx
  SourcesSection/
    SourcesList.tsx
    SourcesExpandable.tsx
    SourcesFootnotes.tsx
  TocSection/
    TocSidebar.tsx
    TocInline.tsx
    TocFloating.tsx
  RelatedSection/
    RelatedGrid.tsx
    RelatedList.tsx
    RelatedCarousel.tsx
  SidebarSection/
    LayoutSidebar.tsx
  BreadcrumbSection/
    Breadcrumbs.tsx
```

A `LayoutRenderer` component reads the layout config and renders sections in order:

```typescript
function LayoutRenderer({ layout, post }: { layout: LayoutConfig; post: PostData }) {
  return (
    <div style={{ maxWidth: WIDTH_MAP[layout.config.contentWidth] }}>
      {layout.config.sections
        .filter(s => s.enabled)
        .map(section => (
          <SectionRenderer
            key={section.type}
            section={section}
            post={post}
          />
        ))}
    </div>
  );
}
```

`SectionRenderer` dispatches to the correct component based on `section.type` + `section.variant`.

### Topics Section — Deep Configuration

Topics are the primary content sections and get the richest set of options:

**10 Variants:**
- **Grid** — N-column grid (1-4 cols). Each topic is a card with optional image, title, subtitle, content.
- **Stacked** — Full-width sections, one below the other. Clean reading flow.
- **Accordion** — Collapsible panels. Title always visible, content expands on click.
- **Cards** — Elevated card style with shadows and hover effects. More visual than grid.
- **Timeline** — Vertical timeline with connector line and dots. Good for step-by-step content.
- **Zigzag** — Alternating image-left / image-right rows. Immersive visual storytelling.
- **Masonry** — Pinterest-style varied-height grid. Dynamic, visual layout.
- **Alternating** — Alternating background shading per topic for visual rhythm.
- **Featured First** — First topic rendered large (hero-style), remaining topics in a grid below.
- **Tabbed** — Tab bar at top, one topic visible at a time. Compact, good for many topics.

**Options per variant:**
| Option | Values | Applies To |
|--------|--------|-----------|
| columns | 1, 2, 3, 4 | grid, cards, masonry |
| showImages | boolean | all |
| showSubtitles | boolean | all |
| showVideos | boolean | all (renders inline video player if topic has videoUrl) |
| imagePosition | top, left, right, background | grid, cards, stacked |
| cardStyle | flat, elevated, bordered, glass | cards |
| spacing | compact, normal, relaxed | all |
| numbered | boolean | stacked, accordion, timeline |

### Real-Time Preview

The composer preview is 100% client-side React state. Every toggle, variant pick, and option change updates the preview instantly — no server round-trips. The preview renders actual section components with sample data, not static images. This means what you see in the composer is exactly what will render on the website.

Implementation: the composer holds layout config in React state. On every change, the preview re-renders. The admin composer uses its own lightweight preview components (styled to approximate the website output) rather than importing from the website app — the two apps are separate monorepo packages and don't share React components. Sample post data (with hero, topics, summary, sources) is hardcoded in the composer for preview purposes.

Note: `v.any()` is used for section options in the schema because each section type has a different option shape. Validation of option shapes happens in mutation code, not the schema validator.

## Preset Layouts

Ship with 7 built-in presets (seeded on first deploy):

1. **Magazine** — Full hero banner, breadcrumbs, 2-col topic grid with images, right sidebar (ToC + author + categories), summary callout, sources list, related grid (3)
2. **Clean Blog** — Split hero, breadcrumbs, stacked topics (no images), no sidebar, summary inline, sources list
3. **Documentation** — No hero, breadcrumbs, left sidebar with ToC, stacked topics, sources expandable
4. **Landing Page** — Full hero (tall) with CTA, 3-col topic cards with images, summary banner, no sidebar, no sources, no related
5. **Sidebar Focus** — Minimal hero, left sidebar (wide) with ToC + related, 2-col topic grid, summary callout, sources
6. **Visual Story** — Full hero (tall), zigzag topics with images, summary banner, no sidebar, related carousel
7. **Compact** — No hero, breadcrumbs, accordion topics, inline summary, footnote sources, no sidebar

## Admin UI

### Three Views (as shown in mockup)

**1. Layout Library** (`/admin/layouts`)
- Card grid showing all saved layouts
- Each card: mini structural preview, name, description, type badge (Preset/Custom/AI)
- Filter chips: All, Presets, Custom, AI Generated
- "New Layout" button opens composer
- Click a layout card to edit in composer
- Presets are not deletable but can be duplicated

**2. Layout Composer** (`/admin/layouts/new` or `/admin/layouts/$layoutId`)
- Left panel: section list with toggles, variant pickers, and option controls
- Right panel: live preview with sample data
- Device toggle: Desktop / Tablet / Mobile preview widths
- "Start from Preset" button to load a preset as starting point
- Save bar: layout name, duplicate button, save button
- Duplicate creates a copy as "custom" type

**3. Layout Assignments** (`/admin/layouts/assign` or integrated into Settings > Layout)
- Dropdown per content type to select default layout
- Note explaining per-page overrides work from the editor
- Save button

### Per-Page Override in Editor

In the post/page editor sidebar, the existing PageAttributesMetabox (or a new LayoutMetabox) gets:
- Layout dropdown (defaults to "Use default for [content type]")
- "Hide Header" toggle
- "Hide Footer" toggle

## Topics: Remove the 5-Item Limit

The `topics` field is already a dynamic array in the schema. The limit of 5 is only enforced in mutation validation. Change: remove or raise the limit to allow unlimited topics. The layout system renders whatever is in the array.

## AI Layout Generation

AI creates layouts by producing a JSON config object matching the `config` schema shape. The flow:

1. User describes what they want ("a layout for recipe posts with big images")
2. AI generates a layout config JSON
3. Config is saved to the `layouts` table with `type: "ai"`
4. User can edit the result in the composer
5. User assigns it to content types or specific pages

No code generation needed. The section components already exist — AI just picks which ones to use and how to configure them.

## Website Integration

### Layout Resolution Hook

```typescript
// ConvexPress-Website/apps/web/src/hooks/useResolvedLayout.ts
function useResolvedLayout(post: PostData, contentType: string): LayoutConfig {
  // 1. Check post.layoutId (per-page override)
  // 2. Check settings.layout[contentType + "Layout"]
  // 3. Fall back to "magazine" preset
}
```

### Header/Footer Visibility

The `_marketing.tsx` layout route checks `post.hideHeader` and `post.hideFooter` to conditionally render the global header/footer.

### Replacing the Old Template System

The existing `PageRenderer` + hardcoded template components (`DefaultTemplate`, `FullWidthTemplate`, etc.) are replaced by `LayoutRenderer`. Migration:
- Old `pageTemplate` values ("default", "full-width", etc.) map to preset layout IDs
- PageRenderer becomes a thin wrapper that resolves layout and delegates to LayoutRenderer
- Old template components are removed after migration

## Scope Boundaries

**In scope:**
- `layouts` table + CRUD mutations/queries
- Layout settings section for assignments
- Layout composer admin UI (library, composer, assign views)
- Section renderer components on the website
- 7 preset layouts seeded on deploy
- Per-page layout override + hide header/footer
- Remove topics 5-item limit
- LayoutRenderer replacing old template system

**Out of scope (future):**
- Visual drag-and-drop reordering of sections (v2 — start with fixed order per preset, editable in composer)
- Layout versioning / history
- Layout sharing / export-import between sites
- AI generation UI (AI generates via API; admin UI for prompting AI comes later)
- Archive/listing page layout sections (e.g., post card grid variants — these use a different data model than single post layouts; address separately)
- Header/footer variant selection (global shell customization is a separate feature)

## File Impact

### New Files
- `ConvexPress-Admin/packages/backend/convex/schema/layouts.ts` — Schema
- `ConvexPress-Admin/packages/backend/convex/layouts/` — mutations, queries, validators, seed data
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/layouts/` — Admin routes (library, composer, assign)
- `ConvexPress-Admin/apps/web/src/components/layouts/` — Admin UI components (LayoutCard, LayoutComposer, SectionControl, etc.)
- `ConvexPress-Website/apps/web/src/components/layout-sections/` — Section renderer components
- `ConvexPress-Website/apps/web/src/components/LayoutRenderer.tsx` — Main layout renderer
- `ConvexPress-Website/apps/web/src/hooks/useResolvedLayout.ts` — Layout resolution hook

### Modified Files
- `ConvexPress-Admin/packages/backend/convex/schema.ts` — Import + spread layoutTables
- `ConvexPress-Admin/packages/backend/convex/schema/posts.ts` — Add layoutId, hideHeader, hideFooter fields
- `ConvexPress-Admin/packages/backend/convex/schema/settings.ts` — Add "layout" section
- `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts` — Add LAYOUT_DEFAULTS
- `ConvexPress-Admin/packages/backend/convex/posts/mutations.ts` — Remove topics 5-item limit, handle layoutId
- `ConvexPress-Website/apps/web/src/routes/_marketing.tsx` — Conditional header/footer based on hideHeader/hideFooter
- `ConvexPress-Website/apps/web/src/routes/_marketing/blog/$slug.tsx` — Use LayoutRenderer
- `ConvexPress-Website/apps/web/src/routes/_marketing/page/$.tsx` — Use LayoutRenderer
- `ConvexPress-Website/apps/web/src/components/pages/PageRenderer.tsx` — Delegate to LayoutRenderer
