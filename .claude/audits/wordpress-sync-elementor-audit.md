# Elementor Support Audit — WordPress Sync System

**Auditor:** Claude Opus 4.6 (1M context)
**Date:** 2026-04-02
**Scope:** All files in `ConvexPress-Admin/packages/backend/convex/wordpressSync/`
**Verdict:** Solid foundation with significant gaps that will cause data loss for Elementor-heavy sites

---

## Executive Summary

The WordPress sync system has a dedicated Elementor parser (`helpers/elementor.ts`) with impressive widget-level text extraction, image URL extraction, and URL remapping capabilities. Both the posts and pages import phases detect Elementor data in post meta and store it. However, there are **5 critical issues** that will prevent Elementor content from being imported correctly on real WordPress sites.

---

## File Inventory

| File | Elementor Relevance |
|------|-------------------|
| `helpers/elementor.ts` | **Core** — Parser, text extraction, image extraction, URL remapping |
| `helpers/wpClient.ts` | **Critical gap** — `fetchWPPostMeta` cannot retrieve `_elementor_data` |
| `phases/posts.ts` | **Consumer** — Detects and stores Elementor data for posts |
| `phases/pages.ts` | **Consumer** — Detects and stores Elementor data for pages |
| `phases/media.ts` | **Indirect** — Does not extract images from Elementor data |
| `validators.ts` | **Reference** — Comment noting pages phase exists for Elementor handling |

---

## Finding 1: CRITICAL — `fetchWPPostMeta` cannot retrieve `_elementor_data`

**File:** `helpers/wpClient.ts`, lines 544-571
**Impact:** Elementor data will NEVER be imported

### The Problem

`fetchWPPostMeta` fetches the post via `GET /wp-json/wp/v2/posts/{id}?context=edit` and reads the `meta` property from the response. However, **WordPress REST API does not expose `_elementor_data` in the `meta` field by default**.

WordPress only exposes meta keys that have been explicitly registered with `register_post_meta()` and have `show_in_rest` set to `true`. Elementor does NOT register its meta keys for REST API exposure — `_elementor_data`, `_elementor_page_settings`, `_elementor_edit_mode`, etc. are all hidden from the REST API `meta` object.

This means `postMeta` will be an empty array (or contain only REST-visible meta keys), the `elementorMeta` find call in `processPostContent` will return `undefined`, and the Elementor branch is never entered.

### What Works

The code is well-structured and the fallback logic (lines 236-238 in `posts.ts`) correctly falls back to `wpPost.content.rendered` when no Elementor data is found — so posts/pages will still have *some* content. But it will be the rendered HTML fallback, not the structured Elementor layout data.

### Suggested Fix

The WordPress REST API requires one of these approaches to access `_elementor_data`:

**Option A: Custom REST endpoint** (recommended)
Add a custom WP REST endpoint or use the `WP All Export` compatible meta API. Create a `fetchWPPostMetaRaw` function that hits a custom endpoint (e.g., a WP plugin that exposes raw postmeta via `/wp-json/convexpress/v1/postmeta/{id}`).

**Option B: Use the WordPress database directly**
If the user provides database access, query `wp_postmeta` directly for `_elementor_data`.

**Option C: Register meta keys on the WordPress side**
Provide a small WP plugin for users to install that calls `register_post_meta('post', '_elementor_data', ['show_in_rest' => true, ...])` and similar for all Elementor keys.

**Option D: Use `WP-CLI` or XML export**
Parse the WordPress XML export file which includes all postmeta regardless of REST API visibility.

---

## Finding 2: CRITICAL — `fetchWPPostMeta` only queries the `posts` endpoint, not `pages`

**File:** `helpers/wpClient.ts`, lines 550-551
**Impact:** Page meta will always fail silently, returning empty array

### The Problem

`fetchWPPostMeta` hardcodes the endpoint as `posts/${postId}`:

```typescript
const result = await fetchWPEndpoint<WPPost>(config, `posts/${postId}`, {
  context: "edit",
});
```

When called from the pages import phase (`phases/pages.ts`, line 88), this will hit `GET /wp-json/wp/v2/posts/{pageId}` — but pages live at `/wp-json/wp/v2/pages/{pageId}`. The call will return a 404, the `catch` block returns `[]`, and page meta is silently lost.

### What Works

The code in `phases/pages.ts` (line 85) correctly calls `fetchWPPostMeta(credentials, wpPage.id)` and has a try/catch that silently continues — so the import doesn't crash. But all page meta (Elementor, ACF, Yoast) is lost.

### Suggested Fix

Add a `postType` parameter to `fetchWPPostMeta`:

```typescript
export async function fetchWPPostMeta(
  config: WPClientConfig,
  postId: number,
  postType: "posts" | "pages" = "posts"
): Promise<WPMeta[]> {
  const result = await fetchWPEndpoint<WPPost>(config, `${postType}/${postId}`, {
    context: "edit",
  });
  // ...
}
```

Then update `phases/pages.ts` to pass `"pages"` as the third argument.

---

## Finding 3: MODERATE — Elementor image URLs are never extracted or remapped

**Files:** `helpers/elementor.ts` (lines 365-505), `phases/posts.ts`, `phases/pages.ts`, `phases/media.ts`
**Impact:** Images inside Elementor widgets will point to the old WordPress site

### The Problem

`elementor.ts` exports two powerful functions: `extractImageUrls()` and `remapElementorImageUrls()`. Neither is imported or called anywhere in the codebase.

The media import phase (`phases/media.ts`) downloads media from the WordPress media library. But Elementor widgets can reference images by URL — including images that may or may not be in the media library (e.g., external URLs, CDN URLs, or WordPress media URLs that need remapping to Convex storage URLs).

After media import completes, the Elementor JSON stored in `postMeta` still contains the original WordPress image URLs. There is no post-processing step to:
1. Extract image URLs from Elementor data
2. Map them to newly imported Convex storage URLs
3. Update the stored `_elementor_data` with remapped URLs

### What Works

- `extractImageUrls()` comprehensively covers: direct images, background images, galleries, slides, and dynamic `*_image`/`*_src` fields
- `remapElementorImageUrls()` correctly deep-clones data before mutation and handles all the same fields
- The URL remapping in `remapUrlsInSettings()` also handles string fields that contain URLs directly

### Suggested Fix

Add a post-import remapping step, either:
1. In the `cleanup` phase (currently a no-op), iterate over all imported posts/pages with `_elementor_data` meta, extract image URLs, build a URL mapping from the media import, and remap
2. Or integrate directly into the posts/pages import phase by extracting image URLs from Elementor data, matching them against imported media, and storing the remapped version

---

## Finding 4: MODERATE — Missing Elementor meta keys beyond `_elementor_data`

**Files:** `phases/posts.ts` (lines 128-141), `phases/pages.ts` (lines 142-163)
**Impact:** Elementor page settings, template type, and version info are lost

### The Problem

The posts import phase only stores `_elementor_data` and `_wp_content_rendered`. It does not look for or store:
- `_elementor_page_settings` — Page-level settings (layout, custom CSS, etc.)
- `_elementor_template_type` — Template type (useful for knowing if this is a header, footer, single template, etc.)
- `_elementor_version` — Elementor version used to create the content (important for compatibility)
- `_elementor_css` — Custom CSS generated by Elementor

The pages import phase additionally stores `_elementor_edit_mode` with a hardcoded value of `"builder"` (line 153-154), which is reasonable but should ideally come from the actual meta value.

### What Works

- Pages phase correctly stores `_elementor_edit_mode` (even if hardcoded)
- Both phases store `_wp_content_rendered` as fallback HTML

### Suggested Fix

After retrieving post meta, iterate over all `_elementor_*` prefixed meta keys and store each one:

```typescript
// Store all Elementor meta keys
for (const meta of postMeta) {
  if (meta.key.startsWith("_elementor_") && typeof meta.value === "string") {
    await ctx.runMutation(internal.wordpressSync.phases.postsCreateMeta, {
      postId,
      key: meta.key,
      value: meta.value,
    });
  }
}
```

---

## Finding 5: MINOR — Text extraction missing some Elementor Pro widgets

**File:** `helpers/elementor.ts`, lines 201-354
**Impact:** Some content won't be searchable or displayed in fallback mode

### The Problem

The `extractTextFromElement` function handles ~15 widget types explicitly plus a generic fallback. However, several common Elementor Pro widgets are missing:

- `form` — Form field labels and button text
- `posts` / `portfolio` — Dynamic content widgets (though these reference other posts, so text extraction may not apply)
- `nav-menu` — Navigation menu text
- `table-of-contents` — TOC headings
- `animated-headline` — Animated headline text
- `flip-box` — Front/back text content
- `hotspot` — Hotspot text content
- `lottie` — Title/caption
- `review` / `star-rating` — Review text content
- `blockquote` — Quote text and attribution
- `progress-bar` — Title and percentage text
- `countdown` — Label text

### What Works

- The generic fallback (lines 348-353) catches unknown widgets by checking common text field names (`title`, `text`, `content`, `description`, `heading`)
- The existing widget coverage handles all the most common free Elementor widgets
- `stripHtml` properly handles HTML entities and whitespace

### Suggested Fix

Add cases for the most common missing widgets. The generic fallback already covers many, but explicit cases improve extraction accuracy. Consider also adding `editor` to the generic fallback list since many Pro widgets use `editor` for rich text content.

---

## Finding 6: MINOR — `isElementorData` check may miss valid Elementor data

**File:** `helpers/elementor.ts`, lines 143-166
**Impact:** Some Elementor pages may not be detected

### The Problem

`isElementorData` checks if the first element in the array has `id` and `elType` properties. However, Elementor sometimes stores empty arrays `[]` for pages that were created in Elementor but have no content yet. The function correctly returns `false` for empty arrays, but this means an Elementor page with an empty layout won't be flagged as Elementor content.

Additionally, the function does not handle the case where `_elementor_data` is double-serialized (PHP serialized wrapping JSON). While `parseElementorData` handles double-encoded JSON (lines 115-118), it does not handle PHP serialization. In some WordPress configurations, meta values can be PHP-serialized.

### What Works

- `parseElementorData` handles double-encoded JSON strings correctly
- The structural check (`id` + `elType`) is a good heuristic for Elementor data

### Suggested Fix

Consider adding a PHP unserialization pre-pass in `parseElementorData` (the `phpUnserialize.ts` helper already exists but is not used by the Elementor parser):

```typescript
import { isSerialized, unserializePHP } from "./phpUnserialize";

// In parseElementorData, before JSON.parse:
if (isSerialized(data)) {
  const unserialized = unserializePHP(data);
  if (typeof unserialized === "string") {
    data = unserialized;
  }
}
```

---

## Summary of Findings

| # | Severity | Finding | Impact |
|---|----------|---------|--------|
| 1 | **CRITICAL** | `fetchWPPostMeta` cannot retrieve `_elementor_data` — WordPress REST API does not expose Elementor meta by default | Elementor data is NEVER imported |
| 2 | **CRITICAL** | `fetchWPPostMeta` uses `posts/` endpoint for pages — pages meta returns 404 | ALL page meta silently lost |
| 3 | **MODERATE** | `extractImageUrls` and `remapElementorImageUrls` are never called | Elementor images point to dead WordPress URLs |
| 4 | **MODERATE** | Only `_elementor_data` is stored; `_elementor_page_settings`, `_elementor_version`, etc. are ignored | Page settings and version info lost |
| 5 | **MINOR** | Text extraction missing Elementor Pro widgets | Some content not searchable |
| 6 | **MINOR** | No PHP unserialization pre-pass for Elementor data | Edge case: serialized meta values not parsed |

---

## Recommendation

Before this sync system can be used on a real Elementor-powered WordPress site, **Findings 1 and 2 must be fixed**. The most pragmatic approach:

1. **Create a lightweight WordPress plugin** that registers all Elementor meta keys for REST API visibility and provide it to users as a pre-sync step
2. **Add a `postType` parameter to `fetchWPPostMeta`** so pages meta is fetched from the correct endpoint
3. **Wire up the image remapping** in the cleanup phase using the already-implemented `extractImageUrls` and `remapElementorImageUrls` functions
4. **Store all `_elementor_*` meta keys** instead of only `_elementor_data`

With these 4 changes, Elementor support would be comprehensive. The parser itself (`elementor.ts`) is well-engineered and production-ready.
