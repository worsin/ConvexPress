# SEO System - Expert Knowledge Document

**System:** SEO System
**Status:** Complete (100%)
**Priority:** P2 - Medium
**WordPress Equivalent:** Yoast SEO / Rank Math plugin (replaces both entirely as a first-class CMS subsystem)
**Last Analyzed:** 2026-02-13

---

## Quick Reference

### What This System Does

The SEO System manages all search-engine-optimization metadata for ConvexPress. It replaces the functionality of WordPress's Yoast SEO and Rank Math plugins -- providing per-post and per-page meta titles, meta descriptions, Open Graph tags, Twitter Card tags, canonical URLs, noindex/nofollow directives, focus keyphrase tracking, readability analysis, JSON-LD structured data (Schema.org), breadcrumb generation, robots.txt management, and social media preview. It also exposes a global SEO settings panel for site-wide defaults. Unlike WordPress where SEO is bolted on via plugins, ConvexPress builds all of this as a first-class system.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Post SEO Metadata** | Per-post/page SEO fields stored in `postMeta` table with `_seo_*` keys |
| **Global SEO Settings** | Site-wide SEO configuration stored in `seoSettings` table (key-value with JSON values) |
| **Fallback Chain** | Resolution order: custom field -> template -> post content -> global default |
| **SEO Analysis** | Client-side real-time scoring (0-100) based on keyphrase, content, and technical checks |
| **Readability Analysis** | Client-side Flesch-based scoring for content readability |
| **Template Variables** | `%%title%%`, `%%sep%%`, `%%sitename%%`, etc. -- Yoast-compatible variable syntax |
| **JSON-LD Graph** | Schema.org structured data: WebSite, Organization/Person, Article/WebPage, BreadcrumbList |
| **SERP Preview** | Live Google search result preview in the editor |
| **Cornerstone Content** | Flag for high-priority pages that deserve special internal linking attention |
| **Robots.txt** | Dynamically generated, served by TanStack Start API route |

### ConvexPress vs WordPress

| Aspect | WordPress + Yoast SEO | ConvexPress SEO System |
|--------|----------------------|----------------------|
| **Storage** | `wp_postmeta` key-value rows (serialized PHP) | Convex `postMeta` table (JSON string values) + `seoSettings` table |
| **Analysis** | Server-side PHP + client-side JS | Client-side real-time analysis only (faster) |
| **Schema.org** | PHP-generated JSON-LD in `wp_head` | TanStack Start SSR renders JSON-LD in `<head>` |
| **Robots.txt** | Virtual file via `do_robotstxt` action | Convex query returning stored rules, served by TanStack Start route |
| **Sitemap** | Yoast generates XML sitemap | Separate Sitemap System (SEO System provides noindex flags) |
| **Settings UI** | Yoast admin pages | Admin SPA routes `/admin/seo` and `/admin/seo/settings` |
| **Reactivity** | Page refresh to see analysis changes | Real-time Convex subscriptions; analysis updates as user types |
| **Social Profiles** | Yoast Social settings | Stored in `seoSettings` under `social` key |
| **Breadcrumbs** | `yoast_breadcrumb()` template tag | React `<Breadcrumbs>` component with Schema.org JSON-LD |
| **Redirects** | Yoast Premium / Redirection plugin | Deferred to Routing System |
| **Multiple Keyphrases** | Yoast Premium (paid) | Built-in, no paywall |

---

## Architecture Overview

### Data Flow

1. **Admin Editor Flow:** User edits post -> SEO metabox shows in editor -> user fills SEO fields -> client-side analysis runs in real-time -> on save, `seo.update_post` mutation upserts `postMeta` rows -> `seo.updated` event fires -> Audit Log records change, toast notification shows.

2. **Global Settings Flow:** Administrator opens `/admin/seo/settings` -> fills tabbed form -> on save, `seo.update_global` mutation upserts `seoSettings` row -> changes reflected across site on next render.

3. **Website Rendering Flow:** TanStack Start SSR route loader fetches post + SEO data + global settings -> `resolvePostSeo` applies fallback chain -> `SeoHead` component renders meta tags, OG, Twitter, JSON-LD in `<head>` -> breadcrumb trail rendered in page body.

4. **Robots.txt Flow:** Crawler requests `/robots.txt` -> TanStack Start API route calls `seo.getRobotsTxt` query -> returns dynamically generated text with 1-hour cache.

### Real-Time Behavior

- **SEO metabox** in the post editor subscribes to `useQuery(api.seo.getPostSeo, { postId })`. If another user updates the same post's SEO data, the metabox updates live.
- **SEO settings** are subscribed via `useQuery(api.seo.getSettings)`. Since settings rarely change, this is efficient.
- **SEO analysis** runs entirely client-side (no Convex queries). It re-runs on content change with 1-second debounce.
- **SEO overview dashboard** subscribes to aggregate queries that update reactively when any post's SEO metadata changes.

### Authentication & Authorization

- **Convex Auth** provides user identity via `ctx.auth.getUserIdentity()` in every mutation.
- **SEO metadata editing** uses the `seo.update_post` capability (assigned to Editor, Author, Contributor roles). Ownership-aware checks apply for own vs. others' posts.
- **Global SEO settings** require `seo.update_global` (Administrator only).
- **Robots.txt settings** require `seo.update_robots` (Administrator only).
- **Sitemap regeneration** requires `seo.generate_sitemap` (Administrator only).
- **SEO overview dashboard** requires `seo.update_global` (Administrator only).
- **Contributors** cannot see the SEO metabox (they cannot publish, and SEO only matters for published content).
- **Public** website queries (titles, social, schema, breadcrumbs, verification settings; robots.txt content) do not require authentication. The `robots` and `advanced` settings keys require authentication when accessed via `getSettings`.

---

## Database Schema

### `seoSettings` Table

Global SEO configuration. Mirrors WordPress's `wp_options` SEO-related entries. Uses a key-value pattern scoped to SEO.

```typescript
// convex/schema.ts

seoSettings: defineTable({
  key: v.string(),                        // Setting key: "titles" | "social" | "robots" | "schema" | "breadcrumbs" | "verification" | "advanced"
  value: v.string(),                      // JSON-encoded setting value (see value types below)
  updatedAt: v.number(),                  // Last modification timestamp (ms since epoch)
  updatedBy: v.string(),                  // user identifier of last updater
})
  .index("by_key", ["key"]),              // Unique lookup by key
```

**Fields:**

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `key` | `string` | Yes | N/A | Must be one of: `titles`, `social`, `robots`, `schema`, `breadcrumbs`, `verification`, `advanced`. Unique per row. Max 50 chars. |
| `value` | `string` | Yes | `"{}"` | Valid JSON string. Max 10,000 chars. |
| `updatedAt` | `number` | Yes | `Date.now()` | Unix timestamp (ms). |
| `updatedBy` | `string` | Yes | Current user ID | Valid user identifier. |

### `seoSettings` Known Keys and Value Types

#### `titles` Key - `SeoTitleSettings`

```typescript
interface SeoTitleSettings {
  separator: string;                        // e.g., "|", "-", ">" (default: "|")
  siteTitle: string;                        // Override site title for SEO
  tagline: string;                          // Override tagline for SEO
  homepageTitle: string;                    // Custom homepage SEO title template
  homepageDescription: string;              // Custom homepage meta description
  postTitleTemplate: string;                // e.g., "%%title%% %%sep%% %%sitename%%"
  pageTitleTemplate: string;                // e.g., "%%title%% %%sep%% %%sitename%%"
  categoryTitleTemplate: string;            // e.g., "%%term_title%% Archives %%sep%% %%sitename%%"
  tagTitleTemplate: string;                 // e.g., "%%term_title%% Archives %%sep%% %%sitename%%"
  authorTitleTemplate: string;              // e.g., "%%name%% - Author %%sep%% %%sitename%%"
  searchTitleTemplate: string;              // e.g., "Search Results for %%searchphrase%% %%sep%% %%sitename%%"
  notFoundTitleTemplate: string;            // e.g., "Page not found %%sep%% %%sitename%%"
  dateArchiveTitleTemplate: string;         // e.g., "Archives %%sep%% %%sitename%%"
  postNoindex: boolean;                     // Default noindex for posts (default: false)
  pageNoindex: boolean;                     // Default noindex for pages (default: false)
  categoryNoindex: boolean;                 // Default noindex for categories (default: false)
  tagNoindex: boolean;                      // Default noindex for tags (default: false)
  authorArchiveNoindex: boolean;            // Default noindex for author archives (default: false)
  dateArchiveNoindex: boolean;              // Default noindex for date archives (default: true)
}
```

#### `social` Key - `SeoSocialSettings`

```typescript
interface SeoSocialSettings {
  organizationName: string;
  organizationLogo: string;                 // URL to organization logo
  facebookUrl: string;
  twitterUsername: string;                   // Without @ prefix
  instagramUrl: string;
  linkedinUrl: string;
  youtubeUrl: string;
  pinterestUrl: string;
  defaultOgImage: string;                   // Fallback OG image URL
  twitterCardType: "summary" | "summary_large_image";
  facebookAppId: string;
}
```

#### `robots` Key - `SeoRobotsSettings`

```typescript
interface SeoRobotsSettings {
  customRules: string;                      // Raw robots.txt content (user-editable)
  siteNoindex: boolean;                     // "Discourage search engines" (entire site noindex)
  blockAiBots: boolean;                     // Add Disallow for GPTBot, CCBot, etc.
}
```

#### `schema` Key - `SeoSchemaSettings`

```typescript
interface SeoSchemaSettings {
  representType: "organization" | "person";
  organizationName: string;
  organizationLogoUrl: string;
  personName: string;
  personImageUrl: string;
  defaultArticleType: "Article" | "BlogPosting" | "NewsArticle" | "TechArticle";
  defaultPageType: "WebPage" | "AboutPage" | "ContactPage" | "FAQPage" | "CollectionPage" | "ItemPage" | "ProfilePage" | "SearchResultsPage" | "CheckoutPage";
  sitelinksSearchBox: boolean;
}
```

#### `breadcrumbs` Key - `SeoBreadcrumbSettings`

```typescript
interface SeoBreadcrumbSettings {
  enabled: boolean;                          // Default: true
  separator: string;                         // Default: ">"
  homeAnchorText: string;                    // Default: "Home"
  showBlogPage: boolean;                     // Include /blog in breadcrumb trail
  boldLastItem: boolean;                     // Bold the current page in breadcrumb
}
```

#### `verification` Key - `SeoVerificationSettings`

```typescript
interface SeoVerificationSettings {
  googleSiteVerification: string;
  bingSiteVerification: string;
  pinterestVerification: string;
  yandexVerification: string;
}
```

#### `advanced` Key - `SeoAdvancedSettings`

```typescript
interface SeoAdvancedSettings {
  stripCategoryBase: boolean;                // Default: false
  redirectAttachmentUrls: boolean;           // Default: true
  cleanPermalinkFragments: boolean;          // Default: true
  nofollowExternalLinks: boolean;            // Default: false
  openExternalLinksNewTab: boolean;          // Default: false
}
```

### Per-Post SEO Metadata (via `postMeta` Table)

The SEO System stores per-post/page SEO data in the shared `postMeta` table (defined by the Post System). This mirrors WordPress's `wp_postmeta` pattern where Yoast SEO stores `_yoast_wpseo_*` keys.

| Meta Key | Value Type | Description | Default Behavior | Max Length |
|----------|-----------|-------------|-----------------|-----------|
| `_seo_title` | `string` | Custom SEO title override | Falls back to title template | 200 chars (warn >60) |
| `_seo_description` | `string` | Custom meta description | Falls back to excerpt or first 160 chars | 500 chars (warn >160, <120) |
| `_seo_focus_keyphrase` | `string` | Primary focus keyphrase | Empty (no keyphrase targeted) | 100 chars |
| `_seo_additional_keyphrases` | `string` (JSON array) | Additional keyphrases | Empty array | N/A |
| `_seo_canonical` | `string` | Canonical URL override | Falls back to post permalink | 2000 chars (must be valid URL) |
| `_seo_noindex` | `string` ("true"/"false") | Exclude from indexing | Falls back to content type default | N/A |
| `_seo_nofollow` | `string` ("true"/"false") | Don't follow links | Default: "false" | N/A |
| `_seo_og_title` | `string` | Open Graph title override | Falls back to `_seo_title`, then post title | N/A |
| `_seo_og_description` | `string` | Open Graph description override | Falls back to `_seo_description` | N/A |
| `_seo_og_image` | `string` | Open Graph image URL override | Falls back to featured image, then default OG | 2000 chars (valid URL, 1200x630 recommended) |
| `_seo_twitter_title` | `string` | Twitter Card title override | Falls back to OG title chain | N/A |
| `_seo_twitter_description` | `string` | Twitter Card description override | Falls back to OG description chain | N/A |
| `_seo_twitter_image` | `string` | Twitter Card image override | Falls back to OG image chain | 2000 chars (valid URL, 1200x628 recommended) |
| `_seo_schema_type` | `string` | Schema.org page type override | Falls back to `seoSettings.schema.defaultPageType` | N/A |
| `_seo_schema_article_type` | `string` | Schema.org article type override | Falls back to `seoSettings.schema.defaultArticleType` | N/A |
| `_seo_score` | `string` (number 0-100) | Computed SEO score | Computed client-side, stored on save | 3 chars |
| `_seo_readability_score` | `string` (number 0-100) | Computed readability score | Computed client-side, stored on save | 3 chars |
| `_seo_cornerstone` | `string` ("true"/"false") | Cornerstone content flag | Default: "false" | N/A |

### Indexes

| Index | Table | Fields | Purpose |
|-------|-------|--------|---------|
| `by_key` | `seoSettings` | `["key"]` | Unique lookup of global settings by key name |
| `by_post` | `postMeta` (Post System) | `["postId"]` | Fetch all meta rows for a post, then filter for `_seo_*` keys |
| `by_key` | `postMeta` (Post System) | `["key"]` | Find all posts with a specific meta key (e.g., duplicate keyphrase check) |

### Relationships

- **`seoSettings`** is a standalone table with no foreign keys.
- **Per-post SEO data** lives in the `postMeta` table (owned by the Post System). The `postMeta.postId` field references `posts._id`.
- **Post data** (title, slug, content, excerpt, featuredImageUrl, publishedAt, updatedAt) is read from the `posts` table for fallback resolution and JSON-LD generation.
- **Author data** (name, profile URL) is read from the `users` table for Article schema `author` field.

---

## Actions & Functions

### Mutations

#### `seo.update_post` - Update Post SEO Metadata

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Convex Function:** `mutations/seo.updatePostSeo`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** `seo.update_post` (plus ownership checks via `seo.edit_post` meta-capability)
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    focusKeyphrase: v.optional(v.string()),
    additionalKeyphrases: v.optional(v.array(v.string())),
    canonical: v.optional(v.string()),
    noindex: v.optional(v.boolean()),
    nofollow: v.optional(v.boolean()),
    ogTitle: v.optional(v.string()),
    ogDescription: v.optional(v.string()),
    ogImage: v.optional(v.string()),
    twitterTitle: v.optional(v.string()),
    twitterDescription: v.optional(v.string()),
    twitterImage: v.optional(v.string()),
    schemaType: v.optional(v.string()),
    schemaArticleType: v.optional(v.string()),
    seoScore: v.optional(v.number()),
    readabilityScore: v.optional(v.number()),
    cornerstone: v.optional(v.boolean()),
  }
  ```
- **Returns:** `{ success: true, updatedKeys: string[] }`
- **Behavior:**
  1. Authenticate user via auth identity.
  2. Fetch the post by `postId`. If not found, throw `NOT_FOUND`.
  3. **Capability checks** via `checkPostCapability(ctx, userId, post, "edit")`:
     - Own post: `edit_posts` required.
     - Others' post: `edit_others_posts` required.
     - Published post: `edit_published_posts` additionally required.
  4. **Validate inputs:**
     - `seoTitle`: Max 200 chars, trim whitespace.
     - `seoDescription`: Max 500 chars, trim whitespace.
     - `focusKeyphrase`: Max 100 chars, trim.
     - `canonical`: Must be valid absolute URL if provided.
     - `ogImage`, `twitterImage`: Must be valid URLs if provided.
     - `seoScore`, `readabilityScore`: Must be integers 0-100.
     - `schemaType`: Must be valid Schema.org page type.
     - `schemaArticleType`: Must be valid Schema.org article type.
  5. Build a map of changes: `{ field, oldValue, newValue }` for each non-undefined input.
  6. **Upsert postMeta rows:** For each provided field, upsert the row with matching `postId` + `key`:
     - `seoTitle` -> `_seo_title`
     - `seoDescription` -> `_seo_description`
     - `focusKeyphrase` -> `_seo_focus_keyphrase`
     - `additionalKeyphrases` -> `_seo_additional_keyphrases` (JSON.stringify)
     - `canonical` -> `_seo_canonical`
     - `noindex` -> `_seo_noindex` (String(value))
     - `nofollow` -> `_seo_nofollow` (String(value))
     - `ogTitle` -> `_seo_og_title`
     - `ogDescription` -> `_seo_og_description`
     - `ogImage` -> `_seo_og_image`
     - `twitterTitle` -> `_seo_twitter_title`
     - `twitterDescription` -> `_seo_twitter_description`
     - `twitterImage` -> `_seo_twitter_image`
     - `schemaType` -> `_seo_schema_type`
     - `schemaArticleType` -> `_seo_schema_article_type`
     - `seoScore` -> `_seo_score` (String(value))
     - `readabilityScore` -> `_seo_readability_score` (String(value))
     - `cornerstone` -> `_seo_cornerstone` (String(value))
  7. If a field value is empty string `""`, delete the corresponding `postMeta` row (revert to default/template behavior).
  8. Emit event: `seo.updated` with payload `{ postId, changes[] }`.
  9. Return `{ success: true, updatedKeys: string[] }`.
- **Events:** `seo.updated`
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated.
  - `NOT_FOUND`: Post does not exist.
  - `FORBIDDEN`: User lacks capability to edit the post.
  - `VALIDATION_ERROR`: `canonical` is not a valid URL.
  - `VALIDATION_ERROR`: `seoTitle` exceeds 200 characters.
  - `VALIDATION_ERROR`: `seoScore` or `readabilityScore` outside 0-100 range.

---

#### `seo.update_global` - Update Global SEO Settings

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Convex Function:** `mutations/seo.updateGlobal`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** `seo.update_global` (Administrator only)
- **Args:**
  ```typescript
  {
    key: v.union(
      v.literal("titles"),
      v.literal("social"),
      v.literal("robots"),
      v.literal("schema"),
      v.literal("breadcrumbs"),
      v.literal("verification"),
      v.literal("advanced"),
    ),
    value: v.string(),  // JSON-encoded setting object
  }
  ```
- **Returns:** `{ success: true, key: string }`
- **Behavior:**
  1. Authenticate user via auth identity.
  2. Check capability: `manage_options`.
  3. Validate `key` is one of the known settings keys.
  4. Parse and validate `value` as JSON against the expected shape for the given key:
     - `titles.separator`: Max 3 chars.
     - `social.twitterCardType`: Must be `"summary"` or `"summary_large_image"`.
     - `social.defaultOgImage`: Must be a valid URL.
     - `robots.customRules`: Max 10,000 chars.
     - `verification.*`: Max 200 chars each.
     - `schema.representType`: Must be `"organization"` or `"person"`.
  5. Upsert the `seoSettings` row: find by `by_key` index, update `value`, `updatedAt`, `updatedBy`. If no row exists, insert new.
  6. Return `{ success: true, key }`.
- **Events:** None (tracked by Audit Log System via generic settings change detection).
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated.
  - `FORBIDDEN`: User lacks `manage_options`.
  - `VALIDATION_ERROR`: `value` is not valid JSON.
  - `VALIDATION_ERROR`: `value` does not match expected schema for the key.

---

#### `seo.update_robots` - Update Robots.txt Configuration

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Convex Function:** `mutations/seo.updateRobots`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** `seo.update_robots` (Administrator only)
- **Args:**
  ```typescript
  {
    customRules: v.optional(v.string()),
    siteNoindex: v.optional(v.boolean()),
    blockAiBots: v.optional(v.boolean()),
  }
  ```
- **Returns:** `{ success: true }`
- **Behavior:**
  1. Authenticate user via auth identity.
  2. Check capability: `manage_options`.
  3. Validate: `customRules` max 10,000 chars, basic robots.txt syntax check (lenient).
  4. Read current `seoSettings` row with `key: "robots"`, parse existing value.
  5. Merge provided fields into existing settings.
  6. **If `siteNoindex` changed to `true`**, log a prominent audit warning: "CAUTION: Site-wide noindex enabled."
  7. Update `seoSettings` row.
  8. Return `{ success: true }`.
- **Events:** None (tracked by Audit Log via settings change detection).
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated.
  - `FORBIDDEN`: User is not Administrator.
  - `VALIDATION_ERROR`: `customRules` exceeds 10,000 characters.

---

#### `seo.generate_sitemap` - Trigger Sitemap Regeneration

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Convex Function:** `mutations/seo.generateSitemap`
- **Type:** Mutation (delegates to Sitemap System)
- **Auth:** Required
- **Capabilities:** `seo.generate_sitemap` (Administrator only)
- **Args:** `{}`
- **Returns:** `{ success: true, message: "Sitemap regeneration started" }`
- **Behavior:**
  1. Authenticate user via auth identity.
  2. Check capability: `seo.generate_sitemap`.
  3. Call `internal.sitemap.regenerate`.
  4. The Sitemap System queries all published posts/pages, respects `_seo_noindex` flags.
  5. Emit event: `seo.sitemap_generated` with payload `{ url: "/sitemap.xml", pageCount }`.
  6. Return success.
- **Events:** `seo.sitemap_generated`
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated.
  - `FORBIDDEN`: User is not Administrator.
  - `INTERNAL_ERROR`: Sitemap System not available.

---

### Queries

#### `seo.getSettings` - Read Global SEO Settings

- **Convex Function:** `queries/seo.getSettings`
- **Type:** Query
- **Auth:** Public (specific keys), Administrator (all keys)
- **Args:**
  ```typescript
  {
    key: v.optional(v.union(
      v.literal("titles"),
      v.literal("social"),
      v.literal("robots"),
      v.literal("schema"),
      v.literal("breadcrumbs"),
      v.literal("verification"),
      v.literal("advanced"),
    )),
  }
  ```
- **Returns:** Parsed JSON value with defaults merged (single key), or merged object (all keys).
- **Behavior:**
  1. If `key` provided, fetch single `seoSettings` row by `by_key` index. Return parsed JSON with defaults merged.
  2. If no `key`, fetch all rows and return as merged `SeoSettings` object.
  3. Missing keys or missing fields return sensible defaults.
  4. For public website queries: only `titles`, `social`, `schema`, `breadcrumbs`, `verification` are accessible. `robots` and `advanced` require admin auth.

---

#### `seo.getPostSeo` - Read Post SEO Metadata

- **Convex Function:** `queries/seo.getPostSeo`
- **Type:** Query
- **Auth:** Public (published posts for website rendering), Authenticated (admin editor)
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
  }
  ```
- **Returns:** `PostSeoData` (structured object with all SEO fields, nulls for unset fields).
- **Behavior:**
  1. Query all `postMeta` rows for the given `postId` where `key` starts with `_seo_`.
  2. Parse and return as structured `PostSeoData` object.
  3. Consumers apply the fallback chain (see `resolvePostSeo` helper).
  4. Returns empty/default `PostSeoData` if post has no SEO metadata.

---

#### `seo.getRobotsTxt` - Generate Robots.txt Content

- **Convex Function:** `queries/seo.getRobotsTxt`
- **Type:** Query (public)
- **Auth:** Public
- **Args:** `{}`
- **Returns:** `string` (robots.txt content)
- **Behavior:**
  1. Fetch `seoSettings` with `key: "robots"`.
  2. Build robots.txt content:
     - `User-agent: *`
     - If `siteNoindex`: `Disallow: /`; else: `Disallow: /admin/` + `Allow: /`
     - If `blockAiBots`: Add `Disallow: /` for GPTBot, CCBot, Google-Extended, anthropic-ai
     - Append `customRules` if present
     - Append `Sitemap: {siteUrl}/sitemap.xml`
  3. Returns sensible default if no settings exist.

---

#### `seo.getSeoOverview` - Aggregate SEO Statistics (Dashboard)

- **Convex Function:** `queries/seo.getSeoOverview`
- **Type:** Query
- **Auth:** Required (Administrator)
- **Args:** `{}`
- **Returns:** Aggregate statistics: posts by SEO score range, posts without meta description, posts marked noindex, cornerstone content count.
- **Behavior:**
  1. Query all published posts.
  2. For each, check `postMeta` for SEO score, meta description, noindex, cornerstone.
  3. Group into score ranges: Good (70-100), OK (40-69), Poor (0-39), No Data.
  4. Count issues: missing descriptions, missing keyphrases, long titles, noindex posts with internal links.
  5. Return structured overview object.

---

### Helper Functions

#### `resolvePostSeo` - Resolve SEO Fields with Fallback Chain

```typescript
// convex/helpers/seo.ts
export function resolvePostSeo(
  post: Doc<"posts">,
  postSeo: PostSeoData,
  globalSettings: SeoSettings,
  siteUrl: string,
): ResolvedSeoData
```

Resolution order for each field:
- **title:** custom `_seo_title` -> template from `seoSettings.titles` -> `"{post.title} {sep} {siteName}"`
- **description:** custom `_seo_description` -> `post.excerpt` -> first 160 chars of content
- **canonical:** custom `_seo_canonical` -> `"{siteUrl}/blog/{post.slug}"`
- **noindex:** custom `_seo_noindex` -> `seoSettings.titles.postNoindex` -> `false`
- **ogTitle:** custom `_seo_og_title` -> resolved title -> `post.title`
- **ogImage:** custom `_seo_og_image` -> `post.featuredImageUrl` -> `seoSettings.social.defaultOgImage` -> null
- **twitterTitle:** custom `_seo_twitter_title` -> resolved ogTitle -> resolved title
- And so on for all fields.

#### `buildJsonLd` - Build Schema.org JSON-LD Graph

```typescript
// convex/helpers/seoSchema.ts
export function buildJsonLd(
  post: Doc<"posts">,
  postSeo: PostSeoData,
  globalSettings: SeoSettings,
  siteUrl: string,
  authorInfo: { name: string; url: string; imageUrl?: string },
): object[]
```

Builds a `@graph` array containing:
1. **WebSite** schema (always) - with optional SearchAction for sitelinks search box
2. **Organization** or **Person** schema (based on `seoSettings.schema.representType`)
3. **Article/BlogPosting** or **WebPage** schema (based on post type and schema overrides)
4. **BreadcrumbList** schema

#### `applyTemplate` - Resolve Title Templates

```typescript
// convex/helpers/seoTemplate.ts
export function applyTemplate(
  template: string | undefined,
  variables: Record<string, string>,
): string | null
```

Supported template variables (Yoast-compatible):
- `%%title%%` - Post/page title
- `%%sitename%%` - Site name
- `%%sep%%` - Title separator
- `%%excerpt%%` - Post excerpt
- `%%date%%` - Post published date
- `%%modified%%` - Post modified date
- `%%name%%` - Author display name
- `%%term_title%%` - Taxonomy term name
- `%%searchphrase%%` - Search query
- `%%page%%` - Page number (pagination)
- `%%currentyear%%` - Current year
- `%%currentmonth%%` - Current month name

Unresolved variables are removed. Multiple spaces are collapsed.

#### `computeSeoScore` / `runSeoAnalysis` - Client-Side SEO Analysis

```typescript
// lib/seo/analysis.ts (client-side only, NOT a Convex function)
export function runSeoAnalysis(
  content: string,
  title: string,
  slug: string,
  excerpt: string,
  focusKeyphrase: string,
  metaTitle: string,
  metaDescription: string,
): { score: number; checks: SeoCheckResult[] }
```

**SEO Checks (14 checks):**
1. Keyphrase in SEO title (weight: 3)
2. Keyphrase in meta description (weight: 3)
3. Keyphrase in introduction / first paragraph (weight: 2)
4. Keyphrase in subheadings (weight: 1)
5. Keyphrase density 0.5-3% (weight: 2)
6. Keyphrase in URL/slug (weight: 2)
7. Keyphrase in image alt text (weight: 1)
8. SEO title length 50-60 chars (weight: 2)
9. Meta description length 120-156 chars (weight: 2)
10. Content length 300+ words (weight: 2)
11. Internal links present (weight: 1)
12. External/outbound links present (weight: 1)
13. Image alt attributes filled (weight: 1)
14. Previously used keyphrase check (weight: 2)

**Readability Checks (8 checks):**
1. Flesch reading ease (target: 60-70+)
2. Paragraph length (max ~150 words)
3. Sentence length (max 20 words)
4. Passive voice (max 10% of sentences)
5. Transition words (min 30% of sentences)
6. Consecutive sentences starting with same word
7. Subheading distribution (every ~300 words)
8. Text presence (not just images/embeds)

**Scoring:** Weighted calculation -- each check contributes `weight * multiplier` where multiplier is 3 (good), 2 (ok), 0 (poor). Final score = `(actual / max) * 100`.

---

## Events

### `seo.updated`

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Type:** Content
- **Triggered By:** `seo.update_post` action
- **Payload:**
  ```typescript
  {
    postId: Id<"posts">,
    changes: Array<{
      field: string,           // Meta key (e.g., "_seo_title")
      oldValue: string | null,
      newValue: string | null,
    }>,
  }
  ```
- **Subscribers:**
  - **Audit Log System:** Records which SEO fields were changed, by whom, on which post.
  - **Site Notification System:** Shows info toast "SEO metadata updated for '{title}'" (auto-dismiss 5s).
  - **Sitemap System:** If `_seo_noindex` changed, triggers sitemap regeneration.

### `seo.sitemap_generated`

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Type:** System
- **Triggered By:** `seo.generate_sitemap` action (manual), Sitemap System auto-regeneration
- **Payload:**
  ```typescript
  {
    url: string,               // e.g., "/sitemap.xml"
    pageCount: number,
  }
  ```
- **Subscribers:**
  - **Email Notification System:** Sends "Sitemap Generated" email to admins (batched, manual triggers only).
  - **Site Notification System:** Shows success toast "XML sitemap regenerated ({count} pages)".
  - **Audit Log System:** Records sitemap regeneration event.

---

## Admin Routes & UI

### SEO Overview (`/admin/seo`)

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Purpose:** Dashboard showing overall SEO health. Equivalent to Yoast SEO's dashboard page.
- **WordPress Equivalent:** Yoast SEO > General > Dashboard
- **Layout:** Admin layout with sidebar + topbar. Page header "SEO" with "Settings" button.
- **Key Components:**
  - **SeoOverviewDashboard** - Container for all dashboard cards
  - **SeoScoreChart** - Donut/pie chart: Good (70-100, green), OK (40-69, orange), Poor (0-39, red), No Data (gray). Click to filter table.
  - **Issues Card** - Count of posts with poor/ok/good scores; total indexed vs total posts.
  - **Cornerstone Content Card** - Count of cornerstone posts, "View All" link.
  - **SeoIssuesList** - Actionable items: posts without meta description, missing keyphrases, long titles, noindex posts with internal links. Each item links to post editor.
  - **SeoRecentTable** - Posts with recently updated SEO: Title (link), SEO Score (visual bar), Readability Score (visual bar), Last Updated. Paginated 10/page, sorted by most recently updated.
- **Data Requirements:** `seo.getSettings`, `seo.getSeoOverview`, `posts.list`
- **User Interactions:** Click "Settings" -> `/admin/seo/settings`. Click post title -> post editor SEO tab. Click chart segments -> filter table.
- **Real-Time:** Dashboard updates reactively as posts' SEO metadata changes.

### SEO Settings (`/admin/seo/settings`)

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Purpose:** Central configuration for all site-wide SEO settings. Combined Yoast Search Appearance + Social + Tools.
- **WordPress Equivalent:** Yoast SEO > Search Appearance + Social + Tools
- **Layout:** Tabbed interface with 8 tabs. Tab navigation is URL-based (`?tab=social`).
- **Key Components:**
  - **SeoSettingsForm** - Tabbed form container
  - **SeoSettingsGeneral** - Title separator (preset buttons + custom), site title override, tagline, homepage title template with live preview, homepage meta description with char counter.
  - **SeoSettingsContentTypes** - Title templates + noindex defaults for: posts, pages, categories, tags, author archives, date archives. Each with live template preview.
  - **SeoSettingsSocial** - Organization name, logo (media picker), social profile URLs (Facebook, Twitter, Instagram, LinkedIn, YouTube, Pinterest), default OG image (media picker), Facebook App ID, default Twitter card type.
  - **SeoSettingsSchema** - Organization vs Person radio, conditional fields, default article/page type dropdowns, sitelinks search box toggle.
  - **SeoSettingsBreadcrumbs** - Enable toggle, separator char, home anchor text, show blog page toggle, bold last item toggle.
  - **SeoSettingsVerification** - Google, Bing, Pinterest, Yandex verification code inputs (max 200 chars each).
  - **SeoSettingsRobots** - Live preview of rendered robots.txt, "Discourage search engines" checkbox with RED WARNING BANNER, "Block AI crawlers" checkbox, custom rules textarea, Preview/Save buttons.
  - **SeoSettingsAdvanced** - Strip category base, redirect attachment pages, clean permalink fragments, nofollow external links, open external links in new tab.
- **Data Requirements:** `seo.getSettings` (all keys)
- **User Interactions:** Each tab has "Save Changes" button. Template fields show live preview. Media picker buttons for images/logos. Inline validation errors.
- **Real-Time:** Settings subscription updates if changed elsewhere.

### Post Editor SEO Metabox (Component, not standalone route)

Integrated into `/admin/posts/$postId/edit` and `/admin/pages/$pageId/edit` as a collapsible panel below the content editor.

- **Key Components:**
  - **SeoMetabox** - Container with 4 tabs: SEO, Readability, Schema, Social
  - **SeoMetaboxSeoTab** - Focus keyphrase input, SERP preview (SerpPreview), SEO title input with template variables + char counter (TemplateVariableInput + CharacterCounter), slug display, meta description textarea with char counter, advanced section (cornerstone toggle, canonical URL, noindex/nofollow), SEO analysis results (SeoAnalysisResults).
  - **SeoMetaboxReadabilityTab** - Readability score badge, readability check results list.
  - **SeoMetaboxSchemaTab** - Page type dropdown (9 options), article type dropdown (5 options).
  - **SeoMetaboxSocialTab** - Facebook preview card (FacebookPreview), OG title/description/image overrides with media picker, Twitter preview card (TwitterPreview), Twitter title/description/image overrides with media picker.
  - **SerpPreview** - Live Google SERP snippet: URL breadcrumb, SEO title, meta description. Shows truncation indicators.
  - **SeoScoreBadge** - Color-coded: green (70-100), orange (40-69), red (0-39), gray (N/A).
  - **CharacterCounter** - Shows current/recommended with color coding: green (optimal), orange (acceptable), red (too short/long).
- **Data Requirements:** `seo.getPostSeo`, `seo.getSettings`
- **Real-Time:** Analysis runs client-side on every content change (debounced 1 second). SERP and social previews update in real-time. Focus keyphrase triggers re-analysis (debounced 500ms). Duplicate keyphrase warning queries `postMeta`.

---

## Website Routes

### Robots.txt (`/robots.txt`)

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Purpose:** Serve dynamically generated robots.txt file.
- **SEO:** N/A (this IS the SEO mechanism)
- **Data Requirements:** `seo.getRobotsTxt` query
- **Caching:** `Cache-Control: public, max-age=3600` (1 hour). `Content-Type: text/plain`.
- **Implementation:** TanStack Start API route handler.

### SEO Head Rendering (all website pages)

- **Purpose:** Render meta tags, Open Graph, Twitter Cards, JSON-LD, verification codes in `<head>`.
- **Implementation:** `SeoHead` component rendered in website layout.
- **Data Requirements:** `seo.getPostSeo` (for post/page routes), `seo.getSettings` (for all routes).
- **Caching:** Data fetched during SSR. Consider short TTL cache for static content.

**For Single Post (`/blog/$slug`):**
- Full meta tags: title, description, canonical, robots
- Open Graph: type=article, title, description, image, url, site_name, published_time, modified_time, author
- Twitter Card: card type, title, description, image, site
- Verification meta tags
- JSON-LD graph: WebSite + Organization/Person + BlogPosting/Article + BreadcrumbList

**For Single Page (`/$slug`):**
- Same as post but: og:type=website, Schema.org WebPage, URL pattern `/$slug`

**For Blog Index (`/blog`):**
- og:type=website, title from homepage/blog template, description from settings

**For Archive Pages (`/category/$slug`, `/tag/$slug`, `/author/$slug`):**
- Title from archive templates, noindex per content type settings, canonical with pagination

### Breadcrumbs Component

- **Purpose:** Schema-annotated breadcrumb trail.
- **Rendered:** On single posts/pages (if enabled in settings).
- **Format:** `Home > Blog > Category > Post Title` with accompanying BreadcrumbList JSON-LD.
- **Implementation:** `<Breadcrumbs>` React component with `<nav aria-label="Breadcrumb">`.

### Single Post SEO Integration (`/blog/$slug`)

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Purpose:** Enriches Single Post page with resolved meta tags, JSON-LD, breadcrumbs.
- **Data Requirements:** `seo.getPostSeo`, `seo.getSettings`

### Single Page SEO Integration (`/$slug`)

- **Airtable Record:** `[redacted-airtable-record-id]`
- **Purpose:** Same as Single Post but for pages with different URL pattern and schema type.

---

## Notifications

### Email Notifications

| Name | Event | Recipients | Priority | Subject |
|------|-------|------------|----------|---------|
| Sitemap Generated (`[redacted-airtable-record-id]`) | `seo.sitemap_generated` | All Administrators | Batched | "Sitemap updated successfully" |

**Body:** Notification of regeneration, page count, link to sitemap, timestamp. Only sent for manual triggers. Respects admin notification preferences.

### Site Notifications

| Name | Event | Type | Persistent | Recipients |
|------|-------|------|-----------|------------|
| SEO Updated (`[redacted-airtable-record-id]`) | `seo.updated` | Info (blue) | No (toast, 5s auto-dismiss) | The user who updated SEO |
| Sitemap Regenerated (`[redacted-airtable-record-id]`) | `seo.sitemap_generated` | Success (green) | No (toast) | All Administrators |

**Sitemap notification actions:** "View Sitemap" link (opens `/sitemap.xml` in new tab), Dismiss.

---

## Role & Capability Matrix

| Action | Administrator | Editor | Author | Contributor | Subscriber |
|--------|:---:|:---:|:---:|:---:|:---:|
| View SEO Overview | Yes | No | No | No | No |
| Edit Global SEO Settings | Yes | No | No | No | No |
| Edit Robots.txt | Yes | No | No | No | No |
| Trigger Sitemap Regeneration | Yes | No | No | No | No |
| Edit Own Post SEO | Yes | Yes | Yes | No | No |
| Edit Others' Post SEO | Yes | Yes | No | No | No |
| Edit Own Page SEO | Yes | Yes | No | No | No |
| Edit Others' Page SEO | Yes | Yes | No | No | No |
| View SEO Metabox in Editor | Yes | Yes | Yes | No | No |

**Why Contributors cannot edit SEO:** Contributors can create posts but cannot publish them. SEO metadata only matters for published content. This matches Yoast SEO's behavior.

The SEO System defines its own namespaced capabilities (registered in `types/capabilities.ts`):
- **`seo.update_post`** - Edit per-post/page SEO metadata (Editor, Author roles)
- **`seo.update_global`** - Edit global SEO settings (Administrator only)
- **`seo.update_robots`** - Edit robots.txt configuration (Administrator only)
- **`seo.generate_sitemap`** - Trigger sitemap regeneration (Administrator only)
- **`seo.edit_post`** - Meta-capability that resolves to `seo.update_post` with ownership checks

---

## Dependencies

### Depends On

| System | Type | Details |
|--------|------|---------|
| **Post System** | Hard | SEO metadata lives in `postMeta` table. Post data (title, slug, content, excerpt, featuredImageUrl) needed for fallback chains and analysis. Posts are the primary entity SEO attaches to. |
| **Page System** | Hard | Pages also have SEO metadata in `postMeta`. Same rendering pipeline as posts. |
| **Auth System** | Hard | User authentication via Convex Auth. Every mutation requires identity via `ctx.auth.getUserIdentity()`. |
| **Role & Capability System** | Hard | Capability checks for editing SEO metadata (`edit_posts`, `edit_others_posts`, `edit_published_posts`) and managing settings (`manage_options`). |
| **Settings System** | Medium | Site title, tagline, and site URL come from the Settings System. SEO title templates reference these. |
| **Media System** | Medium | Media picker for selecting OG images, Twitter images, organization logos. Featured image fallback for OG images. |
| **Event Dispatcher System** | Medium | SEO events (`seo.updated`, `seo.sitemap_generated`) dispatched through the event system for audit logging, notifications, and sitemap triggers. |

### Depended On By

| System | Type | Details |
|--------|------|---------|
| **Sitemap System** | Hard | Respects per-post `_seo_noindex` flags when generating XML sitemap. Sitemap regeneration triggered by SEO System. |
| **RSS Feed System** | Soft | May use SEO descriptions for feed item descriptions. |
| **Search System** | Soft | May use SEO title and description for search result display. |

### External Dependencies

| Dependency | Purpose |
|-----------|---------|
| **Convex Auth** | User identity for auth checks and recording who updated SEO |
| **Convex** | Database storage for `seoSettings` and `postMeta` tables, reactive queries |
| **Resend** | Email delivery for sitemap generation notification |

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/convex/)

- [ ] `convex/schema.ts` - Add `seoSettings` table definition (1 new table)
- [ ] `convex/seo/queries.ts` - 4 queries: `getSettings`, `getPostSeo`, `getRobotsTxt`, `getSeoOverview`
- [ ] `convex/seo/mutations.ts` - 4 mutations: `updatePostSeo`, `updateGlobal`, `updateRobots`, `generateSitemap`
- [ ] `convex/seo/validators.ts` - Shared argument validators (schema types, social settings, URL validation)
- [ ] `convex/helpers/seo.ts` - `resolvePostSeo()` fallback chain resolution
- [ ] `convex/helpers/seoSchema.ts` - `buildJsonLd()` Schema.org graph builder
- [ ] `convex/helpers/seoTemplate.ts` - `applyTemplate()` template variable resolution

### Admin Frontend (ConvexPress-Admin/apps/web/src/)

**Routes:**
- [ ] `src/routes/admin/seo/index.tsx` - SEO Overview dashboard
- [ ] `src/routes/admin/seo/settings.tsx` - Global SEO settings

**Components (20 components):**
- [ ] `src/components/seo/SeoOverviewDashboard.tsx`
- [ ] `src/components/seo/SeoScoreChart.tsx`
- [ ] `src/components/seo/SeoIssuesList.tsx`
- [ ] `src/components/seo/SeoRecentTable.tsx`
- [ ] `src/components/seo/SeoSettingsForm.tsx`
- [ ] `src/components/seo/SeoSettingsGeneral.tsx`
- [ ] `src/components/seo/SeoSettingsContentTypes.tsx`
- [ ] `src/components/seo/SeoSettingsSocial.tsx`
- [ ] `src/components/seo/SeoSettingsSchema.tsx`
- [ ] `src/components/seo/SeoSettingsBreadcrumbs.tsx`
- [ ] `src/components/seo/SeoSettingsVerification.tsx`
- [ ] `src/components/seo/SeoSettingsRobots.tsx`
- [ ] `src/components/seo/SeoSettingsAdvanced.tsx`
- [ ] `src/components/seo/SeoMetabox.tsx`
- [ ] `src/components/seo/SeoMetaboxSeoTab.tsx`
- [ ] `src/components/seo/SeoMetaboxReadabilityTab.tsx`
- [ ] `src/components/seo/SeoMetaboxSchemaTab.tsx`
- [ ] `src/components/seo/SeoMetaboxSocialTab.tsx`
- [ ] `src/components/seo/SerpPreview.tsx`
- [ ] `src/components/seo/FacebookPreview.tsx`
- [ ] `src/components/seo/TwitterPreview.tsx`
- [ ] `src/components/seo/SeoScoreBadge.tsx`
- [ ] `src/components/seo/SeoAnalysisResults.tsx`
- [ ] `src/components/seo/CharacterCounter.tsx`
- [ ] `src/components/seo/TemplateVariableInput.tsx`

**Hooks (5 hooks):**
- [ ] `src/hooks/seo/useSeoSettings.ts`
- [ ] `src/hooks/seo/usePostSeo.ts`
- [ ] `src/hooks/seo/useSeoMutations.ts`
- [ ] `src/hooks/seo/useSeoAnalysis.ts`
- [ ] `src/hooks/seo/useReadabilityAnalysis.ts`

**Lib (6 modules):**
- [ ] `src/lib/seo/types.ts`
- [ ] `src/lib/seo/constants.ts`
- [ ] `src/lib/seo/analysis.ts`
- [ ] `src/lib/seo/readability.ts`
- [ ] `src/lib/seo/templates.ts`
- [ ] `src/lib/seo/utils.ts`

### Website Frontend (ConvexPress-Website/apps/web/src/)

**Routes:**
- [ ] `src/routes/robots.txt.ts` - API route serving robots.txt

**Components (3 components):**
- [ ] `src/components/seo/SeoHead.tsx`
- [ ] `src/components/seo/Breadcrumbs.tsx`
- [ ] `src/components/seo/JsonLd.tsx`

**Lib (4 modules):**
- [ ] `src/lib/seo/types.ts`
- [ ] `src/lib/seo/resolve.ts`
- [ ] `src/lib/seo/jsonld.ts`
- [ ] `src/lib/seo/breadcrumbs.ts`

---

## Edge Cases & Gotchas

1. **Empty Focus Keyphrase:** User does not enter a keyphrase. Show neutral message "No focus keyphrase set." SEO score shows as N/A (gray). Post can still be published -- this is a recommendation, not a requirement.

2. **Duplicate Focus Keyphrase:** Two posts target the same keyphrase. Show a warning: "This keyphrase has been used on: [Post Title]." Do NOT block saving. Query `postMeta.by_key` index where `key: "_seo_focus_keyphrase"` and `value: keyphrase`.

3. **Very Long Content (10,000+ words):** Client-side analysis must be debounced (1 second after typing stops). Run analysis on plain text, not raw block editor JSON. Consider Web Worker to avoid UI jank. Use `requestIdleCallback` if available.

4. **No Featured Image and No Default OG Image:** OG image tag is omitted entirely (valid per OG spec). Social share previews show warning: "No image set. Social shares will show a default placeholder chosen by the platform."

5. **Site-Wide Noindex Enabled:** Show persistent RED BANNER at top of admin: "Your site is set to discourage search engines. This means your site will not appear in search results." robots.txt gets `Disallow: /` and all pages get `<meta name="robots" content="noindex">`. Matches WordPress "Discourage search engines" in Settings > Reading.

6. **Canonical URL Points to External Domain:** Allow it (valid for syndicated content). Show warning: "This canonical URL points to a different domain. Make sure this is intentional."

7. **Post is `noindex` but Linked Internally:** SEO overview dashboard flags: "Post is marked noindex but is linked from other published content." Informational, not blocking.

8. **Template Variables Resolve to Empty String:** If `%%title%%` resolves empty, the template yields "| Site Name". `applyTemplate` helper removes unresolved variables and collapses whitespace to prevent ugly titles.

9. **JSON-LD Validation Errors:** Missing Schema.org fields must not break the page. `buildJsonLd` gracefully omits undefined fields. Validate against Google's Rich Results Test expectations.

10. **Robots.txt Syntax Errors in Custom Rules:** Basic syntax validation on save. Invalid lines are preserved but highlighted with warning. Robots.txt parsers are lenient by spec.

11. **Empty String Field Values in `seo.update_post`:** When a field value is empty string `""`, DELETE the corresponding `postMeta` row to revert to default/template behavior. Do not store empty strings.

12. **Concurrent SEO Edits:** Two users editing the same post's SEO simultaneously. Convex transactions ensure consistency. Last write wins. The reactive subscription ensures both users see the latest data.

13. **SSR Meta Tag Rendering:** SEO data MUST be available during SSR. Ensure Convex loaders resolve before rendering. JSON-LD computation happens server-side during SSR. If data fails to load, render safe defaults (post title as meta title, no OG image) rather than breaking the page.

14. **Performance - SEO Overview Dashboard:** Aggregate queries (posts by score range) may be expensive on large sites. Consider a denormalized `seoOverview` document updated on each `seo.updated` event for instant dashboard loading.

---

## WordPress Functions Reference

| WordPress / Yoast | ConvexPress | Notes |
|-------------------|-------------|-------|
| `add_theme_support('title-tag')` | SSR `<title>` in `SeoHead` component | TanStack Start handles `<head>` management |
| `wp_title()` / `document_title_parts` filter | `applyTemplate()` + `resolvePostSeo()` | Template variable system replaces WordPress title filters |
| `rel_canonical()` | Canonical field in `SeoHead` | Fallback: post permalink |
| `wp_robots()` | `<meta name="robots">` in `SeoHead` | Based on noindex/nofollow fields and global settings |
| `do_robotstxt` action | `/robots.txt` TanStack Start API route | `seo.getRobotsTxt` query generates content |
| `_yoast_wpseo_title` meta key | `_seo_title` in `postMeta` | Direct field, not serialized PHP |
| `_yoast_wpseo_metadesc` | `_seo_description` in `postMeta` | |
| `_yoast_wpseo_focuskw` | `_seo_focus_keyphrase` in `postMeta` | |
| `_yoast_wpseo_canonical` | `_seo_canonical` in `postMeta` | |
| `_yoast_wpseo_meta-robots-noindex` | `_seo_noindex` in `postMeta` | Stored as "true"/"false" string |
| `_yoast_wpseo_opengraph-title` | `_seo_og_title` in `postMeta` | |
| `_yoast_wpseo_opengraph-image` | `_seo_og_image` in `postMeta` | |
| `_yoast_wpseo_twitter-title` | `_seo_twitter_title` in `postMeta` | |
| `_yoast_wpseo_linkdex` | `_seo_score` in `postMeta` | 0-100 integer, computed client-side |
| `_yoast_wpseo_content_score` | `_seo_readability_score` in `postMeta` | 0-100 integer, computed client-side |
| `wpseo_titles` option | `seoSettings` key `"titles"` | JSON value instead of serialized PHP array |
| `wpseo_social` option | `seoSettings` key `"social"` | |
| `wpseo` option | `seoSettings` key `"robots"` + `"advanced"` | Split into separate keys |
| `wpseo_title` filter | Direct field in `postMeta` | No filter hook; value stored directly |
| `wpseo_metadesc` filter | Direct field in `postMeta` | |
| `wpseo_schema_graph` filter | `buildJsonLd()` helper function | Computed, not filtered |
| `wpseo_breadcrumb_links` filter | `buildBreadcrumbItems()` in breadcrumbs helper | |
| `yoast_breadcrumb()` template tag | `<Breadcrumbs>` React component | With Schema.org JSON-LD |
| Yoast SEO > General > Dashboard | `/admin/seo` route | React SPA with Convex subscriptions |
| Yoast SEO > Search Appearance | `/admin/seo/settings` route | 8-tab settings form |
| Yoast Metabox in Post Editor | `SeoMetabox` component in post editor | Collapsible panel with 4 tabs |
