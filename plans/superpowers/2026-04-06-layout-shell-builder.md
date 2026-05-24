# Layout System & Shell Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Layout System (library, composer, assignments) and Shell Builder (header + footer composers) admin UI with Convex backend.

**Architecture:** Layouts stored in a `layouts` table as JSON configs. Header/footer configs stored in the `settings` table as "header"/"footer" sections. Admin UI uses the same composer pattern for all three: left panel with section controls + right panel with real-time preview.

**Tech Stack:** Convex (backend), TanStack Router (routing), TanStack Form (forms), React (UI), Tailwind CSS v4 (styling), Lucide React (icons), Base UI components

**Specs:**
- `specs/superpowers/2026-04-06-layout-system-design.md`
- `specs/superpowers/2026-04-06-shell-builder-design.md`

---

## File Structure

### New Backend Files
| File | Responsibility |
|------|---------------|
| `ConvexPress-Admin/packages/backend/convex/schema/layouts.ts` | Layout table schema |
| `ConvexPress-Admin/packages/backend/convex/layouts/mutations.ts` | Layout CRUD mutations |
| `ConvexPress-Admin/packages/backend/convex/layouts/queries.ts` | Layout queries (list, get, getBySlug) |
| `ConvexPress-Admin/packages/backend/convex/layouts/validators.ts` | Convex arg validators |
| `ConvexPress-Admin/packages/backend/convex/layouts/presets.ts` | 7 preset layout configs |
| `ConvexPress-Admin/packages/backend/convex/layouts/internals.ts` | Internal seed function |

### New Admin UI Files
| File | Responsibility |
|------|---------------|
| `apps/web/src/routes/_authenticated/_admin/layouts/index.tsx` | Layout library page |
| `apps/web/src/routes/_authenticated/_admin/layouts/new.tsx` | New layout composer |
| `apps/web/src/routes/_authenticated/_admin/layouts/$layoutId.tsx` | Edit layout composer |
| `apps/web/src/routes/_authenticated/_admin/layouts/assign.tsx` | Layout assignments |
| `apps/web/src/routes/_authenticated/_admin/appearance/header.tsx` | Header builder |
| `apps/web/src/routes/_authenticated/_admin/appearance/footer.tsx` | Footer builder |
| `apps/web/src/components/layouts/LayoutCard.tsx` | Layout preview card for library |
| `apps/web/src/components/layouts/LayoutComposer.tsx` | Layout composer (sections + preview) |
| `apps/web/src/components/layouts/LayoutPreview.tsx` | Real-time layout preview |
| `apps/web/src/components/layouts/SectionControl.tsx` | Reusable section toggle/options panel |
| `apps/web/src/components/layouts/VariantPicker.tsx` | Grid of variant options |
| `apps/web/src/components/layouts/presets.ts` | Client-side preset configs |
| `apps/web/src/components/layouts/types.ts` | TypeScript types for layout configs |
| `apps/web/src/components/layouts/constants.ts` | Section definitions, variant metadata |
| `apps/web/src/components/appearance/HeaderComposer.tsx` | Header composer (sections + preview) |
| `apps/web/src/components/appearance/HeaderPreview.tsx` | Real-time header preview |
| `apps/web/src/components/appearance/FooterComposer.tsx` | Footer composer (sections + preview) |
| `apps/web/src/components/appearance/FooterPreview.tsx` | Real-time footer preview |
| `apps/web/src/components/appearance/types.ts` | Header/footer config types |
| `apps/web/src/components/appearance/constants.ts` | Header/footer section definitions |

### Modified Files
| File | Change |
|------|--------|
| `packages/backend/convex/schema.ts` | Import + spread layoutTables |
| `packages/backend/convex/schema/settings.ts` | Add "layout", "header", "footer" sections |
| `packages/backend/convex/settings/defaults.ts` | Add LAYOUT_DEFAULTS, HEADER_DEFAULTS, FOOTER_DEFAULTS |
| `packages/backend/convex/settings/validators.ts` | Add layout/header/footer validators + sectionValidator entries |
| `packages/backend/convex/settings/validation.ts` | Add layout/header/footer validation functions |
| `packages/backend/convex/settings/mutations.ts` | Add to SECTION_CAPABILITY_MAP |
| `apps/web/src/lib/admin-shell/nav-config.ts` | Add Layout + Header + Footer nav items to Appearance section |

---

## Tasks

### Task 1: Backend — Layouts Schema

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/schema/layouts.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/schema.ts`

- [ ] **Step 1: Create layouts schema file**

Create `ConvexPress-Admin/packages/backend/convex/schema/layouts.ts`:
```typescript
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const layoutTables = {
  layouts: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    type: v.union(
      v.literal("preset"),
      v.literal("custom"),
      v.literal("ai"),
    ),
    config: v.object({
      contentWidth: v.union(
        v.literal("narrow"),
        v.literal("medium"),
        v.literal("wide"),
        v.literal("full"),
      ),
      sections: v.array(
        v.object({
          type: v.string(),
          enabled: v.boolean(),
          variant: v.optional(v.string()),
          options: v.optional(v.any()),
        }),
      ),
    }),
    isDefault: v.optional(v.boolean()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_type", ["type"])
    .index("by_name", ["name"]),
};
```

- [ ] **Step 2: Add layoutTables to main schema**

In `ConvexPress-Admin/packages/backend/convex/schema.ts`, add import and spread:
```typescript
import { layoutTables } from "./schema/layouts";
// Add to defineSchema:
...layoutTables,
```

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/schema/layouts.ts ConvexPress-Admin/packages/backend/convex/schema.ts
git commit -m "feat(layouts): add layouts table schema"
```

---

### Task 2: Backend — Layout CRUD Functions

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/layouts/validators.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/layouts/queries.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/layouts/mutations.ts`

- [ ] **Step 1: Create validators**

Create `ConvexPress-Admin/packages/backend/convex/layouts/validators.ts`:
```typescript
import { v } from "convex/values";

export const layoutConfigValidator = v.object({
  contentWidth: v.union(
    v.literal("narrow"),
    v.literal("medium"),
    v.literal("wide"),
    v.literal("full"),
  ),
  sections: v.array(
    v.object({
      type: v.string(),
      enabled: v.boolean(),
      variant: v.optional(v.string()),
      options: v.optional(v.any()),
    }),
  ),
});

export const createLayoutArgs = {
  name: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  type: v.union(v.literal("preset"), v.literal("custom"), v.literal("ai")),
  config: layoutConfigValidator,
  isDefault: v.optional(v.boolean()),
};

export const updateLayoutArgs = {
  id: v.id("layouts"),
  name: v.optional(v.string()),
  slug: v.optional(v.string()),
  description: v.optional(v.string()),
  config: v.optional(layoutConfigValidator),
};
```

- [ ] **Step 2: Create queries**

Create `ConvexPress-Admin/packages/backend/convex/layouts/queries.ts`:
```typescript
import { query } from "../_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("layouts").order("asc").collect();
  },
});

export const get = query({
  args: { id: v.id("layouts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("layouts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});
```

- [ ] **Step 3: Create mutations**

Create `ConvexPress-Admin/packages/backend/convex/layouts/mutations.ts`:
```typescript
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { createLayoutArgs, updateLayoutArgs } from "./validators";

export const create = mutation({
  args: createLayoutArgs,
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("layouts", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: updateLayoutArgs,
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Layout not found");
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

export const duplicate = mutation({
  args: { id: v.id("layouts") },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.id);
    if (!source) throw new Error("Layout not found");
    const now = Date.now();
    return await ctx.db.insert("layouts", {
      name: `${source.name} (Copy)`,
      slug: `${source.slug}-copy-${now}`,
      description: source.description,
      type: "custom",
      config: source.config,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("layouts") },
  handler: async (ctx, args) => {
    const layout = await ctx.db.get(args.id);
    if (!layout) throw new Error("Layout not found");
    if (layout.type === "preset") throw new Error("Cannot delete preset layouts");
    await ctx.db.delete(args.id);
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/layouts/
git commit -m "feat(layouts): add layout CRUD queries and mutations"
```

---

### Task 3: Backend — Preset Layout Seed Data

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/layouts/presets.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/layouts/internals.ts`

- [ ] **Step 1: Create preset layout configs**

Create `ConvexPress-Admin/packages/backend/convex/layouts/presets.ts` with all 7 preset layout configs. Each is a complete layout config object matching the schema.

- [ ] **Step 2: Create seed internal function**

Create `ConvexPress-Admin/packages/backend/convex/layouts/internals.ts`:
```typescript
import { internalMutation } from "../_generated/server";
import { PRESET_LAYOUTS } from "./presets";

export const seedPresets = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("layouts").withIndex("by_type", (q) => q.eq("type", "preset")).collect();
    if (existing.length > 0) return;
    const now = Date.now();
    for (const preset of PRESET_LAYOUTS) {
      await ctx.db.insert("layouts", { ...preset, createdAt: now, updatedAt: now });
    }
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/layouts/presets.ts ConvexPress-Admin/packages/backend/convex/layouts/internals.ts
git commit -m "feat(layouts): add 7 preset layout configs and seed function"
```

---

### Task 4: Backend — Settings Sections (layout, header, footer)

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/settings.ts` — Add 3 literals
- Modify: `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts` — Add types, defaults, DEFAULTS_MAP entries
- Modify: `ConvexPress-Admin/packages/backend/convex/settings/validators.ts` — Add 3 literals + value validators
- Modify: `ConvexPress-Admin/packages/backend/convex/settings/validation.ts` — Add 3 validation functions + switch cases
- Modify: `ConvexPress-Admin/packages/backend/convex/settings/mutations.ts` — Add to SECTION_CAPABILITY_MAP

- [ ] **Step 1: Add sections to settings schema**

In `schema/settings.ts`, add to the section union:
```typescript
v.literal("layout"),
v.literal("header"),
v.literal("footer"),
```

- [ ] **Step 2: Add types and defaults to defaults.ts**

Add interfaces: `LayoutAssignmentSettings`, `HeaderSettings`, `FooterSettings`.
Add constants: `LAYOUT_ASSIGNMENT_DEFAULTS`, `HEADER_DEFAULTS`, `FOOTER_DEFAULTS`.
Add entries to `SECTION_NAMES` array and `DEFAULTS_MAP`.

Header defaults per spec:
```typescript
export const HEADER_DEFAULTS: HeaderSettings = {
  layout: { style: "standard", sticky: "always", background: "solid", height: "normal", bottomBorder: "subtle" },
  topBar: { enabled: false, leftContent: "contact", rightContent: "social", email: "", phone: "", announcementText: "" },
  logo: { enabled: true, showImage: true, showTitle: true, showTagline: false, size: "medium" },
  navigation: { enabled: true, menuSource: "primary", style: "inline", dropdownStyle: "flyout" },
  search: { enabled: true, variant: "inline", placeholder: "Search..." },
  cta: { enabled: false, label: "Get Started", url: "/register", style: "filled" },
  userMenu: { enabled: true, guestDisplay: "login-register", loggedInDisplay: "avatar-dropdown", dropdownPreset: "dashboard-profile-logout" },
  darkModeToggle: { enabled: true, variant: "icon" },
  mobileMenu: { variant: "drawer", drawerSide: "right" },
};
```

Footer defaults per spec:
```typescript
export const FOOTER_DEFAULTS: FooterSettings = {
  layout: { columns: "4", background: "dark", backgroundImageId: null, topBorder: "subtle", padding: "normal" },
  branding: { enabled: true, showLogo: true, showDescription: true, description: "", showSocial: true },
  navColumns: { enabled: true, columns: [{ heading: "Company", menuSource: "footer-1" }, { heading: "Resources", menuSource: "footer-2" }] },
  newsletter: { enabled: true, heading: "Stay Updated", subtext: "Get the latest posts delivered to your inbox.", buttonText: "Subscribe" },
  contactInfo: { enabled: false, address: "", phone: "", email: "" },
  bottomBar: { enabled: true, copyrightText: "", legalLinks: "privacy-terms", poweredBy: true },
};
```

Layout assignment defaults:
```typescript
export const LAYOUT_ASSIGNMENT_DEFAULTS: LayoutAssignmentSettings = {
  blogPostLayout: "",
  pageLayout: "",
  blogIndexLayout: "",
  categoryArchiveLayout: "",
  tagArchiveLayout: "",
  authorArchiveLayout: "",
  searchResultsLayout: "",
  kbArticleLayout: "",
};
```

- [ ] **Step 3: Add validators**

In `validators.ts`, add `v.literal("layout")`, `v.literal("header")`, `v.literal("footer")` to `sectionValidator`. Add `layoutAssignmentValuesValidator`, `headerValuesValidator`, `footerValuesValidator`.

- [ ] **Step 4: Add validation functions**

In `validation.ts`, add `validateLayoutAssignment`, `validateHeader`, `validateFooter` functions and cases to `validateSectionValues`.

- [ ] **Step 5: Add capability mappings**

In `mutations.ts`, add to `SECTION_CAPABILITY_MAP`:
```typescript
layout: "manage_options",
header: "manage_options",
footer: "manage_options",
```

- [ ] **Step 6: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/schema/settings.ts ConvexPress-Admin/packages/backend/convex/settings/
git commit -m "feat(settings): add layout, header, and footer settings sections"
```

---

### Task 5: Admin UI — Navigation Updates

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/lib/admin-shell/nav-config.ts`

- [ ] **Step 1: Add nav items to Appearance section**

In `nav-config.ts`, find the `appearance` section and add children for Layouts, Header, Footer:
```typescript
{
  id: "appearance-layouts",
  label: "Layouts",
  to: "/layouts",
},
{
  id: "appearance-header",
  label: "Header",
  to: "/appearance/header",
},
{
  id: "appearance-footer",
  label: "Footer",
  to: "/appearance/footer",
},
```

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/lib/admin-shell/nav-config.ts
git commit -m "feat(nav): add Layouts, Header, Footer to Appearance sidebar section"
```

---

### Task 6: Admin UI — Layout Types & Constants

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/components/layouts/types.ts`
- Create: `ConvexPress-Admin/apps/web/src/components/layouts/constants.ts`
- Create: `ConvexPress-Admin/apps/web/src/components/layouts/presets.ts`

- [ ] **Step 1: Create types**

Define `LayoutConfig`, `SectionConfig`, `SectionDefinition`, `VariantDefinition`, `OptionDefinition` types.

- [ ] **Step 2: Create constants**

Define `SECTION_DEFINITIONS` — metadata for each section type (hero, breadcrumbs, toc, topics, summary, sources, sidebar, related, contentWidth) including their available variants and options.

- [ ] **Step 3: Create client-side presets**

Mirror the 7 presets from the backend for the "Start from Preset" feature.

- [ ] **Step 4: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/components/layouts/
git commit -m "feat(layouts): add layout types, section definitions, and preset configs"
```

---

### Task 7: Admin UI — Shared Composer Components

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/components/layouts/SectionControl.tsx`
- Create: `ConvexPress-Admin/apps/web/src/components/layouts/VariantPicker.tsx`

- [ ] **Step 1: Create SectionControl**

Reusable component: toggle switch + section name + chevron + expandable body. Used by both the layout composer and the shell builders.

- [ ] **Step 2: Create VariantPicker**

Grid of variant option buttons with selected state. Used for picking hero style, topic style, etc.

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/components/layouts/SectionControl.tsx ConvexPress-Admin/apps/web/src/components/layouts/VariantPicker.tsx
git commit -m "feat(layouts): add SectionControl and VariantPicker components"
```

---

### Task 8: Admin UI — Layout Library Page

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/components/layouts/LayoutCard.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/layouts/index.tsx`

- [ ] **Step 1: Create LayoutCard**

Card component showing: mini structural preview (CSS boxes), name, description, type badge (Preset/Custom/AI), click to edit.

- [ ] **Step 2: Create layout library route**

Route at `/layouts` showing: header with title + "New Layout" button, filter chips (All/Presets/Custom/AI), grid of LayoutCards. Uses `useQuery(api.layouts.queries.list)`.

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/components/layouts/LayoutCard.tsx ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/layouts/index.tsx
git commit -m "feat(layouts): add layout library page with cards and filters"
```

---

### Task 9: Admin UI — Layout Preview Component

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/components/layouts/LayoutPreview.tsx`

- [ ] **Step 1: Create LayoutPreview**

Right-panel preview component. Receives layout config as prop, renders a mock layout using styled divs that approximate section appearances. Includes:
- Preview toolbar with device toggle (Desktop/Tablet/Mobile)
- Hero preview (different for each variant)
- Breadcrumb preview
- Topics preview (grid, stacked, accordion, cards, etc.)
- Summary preview (callout, banner, inline)
- Sources preview
- Sidebar preview (left or right positioning)
- Related content preview
- Responds to config changes in real-time (pure React re-render)

Sample post data hardcoded in the component for preview.

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/components/layouts/LayoutPreview.tsx
git commit -m "feat(layouts): add real-time layout preview component"
```

---

### Task 10: Admin UI — Layout Composer Page

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/components/layouts/LayoutComposer.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/layouts/new.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/layouts/$layoutId.tsx`

- [ ] **Step 1: Create LayoutComposer component**

Two-column composer: left sidebar with SectionControls for each section type (using SECTION_DEFINITIONS), right panel with LayoutPreview. Manages layout config in React state. Save bar at bottom with name input + duplicate button + save button.

- [ ] **Step 2: Create new layout route**

Route at `/layouts/new`. Renders LayoutComposer with empty/default config. Save calls `useMutation(api.layouts.mutations.create)`.

- [ ] **Step 3: Create edit layout route**

Route at `/layouts/$layoutId`. Fetches layout with `useQuery(api.layouts.queries.get)`. Renders LayoutComposer with existing config. Save calls `useMutation(api.layouts.mutations.update)`.

- [ ] **Step 4: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/components/layouts/LayoutComposer.tsx ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/layouts/
git commit -m "feat(layouts): add layout composer with real-time preview"
```

---

### Task 11: Admin UI — Layout Assignment Page

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/layouts/assign.tsx`

- [ ] **Step 1: Create assignment page**

Route at `/layouts/assign`. Card grid with one card per content type (Blog Posts, Pages, Blog Index, Category/Tag/Author Archives, Search Results, KB Articles). Each card has a select dropdown populated from `useQuery(api.layouts.queries.list)`. Uses `useSettingsForm("layout")` or direct query/mutation against the settings "layout" section.

- [ ] **Step 2: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/layouts/assign.tsx
git commit -m "feat(layouts): add layout assignment page"
```

---

### Task 12: Admin UI — Header Builder Types & Constants

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/components/appearance/types.ts`
- Create: `ConvexPress-Admin/apps/web/src/components/appearance/constants.ts`

- [ ] **Step 1: Create types**

Define `HeaderConfig`, `FooterConfig` types matching the spec. Define `HeaderSectionDefinition`, `FooterSectionDefinition` for the composer.

- [ ] **Step 2: Create constants**

Define `HEADER_SECTION_DEFINITIONS` (layout, topBar, logo, navigation, search, cta, userMenu, darkModeToggle, mobileMenu) and `FOOTER_SECTION_DEFINITIONS` (layout, branding, navColumns, newsletter, contactInfo, bottomBar) with their variants and options.

- [ ] **Step 3: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/components/appearance/types.ts ConvexPress-Admin/apps/web/src/components/appearance/constants.ts
git commit -m "feat(appearance): add header and footer types and section definitions"
```

---

### Task 13: Admin UI — Header Builder Page

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/components/appearance/HeaderPreview.tsx`
- Create: `ConvexPress-Admin/apps/web/src/components/appearance/HeaderComposer.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/appearance/header.tsx`

- [ ] **Step 1: Create HeaderPreview**

Real-time preview showing: top bar (if enabled), main header with layout variant (standard/centered/split), logo, nav items, search, CTA, user menu, dark mode toggle. Uses same sample data approach as LayoutPreview.

- [ ] **Step 2: Create HeaderComposer**

Two-column composer. Left: SectionControls for each header section. Right: HeaderPreview. Fetches current config from `useQuery(api.settings.queries.getBySection, { section: "header" })`. Saves via `useMutation(api.settings.mutations.updateSection)`. Config held in React state for real-time preview.

- [ ] **Step 3: Create header route**

Thin route wrapper at `/appearance/header` that renders HeaderComposer.

- [ ] **Step 4: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/components/appearance/Header* ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/appearance/header.tsx
git commit -m "feat(appearance): add header builder with real-time preview"
```

---

### Task 14: Admin UI — Footer Builder Page

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/components/appearance/FooterPreview.tsx`
- Create: `ConvexPress-Admin/apps/web/src/components/appearance/FooterComposer.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/appearance/footer.tsx`

- [ ] **Step 1: Create FooterPreview**

Real-time preview showing: main footer with column layout variant, branding column, nav columns, newsletter, contact info, bottom bar with copyright/legal/powered-by.

- [ ] **Step 2: Create FooterComposer**

Two-column composer. Same pattern as HeaderComposer but with footer sections. Fetches from "footer" settings section.

- [ ] **Step 3: Create footer route**

Thin route wrapper at `/appearance/footer` that renders FooterComposer.

- [ ] **Step 4: Commit**

```bash
git add ConvexPress-Admin/apps/web/src/components/appearance/Footer* ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/appearance/footer.tsx
git commit -m "feat(appearance): add footer builder with real-time preview"
```

---

### Task 15: Deploy & Verify

- [ ] **Step 1: Deploy to Convex**

```bash
cd ConvexPress-Admin && npx convex deploy --typecheck=disable
```

- [ ] **Step 2: Seed preset layouts**

Run the seed function via Convex dashboard or CLI.

- [ ] **Step 3: Verify all routes load**

Navigate to each route and verify:
- `/layouts` — Library page loads, shows preset cards
- `/layouts/new` — Composer opens with default config
- `/layouts/assign` — Assignment page shows dropdowns
- `/appearance/header` — Header builder loads with defaults
- `/appearance/footer` — Footer builder loads with defaults

- [ ] **Step 4: Verify CRUD operations**

Test: create a layout, edit it, duplicate it, delete it. Verify settings save for header/footer.

- [ ] **Step 5: Commit any fixes**
