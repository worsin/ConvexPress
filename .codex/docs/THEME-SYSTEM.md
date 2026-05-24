# Theme System - Expert Knowledge Document

**System:** Theme System
**Status:** Complete (100%)
**Priority:** P3 - Low
**Complexity:** Complex
**Layer:** Frontend
**Category:** Content & Marketing
**WordPress Equivalent:** Theme & Customizer Infrastructure (themes.php, customize.php, site-editor.php, theme.json)
**Last Analyzed:** 2026-02-13

---

## Quick Reference

### What This System Does

The Theme System is SmithHarper's equivalent of WordPress's Theme and Customizer infrastructure. It governs visual presentation, layout configuration, template selection, global styles (colors, typography, spacing), and template parts -- everything that controls how the website looks to visitors without changing content. Unlike WordPress's filesystem-based PHP themes, SmithHarper themes are entirely database-driven Convex documents containing JSON configuration analogous to `theme.json`, with template assignments stored per-content-type and global style tokens compiled to CSS custom properties.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Theme** | A named Convex document containing global styles, customizer overrides, template assignments, and feature support flags |
| **Global Styles** | Color palette, typography, spacing, and layout settings (equivalent to WordPress `theme.json`) |
| **Customizer** | User-level overrides: site identity, header/footer config, sidebar, background image, custom CSS |
| **Template** | A React component registered by slug, mapped to content contexts (single, page, archive, etc.) |
| **Template Part** | A reusable layout section (header, footer, sidebar) -- a React component assigned to an area |
| **Block Pattern** | Pre-built content layout stored as serialized block tree, insertable via the Content Editor |
| **Template Hierarchy** | The lookup chain for resolving which template to use: content override -> context assignment -> index fallback |
| **CSS Custom Properties** | The bridge between theme config and Tailwind CSS v4 -- theme values compile to `--sh-*` CSS properties |
| **Component Registry** | Static import maps that map `componentKey` strings to React components for templates and template parts |
| **Three-Layer Merge** | Style resolution: SmithHarper defaults < theme globalStyles < customizer overrides |

### SmithHarper vs WordPress

| Aspect | WordPress | SmithHarper |
|--------|-----------|-------------|
| Theme storage | Filesystem (PHP files in `wp-content/themes/`) | Convex database documents |
| Template language | PHP files discovered by filename convention | React components registered in a static registry |
| Style config | `theme.json` + Customizer `wp_options` | `globalStyles` + `customizer` fields in `themes` table |
| Template hierarchy | 5-10+ filename lookups per request | Max 3 levels: content override, context assignment, index fallback |
| Global styles output | Inline styles + enqueued stylesheets | CSS custom properties injected in `<head>` via `:root` |
| Real-time preview | Customizer iframe with full page reloads | Convex reactive subscriptions for instant updates |
| Child themes | Required for overriding parent theme | Not needed -- themes are mutable database records |
| Security | PHP execution risk in themes | No code execution -- templates are pre-built React components |
| Installation | ZIP upload or directory creation | Create via admin UI or JSON import |

---

## Architecture Overview

### Data Flow

```
Admin Appearance Pages (TanStack Router)
  -> Customizer form / Editor
    -> Convex mutation: themes.updateCustomizer / themes.updateGlobalStyles
      -> Validate values against typed schema
      -> Write to `themes` table
      -> Emit event: theme.customizer_updated / theme.styles_updated
        -> Audit log entry
        -> Site notification to admins
      -> Regenerate CSS custom properties string
  -> All subscribed clients receive updated theme via Convex reactive query

Website (TanStack Start SSR)
  -> Root layout: useQuery(api.themes.getActive)
    -> Inject CSS custom properties into <style> tag in <head>
    -> Resolve template for current route using template hierarchy
    -> Render template parts (header, footer, sidebar)
    -> Apply layout class (content width, sidebar position)
```

### Theme Resolution Pipeline

```
Request URL (/blog/my-post)
  |
  v
Routing System resolves to: { type: "post", slug: "my-post" }
  |
  v
Theme System: resolveTemplate("post", "my-post", postData)
  1. Check post-level template override (post.templateSlug)
  2. Check theme template assignment for this context (e.g., "single")
  3. Fall back to "index" (universal fallback)
  |
  v
Template found: { slug: "single-post", component: "SinglePostTemplate" }
  |
  v
Render: <SinglePostTemplate> with theme's template parts + global styles
```

### Real-Time Behavior

- **Convex reactive queries** power the entire theme system. When an admin changes a color in the Global Styles editor, every connected client (including the website preview) receives the update automatically.
- `useQuery(api.themes.getActive)` in the website root layout subscribes to theme changes.
- `useQuery(api.themes.getGlobalStyles)` provides compiled CSS custom properties reactively.
- The Customizer preview communicates via Convex subscriptions (not `postMessage`) for style changes. Draft values can be previewed locally before saving via `postMessage` to an iframe.
- Template assignment changes take effect immediately on the next page navigation.

### Authentication & Authorization

All `/admin/appearance/*` routes require authentication via WorkOS and the `edit_theme_options` capability (Administrator role only). The route guard:

```typescript
export const Route = createFileRoute("/admin/appearance")({
  beforeLoad: async ({ context }) => {
    if (!context.auth.hasCapability("edit_theme_options")) {
      throw redirect({ to: "/admin" });
    }
  },
});
```

Three capabilities govern theme operations:
- `switch_themes` -- Activate a different theme (Administrator)
- `manage_themes` -- Create, delete, import, export themes (Administrator)
- `edit_theme_options` -- Edit global styles, customizer, templates, template parts, patterns (Administrator)

---

## Database Schema

### `themes` Table

The primary table storing theme configurations.

```typescript
themes: defineTable({
  // Identity
  name: v.string(),                    // Human-readable name (e.g., "Starter Theme")
  slug: v.string(),                    // URL-safe unique identifier (e.g., "starter-theme")
  description: v.optional(v.string()), // Short description of the theme
  version: v.string(),                 // Semantic version (e.g., "1.0.0")
  author: v.optional(v.string()),      // Theme author name
  screenshot: v.optional(v.id("_storage")), // Preview screenshot (Convex file storage)

  // Status
  isActive: v.boolean(),              // Only one theme can be active at a time
  isDefault: v.boolean(),             // The built-in default theme (cannot be deleted)

  // Theme Support Features (WordPress add_theme_support equivalent)
  supports: v.object({
    customLogo: v.boolean(),           // add_theme_support('custom-logo')
    customHeader: v.boolean(),         // add_theme_support('custom-header')
    customBackground: v.boolean(),     // add_theme_support('custom-background')
    postThumbnails: v.boolean(),       // add_theme_support('post-thumbnails')
    postFormats: v.optional(v.array(v.string())), // add_theme_support('post-formats', [...])
    titleTag: v.boolean(),             // add_theme_support('title-tag')
    html5: v.boolean(),                // add_theme_support('html5')
    responsiveEmbeds: v.boolean(),     // add_theme_support('responsive-embeds')
    editorStyles: v.boolean(),         // add_theme_support('editor-styles')
    alignWide: v.boolean(),            // add_theme_support('align-wide')
    wpBlockStyles: v.boolean(),        // add_theme_support('wp-block-styles')
  }),

  // Global Styles (theme.json equivalent)
  globalStyles: v.object({
    settings: v.object({
      color: v.object({
        palette: v.array(v.object({
          slug: v.string(),            // e.g., "primary"
          name: v.string(),            // e.g., "Primary"
          color: v.string(),           // e.g., "#1e40af"
        })),
        gradients: v.optional(v.array(v.object({
          slug: v.string(),
          name: v.string(),
          gradient: v.string(),        // CSS gradient value
        }))),
        defaultPalette: v.boolean(),   // Whether to include WP default colors
        background: v.boolean(),       // Allow background color controls
        text: v.boolean(),             // Allow text color controls
        link: v.boolean(),             // Allow link color controls
      }),
      typography: v.object({
        fontFamilies: v.array(v.object({
          slug: v.string(),            // e.g., "heading"
          name: v.string(),            // e.g., "Heading Font"
          fontFamily: v.string(),      // e.g., "'Inter', sans-serif"
          provider: v.optional(v.string()), // "google", "local", "system"
          googleFontUrl: v.optional(v.string()), // Google Fonts import URL
        })),
        fontSizes: v.array(v.object({
          slug: v.string(),            // e.g., "small", "medium", "large"
          name: v.string(),            // e.g., "Small"
          size: v.string(),            // e.g., "0.875rem"
        })),
        customFontSize: v.boolean(),
        lineHeight: v.boolean(),
        fontWeight: v.boolean(),
        letterSpacing: v.boolean(),
        textTransform: v.boolean(),
      }),
      spacing: v.object({
        padding: v.boolean(),
        margin: v.boolean(),
        blockGap: v.optional(v.string()),  // Default gap between blocks (e.g., "1.5rem")
        units: v.array(v.string()),        // Allowed CSS units (e.g., ["px", "rem", "em", "%"])
        spacingSizes: v.optional(v.array(v.object({
          slug: v.string(),
          name: v.string(),
          size: v.string(),
        }))),
      }),
      layout: v.object({
        contentSize: v.string(),       // Max width for content (e.g., "720px")
        wideSize: v.string(),          // Max width for wide blocks (e.g., "1200px")
      }),
      border: v.optional(v.object({
        color: v.boolean(),
        radius: v.boolean(),
        style: v.boolean(),
        width: v.boolean(),
      })),
    }),
    styles: v.object({
      color: v.object({
        background: v.string(),        // Body background color
        text: v.string(),              // Body text color
      }),
      typography: v.object({
        fontFamily: v.string(),        // Body font family reference
        fontSize: v.string(),          // Body font size
        lineHeight: v.string(),        // Body line height
      }),
      spacing: v.optional(v.object({
        padding: v.optional(v.object({
          top: v.optional(v.string()),
          right: v.optional(v.string()),
          bottom: v.optional(v.string()),
          left: v.optional(v.string()),
        })),
      })),
      elements: v.optional(v.object({
        link: v.optional(v.object({
          color: v.optional(v.object({
            text: v.optional(v.string()),
          })),
          typography: v.optional(v.object({
            textDecoration: v.optional(v.string()),
          })),
        })),
        heading: v.optional(v.object({
          color: v.optional(v.object({
            text: v.optional(v.string()),
          })),
          typography: v.optional(v.object({
            fontFamily: v.optional(v.string()),
            fontWeight: v.optional(v.string()),
            lineHeight: v.optional(v.string()),
          })),
        })),
        button: v.optional(v.object({
          color: v.optional(v.object({
            background: v.optional(v.string()),
            text: v.optional(v.string()),
          })),
          border: v.optional(v.object({
            radius: v.optional(v.string()),
          })),
        })),
      })),
    }),
  }),

  // Customizer overrides (user-level overrides on top of globalStyles)
  customizer: v.object({
    siteIdentity: v.optional(v.object({
      logoId: v.optional(v.id("_storage")),
      logoWidth: v.optional(v.number()),
      siteIcon: v.optional(v.id("_storage")),
      displaySiteTitle: v.optional(v.boolean()),
      displayTagline: v.optional(v.boolean()),
    })),
    header: v.optional(v.object({
      templatePartSlug: v.optional(v.string()),
      sticky: v.optional(v.boolean()),
      transparent: v.optional(v.boolean()),
    })),
    footer: v.optional(v.object({
      templatePartSlug: v.optional(v.string()),
      copyrightText: v.optional(v.string()),
      showPoweredBy: v.optional(v.boolean()),
    })),
    sidebar: v.optional(v.object({
      position: v.optional(v.union(
        v.literal("left"),
        v.literal("right"),
        v.literal("none")
      )),
      width: v.optional(v.string()),
    })),
    backgroundImage: v.optional(v.object({
      imageId: v.optional(v.id("_storage")),
      position: v.optional(v.string()),
      size: v.optional(v.string()),
      repeat: v.optional(v.string()),
      attachment: v.optional(v.string()),
    })),
    customCss: v.optional(v.string()),
  }),

  // Template assignments: which template component to use for each content context
  templateAssignments: v.object({
    index: v.string(),              // Universal fallback template slug
    home: v.optional(v.string()),
    frontPage: v.optional(v.string()),
    single: v.optional(v.string()),
    page: v.optional(v.string()),
    archive: v.optional(v.string()),
    category: v.optional(v.string()),
    tag: v.optional(v.string()),
    author: v.optional(v.string()),
    search: v.optional(v.string()),
    notFound: v.optional(v.string()),
  }),

  // Metadata
  createdAt: v.number(),
  createdBy: v.id("users"),
  updatedAt: v.number(),
  updatedBy: v.id("users"),
})
  .index("by_slug", ["slug"])
  .index("by_active", ["isActive"])
  .index("by_created", ["createdAt"]),
```

### `themeTemplates` Table

Registered template definitions. Each template is a named React component that can be assigned to content types.

```typescript
themeTemplates: defineTable({
  themeId: v.id("themes"),           // Which theme this template belongs to
  slug: v.string(),                  // Unique slug (e.g., "single-post", "page-full-width")
  title: v.string(),                 // Human-readable name (e.g., "Full Width Page")
  description: v.optional(v.string()),
  type: v.union(                     // What content type(s) this template applies to
    v.literal("index"),
    v.literal("home"),
    v.literal("front-page"),
    v.literal("single"),
    v.literal("page"),
    v.literal("archive"),
    v.literal("search"),
    v.literal("404"),
    v.literal("custom"),             // Custom (assignable per-page)
  ),
  postTypes: v.optional(v.array(v.string())),
  componentKey: v.string(),          // Key into the component registry
  isCustom: v.boolean(),             // Whether this appears in Page Attributes dropdown
  order: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_theme", ["themeId"])
  .index("by_theme_slug", ["themeId", "slug"])
  .index("by_theme_type", ["themeId", "type"]),
```

### `themeTemplateParts` Table

Template parts are reusable layout sections (header, footer, sidebar).

```typescript
themeTemplateParts: defineTable({
  themeId: v.id("themes"),           // Which theme this part belongs to
  slug: v.string(),                  // Unique slug (e.g., "header-default", "footer-minimal")
  title: v.string(),                 // Human-readable name
  area: v.union(                     // Which template area this part fills
    v.literal("header"),
    v.literal("footer"),
    v.literal("sidebar"),
    v.literal("uncategorized"),
  ),
  componentKey: v.string(),          // Key into the component registry
  description: v.optional(v.string()),
  order: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_theme", ["themeId"])
  .index("by_theme_area", ["themeId", "area"])
  .index("by_theme_slug", ["themeId", "slug"]),
```

### `themeBlockPatterns` Table

Block patterns are pre-built content arrangements that users can insert.

```typescript
themeBlockPatterns: defineTable({
  themeId: v.id("themes"),           // Which theme this pattern belongs to
  slug: v.string(),                  // Unique slug (e.g., "hero-with-cta")
  title: v.string(),
  description: v.optional(v.string()),
  category: v.string(),             // e.g., "hero", "features", "testimonials", "cta"
  content: v.string(),               // Serialized block content (JSON block tree)
  viewportWidth: v.optional(v.number()),
  keywords: v.optional(v.array(v.string())),
  order: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_theme", ["themeId"])
  .index("by_theme_category", ["themeId", "category"])
  .index("by_theme_slug", ["themeId", "slug"]),
```

### Indexes

| Table | Index | Fields | Purpose |
|-------|-------|--------|---------|
| `themes` | `by_slug` | `["slug"]` | Lookup theme by URL-safe slug |
| `themes` | `by_active` | `["isActive"]` | Find the currently active theme (only one should be `true`) |
| `themes` | `by_created` | `["createdAt"]` | List themes in chronological order |
| `themeTemplates` | `by_theme` | `["themeId"]` | List all templates for a theme |
| `themeTemplates` | `by_theme_slug` | `["themeId", "slug"]` | Find a specific template by theme + slug |
| `themeTemplates` | `by_theme_type` | `["themeId", "type"]` | List templates by content type (e.g., all "custom" templates) |
| `themeTemplateParts` | `by_theme` | `["themeId"]` | List all template parts for a theme |
| `themeTemplateParts` | `by_theme_area` | `["themeId", "area"]` | List parts by area (header, footer, sidebar) |
| `themeTemplateParts` | `by_theme_slug` | `["themeId", "slug"]` | Find a specific template part |
| `themeBlockPatterns` | `by_theme` | `["themeId"]` | List all patterns for a theme |
| `themeBlockPatterns` | `by_theme_category` | `["themeId", "category"]` | List patterns by category |
| `themeBlockPatterns` | `by_theme_slug` | `["themeId", "slug"]` | Find a specific pattern |

### Relationships

```
themes (1) ---> (many) themeTemplates
themes (1) ---> (many) themeTemplateParts
themes (1) ---> (many) themeBlockPatterns

themes.isActive --> Only one row has isActive=true at any time
themes.globalStyles --> Compiles to CSS custom properties
themes.customizer --> User-level overrides layered on globalStyles
themes.templateAssignments --> Maps content types to themeTemplates.slug

posts.templateSlug --> Overrides theme's templateAssignments for that specific post/page
```

Cross-system relationships:
- `themes.createdBy` / `themes.updatedBy` -> `users._id`
- `themes.customizer.siteIdentity.logoId` / `siteIcon` -> `_storage._id`
- `themes.customizer.backgroundImage.imageId` -> `_storage._id`
- `themes.screenshot` -> `_storage._id`
- Settings System provides site title, tagline, homepage display mode consumed by theme rendering

---

## Actions & Functions

### Mutations

#### `theme.create` - Create Theme
- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `manage_themes`, `edit_theme_options`
- **Roles:** Administrator
- **Args:**
  ```typescript
  {
    name: v.string(),
    slug: v.optional(v.string()),       // Auto-generated from name if not provided
    description: v.optional(v.string()),
    basePreset: v.optional(v.string()), // Slug of existing theme to clone from
  }
  ```
- **Returns:** `Id<"themes">`
- **Behavior:**
  1. Validate user has `manage_themes` capability
  2. If `slug` not provided, generate from `name` (slugify)
  3. Check slug uniqueness in themes table
  4. If `basePreset` provided, clone globalStyles + supports + customizer from that theme
  5. If no `basePreset`, use SmithHarper default theme configuration
  6. Insert theme document with `isActive: false`
  7. Create default template and template part records for the new theme
  8. Emit `theme.created` event
- **Events:** `theme.created`
- **Errors:**
  - `UNAUTHORIZED` -- User lacks `manage_themes` capability
  - `SLUG_EXISTS` -- A theme with this slug already exists
  - `INVALID_PRESET` -- Referenced base preset theme not found

#### `theme.activate` - Activate Theme
- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `switch_themes`
- **Roles:** Administrator
- **Args:**
  ```typescript
  {
    themeId: v.id("themes"),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Validate user has `switch_themes` capability
  2. Verify target theme exists
  3. If already active, return (no-op)
  4. Deactivate currently active theme (`isActive: false`)
  5. Activate target theme (`isActive: true`, update `updatedAt`, `updatedBy`)
  6. Emit `theme.activated` event with old and new theme IDs
- **Events:** `theme.activated`
- **Errors:**
  - `UNAUTHORIZED` -- User lacks `switch_themes`
  - `NOT_FOUND` -- Theme does not exist

#### `theme.update_global_styles` - Update Theme Global Styles
- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `edit_theme_options`
- **Roles:** Administrator
- **Args:**
  ```typescript
  {
    themeId: v.id("themes"),
    globalStyles: {
      settings: { /* partial update -- only changed fields */ },
      styles: { /* partial update */ },
    },
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Validate user has `edit_theme_options` capability
  2. Deep-merge provided globalStyles with existing theme globalStyles
  3. Validate merged result (color formats, font families, CSS length values)
  4. Write updated globalStyles to theme document
  5. Emit `theme.styles_updated` event with changed section keys
- **Events:** `theme.styles_updated`
- **Errors:**
  - `UNAUTHORIZED` -- User lacks `edit_theme_options`
  - `NOT_FOUND` -- Theme does not exist
  - `VALIDATION_ERROR` -- Invalid color format, font family, size value, etc.

#### `theme.update_customizer` - Update Theme Customizer
- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `edit_theme_options`
- **Roles:** Administrator
- **Args:**
  ```typescript
  {
    themeId: v.id("themes"),
    customizer: {
      siteIdentity?: { /* partial */ },
      header?: { /* partial */ },
      footer?: { /* partial */ },
      sidebar?: { /* partial */ },
      backgroundImage?: { /* partial */ },
      customCss?: string,
    },
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Validate user has `edit_theme_options` capability
  2. Deep-merge provided customizer fields with existing
  3. Validate (customCss max 100KB, check template part slugs exist)
  4. Write updated customizer to theme document
  5. Emit `theme.customizer_updated` event
- **Events:** `theme.customizer_updated`
- **Errors:**
  - `UNAUTHORIZED` -- User lacks `edit_theme_options`
  - `NOT_FOUND` -- Theme does not exist
  - `CSS_TOO_LARGE` -- Custom CSS exceeds 100KB limit
  - `INVALID_CSS` -- Syntax errors (warning only, not blocking)

#### `theme.update_template_assignments` - Update Template Assignments
- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `edit_theme_options`
- **Roles:** Administrator
- **Args:**
  ```typescript
  {
    themeId: v.id("themes"),
    templateAssignments: {
      index?: string,
      home?: string,
      frontPage?: string,
      single?: string,
      page?: string,
      archive?: string,
      category?: string,
      tag?: string,
      author?: string,
      search?: string,
      notFound?: string,
    },
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Validate user has `edit_theme_options` capability
  2. For each provided template slug, verify it exists in `themeTemplates` for this theme
  3. Merge with existing assignments
  4. Write to theme document
  5. Emit `theme.templates_updated` event
- **Events:** `theme.templates_updated`
- **Errors:**
  - `UNAUTHORIZED`
  - `NOT_FOUND` -- Theme does not exist
  - `INVALID_TEMPLATE` -- Referenced template slug does not exist for this theme

#### `theme.delete` - Delete Theme
- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `manage_themes`
- **Roles:** Administrator
- **Args:**
  ```typescript
  {
    themeId: v.id("themes"),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Validate user has `manage_themes` capability
  2. Verify theme is not the active theme (cannot delete active)
  3. Verify theme is not the default theme (cannot delete default)
  4. Delete all associated themeTemplates records
  5. Delete all associated themeTemplateParts records
  6. Delete all associated themeBlockPatterns records
  7. Delete the theme document
  8. Emit `theme.deleted` event
- **Events:** `theme.deleted`
- **Errors:**
  - `UNAUTHORIZED`
  - `NOT_FOUND`
  - `CANNOT_DELETE_ACTIVE` -- Must switch to another theme first
  - `CANNOT_DELETE_DEFAULT` -- Built-in default cannot be deleted

#### `theme.manage_template` - Manage Theme Template
- **Type:** mutation (Create / Update / Delete)
- **Auth:** Required
- **Capabilities:** `manage_themes`
- **Roles:** Administrator
- **Args (Create):**
  ```typescript
  {
    themeId: v.id("themes"),
    slug: v.string(),
    title: v.string(),
    type: v.string(),          // "single", "page", "archive", etc.
    componentKey: v.string(),
    postTypes: v.optional(v.array(v.string())),
    isCustom: v.boolean(),
  }
  ```
- **Events:** `theme.template_managed`

#### `theme.manage_template_part` - Manage Theme Template Part
- **Type:** mutation (Create / Update / Delete)
- **Auth:** Required
- **Capabilities:** `manage_themes`
- **Roles:** Administrator
- **Events:** `theme.template_part_managed`

#### `theme.manage_pattern` - Manage Block Pattern
- **Type:** mutation (Create / Update / Delete)
- **Auth:** Required
- **Capabilities:** `manage_themes`
- **Roles:** Administrator
- **Events:** `theme.pattern_managed`

#### `theme.export` - Export Theme
- **Type:** query (read-only action)
- **Auth:** Required
- **Capabilities:** `manage_themes`
- **Roles:** Administrator
- **Returns:** Complete JSON export of theme + templates + parts + patterns
- **Behavior:** Exports the full theme configuration as JSON. Does NOT export Convex file storage IDs (logos/images are site-specific). File downloaded as `smithharper-theme-{slug}-{date}.json`.

#### `theme.import` - Import Theme
- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `manage_themes`
- **Roles:** Administrator
- **Behavior:** Validates JSON import, creates theme + all associated records. Handles slug collisions by appending `-2`, `-3`, etc. Does not activate imported theme. Emits `theme.created` event.
- **Events:** `theme.created`

### Queries

#### `themes.getActive`
- **Type:** query
- **Auth:** Public (consumed by website SSR)
- **Args:** `{}`
- **Returns:** Full theme document or default theme config
- **Behavior:** Queries `themes` table using `by_active` index where `isActive === true`. Returns `getDefaultTheme()` if no active theme found.

#### `themes.getById`
- **Type:** query
- **Auth:** Required (admin only)
- **Args:** `{ themeId: v.id("themes") }`
- **Returns:** Theme document or `null`

#### `themes.list`
- **Type:** query
- **Auth:** Required (admin only)
- **Args:** `{}`
- **Returns:** All themes ordered by `createdAt` descending

#### `themes.getGlobalStyles`
- **Type:** query
- **Auth:** Public (consumed by website SSR)
- **Args:** `{}`
- **Returns:** `{ settings, styles, cssProperties: string, customCss: string }`
- **Behavior:**
  1. Get active theme
  2. Three-layer merge: defaults < theme globalStyles < customizer
  3. Compile merged result to CSS custom properties string via `compileToCssProperties()`
  4. Return merged settings, styles, CSS string, and custom CSS

#### `themes.getTemplateForContext`
- **Type:** query
- **Auth:** Public (consumed by website SSR)
- **Args:**
  ```typescript
  {
    context: "index" | "home" | "front-page" | "single" | "page" | "archive" |
             "category" | "tag" | "author" | "search" | "404",
    slug: v.optional(v.string()),
    postType: v.optional(v.string()),
    templateOverride: v.optional(v.string()),
  }
  ```
- **Returns:** `{ templateSlug: string, componentKey: string }`
- **Behavior:** Implements the template hierarchy:
  1. Check per-content template override
  2. Check theme assignment for this context
  3. Fall back to "index" assignment

#### `themeTemplates.listByTheme`
- **Type:** query
- **Auth:** Required (admin)
- **Args:** `{ themeId: v.id("themes") }`
- **Returns:** All templates for the given theme

#### `themeTemplates.listCustomPageTemplates`
- **Type:** query
- **Auth:** Public (consumed by Page editor)
- **Args:** `{}`
- **Returns:** Custom templates (type="custom") for the active theme. Used in Page Attributes metabox.

#### `themeTemplateParts.listByTheme`
- **Type:** query
- **Auth:** Required (admin)
- **Args:** `{ themeId: v.id("themes"), area: v.optional("header" | "footer" | "sidebar" | "uncategorized") }`
- **Returns:** Template parts, optionally filtered by area

#### `themeBlockPatterns.listByTheme`
- **Type:** query
- **Auth:** Required (admin/editor)
- **Args:** `{ themeId: v.id("themes"), category: v.optional(v.string()) }`
- **Returns:** Block patterns, optionally filtered by category

### Internal Functions

#### `themes.getActiveInternal`
- **Type:** internalQuery
- **Purpose:** Server-side use by other Convex functions (SSR helpers, Routing System)
- **Returns:** Active theme or default theme

#### `themes.compileCssProperties`
- **Type:** internalQuery
- **Purpose:** Compile theme globalStyles into CSS custom properties string
- **Args:** `{ themeId: v.id("themes") }`
- **Returns:** CSS properties string

---

## Events

### `theme.created`
- **Type:** System
- **Triggered By:** `theme.create`, `theme.import`
- **Payload:**
  ```typescript
  {
    themeId: Id<"themes">;
    name: string;
    slug: string;
    clonedFrom: string | null;
    createdBy: Id<"users">;
    timestamp: number;
  }
  ```
- **Subscribers:**
  - Audit Log: Yes
  - Site Notification: Notify admins

### `theme.activated`
- **Type:** System
- **Triggered By:** `theme.activate`
- **Payload:**
  ```typescript
  {
    previousThemeId: Id<"themes">;
    previousThemeSlug: string;
    newThemeId: Id<"themes">;
    newThemeSlug: string;
    activatedBy: Id<"users">;
    timestamp: number;
  }
  ```
- **Subscribers:**
  - Audit Log: Yes (high-impact change)
  - Site Notification: Warn all admins about theme switch
  - Email Notification: Theme switch alert to admin email

### `theme.styles_updated`
- **Type:** System
- **Triggered By:** `theme.update_global_styles`
- **Payload:**
  ```typescript
  {
    themeId: Id<"themes">;
    themeSlug: string;
    changedSections: string[];    // e.g., ["color.palette", "typography.fontFamilies"]
    updatedBy: Id<"users">;
    timestamp: number;
  }
  ```
- **Subscribers:**
  - Audit Log: Yes

### `theme.customizer_updated`
- **Type:** System
- **Triggered By:** `theme.update_customizer`
- **Payload:**
  ```typescript
  {
    themeId: Id<"themes">;
    themeSlug: string;
    changedSections: string[];    // e.g., ["siteIdentity", "header", "customCss"]
    updatedBy: Id<"users">;
    timestamp: number;
  }
  ```
- **Subscribers:**
  - Audit Log: Yes

### `theme.templates_updated`
- **Type:** System
- **Triggered By:** `theme.update_template_assignments`
- **Payload:**
  ```typescript
  {
    themeId: Id<"themes">;
    themeSlug: string;
    changes: Array<{
      context: string;
      oldTemplate: string | null;
      newTemplate: string | null;
    }>;
    updatedBy: Id<"users">;
    timestamp: number;
  }
  ```
- **Subscribers:**
  - Audit Log: Yes

### `theme.deleted`
- **Type:** System
- **Triggered By:** `theme.delete`
- **Payload:**
  ```typescript
  {
    themeId: Id<"themes">;
    name: string;
    slug: string;
    deletedBy: Id<"users">;
    timestamp: number;
  }
  ```
- **Subscribers:**
  - Audit Log: Yes

### `theme.template_managed`
- **Type:** System
- **Triggered By:** `theme.manage_template`
- **Payload:**
  ```typescript
  {
    themeId: Id<"themes">;
    action: "created" | "updated" | "deleted";
    templateSlug: string;
    templateTitle: string;
    managedBy: Id<"users">;
    timestamp: number;
  }
  ```
- **Subscribers:**
  - Audit Log: Yes

### `theme.template_part_managed`
- **Type:** System
- **Triggered By:** `theme.manage_template_part`
- **Payload:**
  ```typescript
  {
    themeId: Id<"themes">;
    action: "created" | "updated" | "deleted";
    partSlug: string;
    partArea: string;
    managedBy: Id<"users">;
    timestamp: number;
  }
  ```
- **Subscribers:**
  - Audit Log: Yes

### `theme.pattern_managed`
- **Type:** System
- **Triggered By:** `theme.manage_pattern`
- **Payload:**
  ```typescript
  {
    themeId: Id<"themes">;
    action: "created" | "updated" | "deleted";
    patternSlug: string;
    patternCategory: string;
    managedBy: Id<"users">;
    timestamp: number;
  }
  ```
- **Subscribers:**
  - Audit Log: Yes

### Events Summary

| # | Event Code | Triggered By | Subscribers |
|---|-----------|-------------|-------------|
| 1 | `theme.created` | `theme.create`, `theme.import` | Audit Log, Site Notification |
| 2 | `theme.activated` | `theme.activate` | Audit Log, Site Notification, Email Notification |
| 3 | `theme.styles_updated` | `theme.update_global_styles` | Audit Log |
| 4 | `theme.customizer_updated` | `theme.update_customizer` | Audit Log |
| 5 | `theme.templates_updated` | `theme.update_template_assignments` | Audit Log |
| 6 | `theme.deleted` | `theme.delete` | Audit Log |
| 7 | `theme.template_managed` | `theme.manage_template` | Audit Log |
| 8 | `theme.template_part_managed` | `theme.manage_template_part` | Audit Log |
| 9 | `theme.pattern_managed` | `theme.manage_pattern` | Audit Log |

---

## Admin Routes & UI

### Themes List (`/admin/appearance/themes`)
- **Purpose:** Browse available themes, preview them, and activate
- **WordPress Equivalent:** `themes.php`
- **Layout:**
  - Active theme displayed as a hero card (full width) with screenshot, name, version, author, description, and [Customize] [Editor] buttons
  - Available themes in a 3-column card grid with screenshot thumbnail, name, [Activate] button, [Preview] and [Delete] links
  - [Add New Theme] button (top-right)
- **Key Components:**
  - `ThemeCard` -- Theme display card with screenshot, metadata, action buttons
  - Confirmation dialog for Activate and Delete actions
- **Data Requirements:** `useQuery(api.themes.list)`
- **User Interactions:**
  - "Activate" triggers `theme.activate` mutation with confirmation
  - "Delete" triggers `theme.delete` mutation with confirmation
  - "Preview" opens side panel with theme details
  - "Add New Theme" opens creation form or import dialog
  - "Customize" navigates to `/admin/appearance/customize`
  - "Editor" navigates to `/admin/appearance/editor`
- **Real-Time:** Theme list updates live via Convex subscription. If another admin activates a theme, the active indicator moves immediately.

### Theme Customizer (`/admin/appearance/customize`)
- **Purpose:** Live-preview customization of theme appearance options
- **WordPress Equivalent:** `customize.php`
- **Layout:** Two-panel layout:
  - **Left Panel (~350px):** Section accordion with Site Identity, Header, Footer, Sidebar, Background Image, Additional CSS. Sticky [Publish] button at bottom.
  - **Right Panel:** Live preview iframe with device switcher (Desktop 1280px / Tablet 768px / Mobile 375px)
- **Key Components:**
  - `CustomizerPanel` -- Accordion sidebar with form sections
  - `PreviewFrame` -- Live preview iframe component
  - `CssEditor` -- Monaco/CodeMirror for Additional CSS
- **Data Requirements:**
  - `useQuery(api.themes.getActive)`
  - `useQuery(api.themeTemplateParts.listByTheme, { themeId, area: "header" })`
  - `useQuery(api.themeTemplateParts.listByTheme, { themeId, area: "footer" })`
- **User Interactions:**
  - Every field change updates local draft state and pushes to preview iframe in real-time
  - "Publish" saves all changes via `theme.updateCustomizer` mutation
  - Unsaved changes trigger navigation guard
- **Real-Time:** Draft values preview locally via `postMessage`. Saved values propagate via Convex subscriptions.

### Theme Editor (`/admin/appearance/editor`)
- **Purpose:** Full theme editing interface -- the WordPress Site Editor equivalent
- **WordPress Equivalent:** `site-editor.php`
- **Layout:** Left sidebar navigation with sub-routes: Styles, Templates, Parts, Patterns. Main content area changes per sub-route.

### Global Styles Editor (`/admin/appearance/editor/styles`)
- **Purpose:** Edit color palette, typography, spacing, and layout settings
- **Layout:** Tabbed interface:
  - **Colors tab:** Color palette swatch grid with pickers, gradients, body colors, element colors (link, heading, button)
  - **Typography tab:** Font families list, font sizes scale, body typography, heading typography
  - **Spacing tab:** Block gap, spacing scale values, allowed units multi-select
  - **Layout tab:** Content width, wide width inputs
  - Sticky [Save Changes] button. Optional live preview panel.
- **Key Components:**
  - `ColorPalettePicker` -- Color palette editing with hex input + visual picker
  - `FontFamilyManager` -- Font family management with provider select and Google Font URL
  - `FontSizeScale` -- Font size scale editor
  - `SpacingScale` -- Spacing scale editor
  - `LayoutSettings` -- Content/wide width controls
- **Data Requirements:** `useQuery(api.themes.getActive)`

### Templates Manager (`/admin/appearance/editor/templates`)
- **Purpose:** View and manage template assignments for the active theme
- **Layout:**
  - Template Assignments table: Context | Assigned Template | [Change]
  - All Templates card grid with title, type, component key, [Edit] [Delete]
  - Custom Page Templates section listing type="custom" templates
  - [Add Template] button
- **Data Requirements:**
  - `useQuery(api.themeTemplates.listByTheme, { themeId })`
  - `useQuery(api.themes.getActive)` for assignment display
- **Key Components:** `TemplateCard`

### Template Parts Manager (`/admin/appearance/editor/parts`)
- **Purpose:** Manage header, footer, and sidebar template parts
- **Layout:** Sections for Headers, Footers, Sidebars, Uncategorized. Each section has a card grid and [Add] button.
- **Data Requirements:** `useQuery(api.themeTemplateParts.listByTheme, { themeId })`

### Patterns Manager (`/admin/appearance/editor/patterns`)
- **Purpose:** Manage block patterns registered with the theme
- **Layout:** Category dropdown filter, search input, card grid with visual preview, title, category badge, [Edit] [Duplicate] [Delete] buttons. [Add Pattern] button.
- **Key Components:** `PatternCard` -- Pattern display card with rendered content preview
- **Data Requirements:** `useQuery(api.themeBlockPatterns.listByTheme, { themeId })`

### Admin Sidebar Navigation

```
Appearance
  Themes      -> /admin/appearance/themes
  Customize   -> /admin/appearance/customize
  Editor      -> /admin/appearance/editor
```

`/admin/appearance` redirects to `/admin/appearance/themes`.

---

## Website Routes

### Root Layout (all pages)
- **Purpose:** Inject theme CSS custom properties, Google Fonts, and custom CSS into every page
- **Data Requirements:**
  - `useQuery(api.themes.getActive)` -- Active theme document
  - `useQuery(api.themes.getGlobalStyles)` -- Compiled CSS properties
  - `useQuery(api.settings.getPublic)` -- Site language
- **SSR:** CSS custom properties injected as `<style>` tag in `<head>` during server-side rendering
- **Caching:** Convex handles caching automatically. Theme data fetched once at root layout level, not per-page.

### Template Resolution (per content route)
- **Purpose:** Resolve which template component to render for the current content
- **Data Requirements:** `useQuery(api.themes.getTemplateForContext, { context, slug, postType, templateOverride })`
- **Behavior:** Component registry lookup: `templateRegistry[componentKey]`

### Template Part Rendering
- **Purpose:** Render header, footer, sidebar from theme config
- **Behavior:** Template part registry lookup using customizer slugs: `templatePartRegistry[headerSlug]`

---

## Notifications

### Email Notifications

| Name | Event | Recipients | Priority | Subject |
|------|-------|------------|----------|---------|
| Theme Switched Alert | `theme.activated` | All Administrators | Immediate | "Site theme changed to {newThemeName}" |

Email body includes: previous theme name, new theme name, who made the switch, timestamp, link to Themes page, warning about visual changes to live site.

### Site Notifications

| Name | Event | Type | Persistent | Recipients |
|------|-------|------|-----------|------------|
| Theme Activated | `theme.activated` | Info | No | All Administrators |
| Theme Styles Changed | `theme.styles_updated` | Info | No | All Administrators |
| Theme Deleted | `theme.deleted` | Warning | No | All Administrators |

---

## Role & Capability Matrix

| Action | Administrator | Editor | Author | Contributor | Subscriber |
|--------|:------------:|:------:|:------:|:-----------:|:----------:|
| View themes list | Yes | No | No | No | No |
| Activate theme | Yes | No | No | No | No |
| Create theme | Yes | No | No | No | No |
| Delete theme | Yes | No | No | No | No |
| Edit global styles | Yes | No | No | No | No |
| Edit customizer | Yes | No | No | No | No |
| Manage templates | Yes | No | No | No | No |
| Manage template parts | Yes | No | No | No | No |
| Manage block patterns | Yes | No | No | No | No |
| Export theme | Yes | No | No | No | No |
| Import theme | Yes | No | No | No | No |
| Select page template (per-page) | Yes | Yes | No | No | No |

### Capabilities

| Capability | Description | Roles |
|-----------|-------------|-------|
| `switch_themes` | Activate a different theme | Administrator |
| `manage_themes` | Create, delete, import, export themes | Administrator |
| `edit_theme_options` | Edit global styles, customizer, templates, template parts, patterns | Administrator |

---

## Dependencies

### Depends On

| System | Dependency Type | What Is Needed |
|--------|----------------|----------------|
| **Settings System** (`recJR4tgIzkcaJMq5`) | **Hard** | Site title, tagline, homepage display mode, permalink structure consumed by theme rendering. The Customizer's "Site Identity" section reads from Settings. |
| **Role & Capability System** (`recLjkb6BJlxqHTQv`) | **Hard** | Theme pages require Administrator role. All mutations check `edit_theme_options`, `manage_themes`, or `switch_themes` capabilities. |
| **Auth System** | **Hard** | Must be authenticated to access any Appearance admin pages. WorkOS session required for capability checks. |
| **Media System** | **Soft** | Logo, site icon, background images, and theme screenshots stored via Convex file storage. Media System provides upload/management UI. |
| **Content Editor System** | **Soft** | Block patterns integrate with the Content Editor's block insertion UI. Pattern content format matches the editor's block tree structure. |

### Depended On By

| System | Dependency Type | What They Need |
|--------|----------------|----------------|
| **Page System** | **Soft** | Custom page templates list from `themeTemplates.listCustomPageTemplates` for the Page Attributes metabox. |
| **Post System** | **Soft** | Template override capability -- individual posts can specify `templateSlug` to override the theme's template assignment. |
| **Widget System** | **Soft** | Sidebar position and width from `theme.customizer.sidebar` to know where to render widget areas. |
| **Menu System** | **Soft** | Header/footer template parts may include navigation menus. Menu System needs to know which template parts are active. |

### External Dependencies

| Dependency | Purpose |
|-----------|---------|
| Convex | Theme storage, reactive queries, file storage for logos/screenshots |
| Tailwind CSS v4 | `@theme` directive consumes CSS custom properties from `:root` |
| Google Fonts API | Font loading for Google-sourced font families |
| Base UI (`@base-ui/react`) | Admin UI components (Select, Tabs, Collapsible, etc.) |
| Monaco Editor / CodeMirror | Custom CSS editor in Customizer |

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/)
- [ ] `convex/schema.ts` -- Add `themes`, `themeTemplates`, `themeTemplateParts`, `themeBlockPatterns` table definitions (4 tables)
- [ ] `convex/themes.ts` -- Queries: `getActive`, `getById`, `list`, `getGlobalStyles`, `getTemplateForContext` (5 queries) + Mutations: `create`, `activate`, `updateGlobalStyles`, `updateCustomizer`, `updateTemplateAssignments`, `remove` (6 mutations)
- [ ] `convex/themeTemplates.ts` -- Queries: `listByTheme`, `listCustomPageTemplates` (2 queries) + Mutations for CRUD
- [ ] `convex/themeTemplateParts.ts` -- Queries: `listByTheme` (1 query) + Mutations for CRUD
- [ ] `convex/themeBlockPatterns.ts` -- Queries: `listByTheme` (1 query) + Mutations for CRUD
- [ ] `convex/helpers/theme.ts` -- `deepMerge()`, `compileToCssProperties()`, `validateGlobalStyles()`, `getDefaultTheme()`, `getDefaultGlobalStyles()`, `slugify()`
- [ ] `convex/helpers/templateHierarchy.ts` -- Template resolution logic
- [ ] `convex/seeds/defaultTheme.ts` -- Default theme, templates, parts, and patterns seed data

### Admin Frontend (ConvexPress-Admin/apps/web/)
- [ ] `src/routes/admin/appearance/themes.tsx` -- Themes list page
- [ ] `src/routes/admin/appearance/customize.tsx` -- Theme Customizer page
- [ ] `src/routes/admin/appearance/editor.tsx` -- Theme Editor layout
- [ ] `src/routes/admin/appearance/editor/styles.tsx` -- Global Styles editor
- [ ] `src/routes/admin/appearance/editor/templates.tsx` -- Templates manager
- [ ] `src/routes/admin/appearance/editor/parts.tsx` -- Template Parts manager
- [ ] `src/routes/admin/appearance/editor/patterns.tsx` -- Patterns manager
- [ ] `src/components/theme/ColorPalettePicker.tsx` -- Color palette editing
- [ ] `src/components/theme/FontFamilyManager.tsx` -- Font family management
- [ ] `src/components/theme/FontSizeScale.tsx` -- Font size scale editor
- [ ] `src/components/theme/SpacingScale.tsx` -- Spacing scale editor
- [ ] `src/components/theme/LayoutSettings.tsx` -- Content/wide width controls
- [ ] `src/components/theme/CustomizerPanel.tsx` -- Customizer sidebar panel
- [ ] `src/components/theme/TemplateCard.tsx` -- Template display card
- [ ] `src/components/theme/PatternCard.tsx` -- Pattern display card with preview
- [ ] `src/components/theme/ThemeCard.tsx` -- Theme card for themes list
- [ ] `src/components/theme/CssEditor.tsx` -- Custom CSS code editor
- [ ] `src/components/theme/PreviewFrame.tsx` -- Live preview iframe

### Website Frontend (ConvexPress-Website/apps/web/)
- [ ] `app/routes/__root.tsx` -- Root layout with theme CSS injection
- [ ] `app/lib/template-registry.ts` -- Static template component registry
- [ ] `app/lib/template-part-registry.ts` -- Static template part component registry
- [ ] `app/lib/theme-context.tsx` -- ThemeProvider and useTheme hook
- [ ] `app/lib/compile-css.ts` -- CSS custom properties compilation (shared with backend)
- [ ] `app/styles/theme.css` -- Tailwind CSS v4 `@theme` directive mapping
- [ ] `app/templates/IndexTemplate.tsx`
- [ ] `app/templates/HomeBlogTemplate.tsx`
- [ ] `app/templates/SinglePostTemplate.tsx`
- [ ] `app/templates/DefaultPageTemplate.tsx`
- [ ] `app/templates/FullWidthPageTemplate.tsx`
- [ ] `app/templates/NoSidebarPageTemplate.tsx`
- [ ] `app/templates/LandingPageTemplate.tsx`
- [ ] `app/templates/ArchiveTemplate.tsx`
- [ ] `app/templates/SearchResultsTemplate.tsx`
- [ ] `app/templates/NotFoundTemplate.tsx`
- [ ] `app/template-parts/DefaultHeader.tsx`
- [ ] `app/template-parts/MinimalHeader.tsx`
- [ ] `app/template-parts/CenteredHeader.tsx`
- [ ] `app/template-parts/DefaultFooter.tsx`
- [ ] `app/template-parts/MinimalFooter.tsx`
- [ ] `app/template-parts/ColumnsFooter.tsx`
- [ ] `app/template-parts/DefaultSidebar.tsx`

---

## CSS Custom Properties Compilation

### Naming Convention

```
--sh-{category}-{name}

Categories:
  color-{name}       Color palette entries
  font-{family|size} Typography
  spacing-{name}     Spacing scale
  layout-{name}      Layout dimensions
  line-height-{name} Line heights
```

The `sh-` prefix (SmithHarper) avoids collisions with other CSS property namespaces.

### Three-Layer Merge Strategy

```
Layer 1: SmithHarper Defaults (hardcoded in getDefaultGlobalStyles())
  + Layer 2: Theme globalStyles (from themes table)
    + Layer 3: Customizer overrides (from themes.customizer)
      = Final computed styles -> CSS custom properties
```

Merge semantics: object properties merge recursively, array properties replace entirely, scalar properties replace.

### Output Example

```css
:root {
  /* Color palette */
  --sh-color-primary: #1e40af;
  --sh-color-secondary: #7c3aed;
  --sh-color-accent: #f59e0b;
  --sh-color-neutral: #6b7280;
  --sh-color-background: #ffffff;
  --sh-color-surface: #f9fafb;
  --sh-color-text: #111827;
  --sh-color-text-muted: #6b7280;

  /* Typography */
  --sh-font-body: 'Inter', sans-serif;
  --sh-font-heading: 'Inter', sans-serif;
  --sh-font-mono: 'JetBrains Mono', monospace;
  --sh-font-size-xs: 0.75rem;
  --sh-font-size-sm: 0.875rem;
  --sh-font-size-base: 1rem;
  --sh-font-size-lg: 1.125rem;
  --sh-font-size-xl: 1.25rem;
  --sh-font-size-2xl: 1.5rem;
  --sh-font-size-3xl: 1.875rem;
  --sh-font-size-4xl: 2.25rem;
  --sh-line-height-body: 1.625;
  --sh-line-height-heading: 1.2;

  /* Spacing */
  --sh-spacing-block-gap: 1.5rem;
  --sh-spacing-xs: 0.25rem;
  --sh-spacing-sm: 0.5rem;
  --sh-spacing-md: 1rem;
  --sh-spacing-lg: 1.5rem;
  --sh-spacing-xl: 2rem;
  --sh-spacing-2xl: 3rem;

  /* Layout */
  --sh-layout-content: 720px;
  --sh-layout-wide: 1200px;

  /* Elements */
  --sh-color-link: #1e40af;
  --sh-color-heading: #111827;
  --sh-color-button-bg: #1e40af;
  --sh-color-button-text: #ffffff;
  --sh-button-radius: 0.375rem;
}
```

### Tailwind CSS v4 Integration

```css
/* website/app/styles/theme.css */
@theme {
  --color-primary: var(--sh-color-primary);
  --color-secondary: var(--sh-color-secondary);
  --color-accent: var(--sh-color-accent);
  --color-background: var(--sh-color-background);
  --color-surface: var(--sh-color-surface);
  --color-text: var(--sh-color-text);
  --color-text-muted: var(--sh-color-text-muted);

  --font-body: var(--sh-font-body);
  --font-heading: var(--sh-font-heading);
  --font-mono: var(--sh-font-mono);
}
```

Components use standard Tailwind classes: `font-heading text-heading text-4xl`, `font-body text-text`, `text-primary hover:text-primary/80`.

---

## Template Hierarchy

### Resolution Order by Content Context

| Context | Lookup Order |
|---------|-------------|
| **Single Post** (`/blog/{slug}`) | 1. `post.templateSlug` override -> 2. Theme: `single` -> 3. `index` |
| **Single Page** (`/{slug}`) | 1. `page.templateSlug` override -> 2. Theme: `page` -> 3. `index` |
| **Blog Home** (`/blog` or `/` if latest posts) | 1. Theme: `home` -> 2. `index` |
| **Static Front Page** (`/` when static page) | 1. Theme: `frontPage` -> 2. Theme: `page` -> 3. `index` |
| **Category Archive** (`/category/{slug}`) | 1. Theme: `category` -> 2. Theme: `archive` -> 3. `index` |
| **Tag Archive** (`/tag/{slug}`) | 1. Theme: `tag` -> 2. Theme: `archive` -> 3. `index` |
| **Author Archive** (`/author/{slug}`) | 1. Theme: `author` -> 2. Theme: `archive` -> 3. `index` |
| **Search Results** (`/search`) | 1. Theme: `search` -> 2. `index` |
| **404 Not Found** | 1. Theme: `notFound` -> 2. `index` |

### Component Registry Pattern

```typescript
// website/lib/template-registry.ts
export const templateRegistry: Record<string, React.ComponentType<any>> = {
  IndexTemplate,
  SinglePostTemplate,
  DefaultPageTemplate,
  FullWidthPageTemplate,
  NoSidebarPageTemplate,
  LandingPageTemplate,
  HomeBlogTemplate,
  ArchiveTemplate,
  SearchResultsTemplate,
  NotFoundTemplate,
};

// website/lib/template-part-registry.ts
export const templatePartRegistry: Record<string, React.ComponentType<any>> = {
  "header-default": DefaultHeader,
  "header-minimal": MinimalHeader,
  "header-centered": CenteredHeader,
  "footer-default": DefaultFooter,
  "footer-minimal": MinimalFooter,
  "footer-columns": ColumnsFooter,
  "sidebar-default": DefaultSidebar,
};
```

### Default Templates

| Slug | Title | Type | Component Key |
|------|-------|------|---------------|
| `index` | Index | index | `IndexTemplate` |
| `home-blog` | Blog Home | home | `HomeBlogTemplate` |
| `single-post` | Single Post | single | `SinglePostTemplate` |
| `page-default` | Default Page | page | `DefaultPageTemplate` |
| `page-full-width` | Full Width | custom | `FullWidthPageTemplate` |
| `page-no-sidebar` | No Sidebar | custom | `NoSidebarPageTemplate` |
| `page-landing` | Landing Page | custom | `LandingPageTemplate` |
| `archive-default` | Archive | archive | `ArchiveTemplate` |
| `search-results` | Search Results | search | `SearchResultsTemplate` |
| `not-found` | 404 Not Found | 404 | `NotFoundTemplate` |

### Default Template Parts

| Slug | Title | Area | Component Key |
|------|-------|------|---------------|
| `header-default` | Default Header | header | `DefaultHeader` |
| `header-minimal` | Minimal Header | header | `MinimalHeader` |
| `header-centered` | Centered Header | header | `CenteredHeader` |
| `footer-default` | Default Footer | footer | `DefaultFooter` |
| `footer-minimal` | Minimal Footer | footer | `MinimalFooter` |
| `footer-columns` | Multi-Column Footer | footer | `ColumnsFooter` |
| `sidebar-default` | Default Sidebar | sidebar | `DefaultSidebar` |

---

## Block Patterns

### Pattern Categories

| Category | Description | Examples |
|----------|-------------|---------|
| `hero` | Full-width hero sections | Hero with CTA, Hero with image, Hero with video background |
| `features` | Feature showcases | 3-column features, Icon grid, Feature comparison |
| `testimonials` | Social proof | Testimonial carousel, Quote grid, Single testimonial |
| `cta` | Call to action | CTA banner, CTA with form, Inline CTA |
| `team` | Team member displays | Team grid, Team carousel |
| `faq` | FAQ sections | Accordion FAQ, Two-column FAQ |
| `pricing` | Pricing tables | 3-tier pricing, Feature comparison table |
| `gallery` | Image galleries | Masonry grid, Lightbox gallery |
| `text` | Text layouts | Two-column text, Text with sidebar, Pull quote |
| `header` | Page headers | Page header with breadcrumb, Page header with image |

Pattern content is stored as serialized block tree JSON, matching the Content Editor System's block format.

---

## Validation Rules

### Theme Identity

| Field | Rules |
|-------|-------|
| `name` | Required, 1-100 characters, trimmed |
| `slug` | Required, 1-100 characters, lowercase alphanumeric + hyphens, unique |
| `description` | Optional, max 500 characters |
| `version` | Required, valid semver format (e.g., "1.0.0") |

### Global Styles

| Field | Rules |
|-------|-------|
| `color.palette[].color` | Valid CSS color (hex, rgb, hsl, oklch, named) |
| `color.palette[].slug` | Unique within palette, 1-50 chars, lowercase + hyphens |
| `typography.fontFamilies[].fontFamily` | Valid CSS font-family value |
| `typography.fontFamilies[].googleFontUrl` | Valid URL starting with `https://fonts.googleapis.com/` if provided |
| `typography.fontSizes[].size` | Valid CSS length value (e.g., "1rem", "16px") |
| `spacing.blockGap` | Valid CSS length value |
| `spacing.units[]` | Valid CSS unit strings |
| `layout.contentSize` | Valid CSS length value, min 320px equivalent |
| `layout.wideSize` | Valid CSS length value, must be >= contentSize |

### Customizer

| Field | Rules |
|-------|-------|
| `siteIdentity.logoId` | Must be valid Convex file storage ID |
| `siteIdentity.siteIcon` | Valid file storage ID; recommended 512x512 |
| `siteIdentity.logoWidth` | Number, 1-1000 (pixels) |
| `header.templatePartSlug` | Must exist in themeTemplateParts with area="header" |
| `footer.templatePartSlug` | Must exist in themeTemplateParts with area="footer" |
| `footer.copyrightText` | Max 500 characters |
| `sidebar.width` | Valid CSS length value |
| `customCss` | Max 100KB (102,400 characters) |

### Templates

| Field | Rules |
|-------|-------|
| `slug` | Unique within theme, 1-100 chars, lowercase + hyphens |
| `title` | Required, 1-100 characters |
| `componentKey` | Must exist in the component registry |
| `type` | Must be one of the defined template types |

---

## Import / Export

### Export Format

```json
{
  "version": "1.0",
  "exportedAt": "2026-02-08T14:30:00Z",
  "exportedBy": "admin@example.com",
  "type": "smithharper-theme",
  "theme": {
    "name": "...", "slug": "...", "description": "...", "version": "...",
    "supports": { ... }, "globalStyles": { ... },
    "customizer": { ... }, "templateAssignments": { ... }
  },
  "templates": [ { "slug": "...", "title": "...", "type": "...", "componentKey": "...", ... } ],
  "templateParts": [ { "slug": "...", "title": "...", "area": "...", "componentKey": "...", ... } ],
  "blockPatterns": [ { "slug": "...", "title": "...", "category": "...", "content": "...", ... } ]
}
```

### Key Import/Export Rules

- Export does NOT include Convex file storage IDs (logos/images are site-specific)
- Import validates `type` field is "smithharper-theme"
- Slug collisions resolved by appending `-2`, `-3`, etc.
- Imported theme is NOT auto-activated
- Import preview shown before confirming

---

## Edge Cases & Gotchas

1. **Active theme invariant:** Only one theme can be `isActive: true`. The `activate` mutation must deactivate the old theme and activate the new one atomically within a single Convex transaction. Never leave zero active themes.

2. **Default theme protection:** The built-in default theme (`isDefault: true`) cannot be deleted. It can be deactivated but never removed. This guarantees a fallback always exists.

3. **Missing component key:** If a template's `componentKey` references a component not in the registry (e.g., removed in a code update), fall back to `IndexTemplate`. Log a warning and create an admin notification.

4. **Missing template part:** If customizer references a header/footer/sidebar slug that no longer exists, fall back to the default part for that area. Log a warning.

5. **Theme with no templates:** If an active theme has no template records (corrupted import), use the default theme's templates. Show admin warning.

6. **Concurrent editing:** Two admins editing the same theme's styles simultaneously -- Convex transactions ensure last-write-wins. The losing admin's form reactively updates. Show toast: "Theme styles were updated by another administrator."

7. **Custom CSS size limit:** 100KB max. Mutation rejects with `CSS_TOO_LARGE`. UI shows character count. CSS syntax errors are flagged as warnings but do not block saving.

8. **Google Font loading failure:** Font stack falls back to system fonts. No error shown to visitors. Admin notification created.

9. **Import slug collision:** Append `-2`, `-3`, etc. to make slug unique. Show modified slug in import preview.

10. **Empty color palette:** At least one color required. Block deletion of last color: "At least one color is required in the palette."

11. **deepMerge in Convex:** Must be a pure function (no lodash). Convex mutations run in V8 isolates. Implement recursive merge handling objects (merge), arrays (replace), and scalars (replace).

12. **File storage IDs:** Logo, icon, background images use Convex `_storage` references. Generate URLs with `ctx.storage.getUrl(storageId)`. Handle expired/deleted storage IDs gracefully (return null URL, don't crash).

13. **Theme seed on first deployment:** Default theme + templates + parts should be created via Convex init/migration function. Check if any themes exist; if not, seed defaults.

14. **CSS properties computed in query, not stored:** The `compileToCssProperties()` result is computed in the `getGlobalStyles` query. Convex caching ensures this runs once per theme change, not per request.

15. **SSR performance:** Call `themes.getActive` once at root layout level, not per-page. CSS properties injected as single `<style>` tag. Google Fonts use `display=swap`.

16. **Dark mode is out of scope for v1:** Can be handled with Tailwind `dark:` variant at component level. Future versions may add `customizer.colorScheme`.

---

## Performance Requirements

### Query Latency Targets

| Query | Target |
|-------|--------|
| `themes.getActive` | < 50ms |
| `themes.getGlobalStyles` | < 50ms |
| `themes.getTemplateForContext` | < 30ms |
| `themes.list` | < 100ms |
| `themeTemplates.listByTheme` | < 50ms |
| `themeTemplateParts.listByTheme` | < 50ms |
| `themeBlockPatterns.listByTheme` | < 100ms |

### Mutation Latency Targets

| Mutation | Target |
|----------|--------|
| `themes.activate` | < 300ms |
| `themes.updateGlobalStyles` | < 200ms |
| `themes.updateCustomizer` | < 200ms |
| `themes.delete` | < 500ms (cascade deletes) |

### Other Targets

- CSS custom properties compilation: < 10ms
- Theme switch including CSS regeneration: < 2s
- Customizer preview latency: < 500ms
- Theme document size: < 50KB

---

## WordPress Functions Reference

| WordPress | SmithHarper | Notes |
|-----------|-------------|-------|
| `wp_get_theme()` | `useQuery(api.themes.getActive)` | Returns full theme document |
| `switch_theme($stylesheet)` | `useMutation(api.themes.activate)` | Deactivates old, activates new atomically |
| `get_theme_mod($name, $default)` | `useQuery(api.themes.getActive)` + access field | Customizer overrides stored in `customizer` field |
| `set_theme_mod($name, $value)` | `useMutation(api.themes.updateCustomizer)` | Deep-merges with existing customizer |
| `remove_theme_mod($name)` | `useMutation(api.themes.updateCustomizer)` with null | Set field to null in customizer |
| `get_theme_support($feature)` | Theme config `supports` field | Boolean feature flags |
| `add_theme_support($feature)` | Theme config `supports` field | Set in schema, not runtime |
| `get_template_part($slug, $name)` | Template part registry lookup | `templatePartRegistry[slug]` |
| `get_page_templates($post)` | `useQuery(api.themeTemplates.listCustomPageTemplates)` | Templates with type="custom" |
| `wp_get_global_styles()` | `useQuery(api.themes.getGlobalStyles)` | Three-layer merged styles + compiled CSS |
| `wp_get_global_settings()` | `themes.getActive` -> `globalStyles.settings` | Direct field access |
| `locate_template($names)` | `useQuery(api.themes.getTemplateForContext)` | Template hierarchy resolution |
| `get_block_templates($query)` | `useQuery(api.themeTemplates.listByTheme)` | All templates for a theme |
| `get_block_template($id)` | Template lookup by slug via `by_theme_slug` index | Single template |
| `register_sidebar()` | Not in Theme System -- Widget System handles this | Theme only controls sidebar position/width |
