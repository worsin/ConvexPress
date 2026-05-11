# Data API — what queries actually exist

This is the **verified** list of Convex queries and mutations the Website
can call. Every API name here was confirmed against the admin backend at
`ConvexPress-Admin/packages/backend/convex/`.

**If a name isn't on this list, it doesn't exist.** Don't guess. If you
genuinely need a query that's missing, surface it in your generation
report as a backend gap — don't fabricate the call.

---

## Conventions

- All entries below are imported from
  `@convexpress-website/backend/generated/api` as `api.<system>.<file>.<func>`.
- Path matches the file location in the admin backend:
  `convex/<system>/<file>.ts` → `api.<system>.<file>.<func>`.
  Exception: top-level files like `convex/commerce/products.ts` are
  `api.commerce.products.<func>` (no `.queries` infix).
- For SSR: wrap with `convexQuery(api.x, args)` and feed into
  `queryClient.ensureQueryData(...)` in the route loader.
- For client-only reactive subscriptions: `useQuery(api.x, args)` from
  `convex/react`.

---

## Settings (the brand doc lives here)

`api.settings.queries.get` — full settings doc (admin-only feel; prefer
`getBySection` for public consumption).

`api.settings.queries.getBySection({ section: string })` — settings for
one named section. **Use this to read the brand doc:**

```ts
const brand = await convex.query(api.settings.queries.getBySection, {
	section: "brand",
});
```

`api.settings.queries.getPublic` — public-safe settings (omits secrets).

`api.settings.queries.getAutoloaded` — eagerly-loaded settings (for
high-traffic reads like nav/identity).

`api.settings.mutations.updateSection({ section, values })` — write to a
settings section. **Use this to save the brand doc:**

```ts
await convex.mutation(api.settings.mutations.updateSection, {
	section: "brand",
	values: { moodPrompt: "...", voice: "...", /* …rest of BrandDoc */ },
});
```

### Brand doc storage convention

There is **no dedicated `api.settings.queries.getBrand`** — the brand
doc is stored as a section inside the `settings` table, keyed by
`section: "brand"`. Read and write through the standard section API
above. Schema of the brand doc itself: see `BRAND.md`.

### Site identity

There is **no dedicated `getSiteIdentity`** either. Site name / tagline /
logo URL / favicon all live in the **"general"** settings section:

```ts
const general = await convex.query(api.settings.queries.getBySection, {
	section: "general",
});
// general.siteName, general.tagline, general.adminEmail, …
```

---

## Posts (blog content)

`api.posts.queries.list({ paginationOpts })` — all posts (admin context).

`api.posts.queries.listPublished({ paginationOpts })` — public posts.

`api.posts.queries.get({ id })` — by Convex ID.

`api.posts.queries.getPublished({ slug })` — public post by slug. **The
primary read for the single-post route.**

`api.posts.queries.getSticky({ ... })` — "sticky" posts the user pinned
in the admin. **Use this for the homepage "featured posts" section.**

`api.posts.queries.getRelatedPosts({ postId, limit })` — related posts.

`api.posts.queries.getAdjacentPosts({ postId })` — prev / next post.

`api.posts.queries.getDateArchiveGroups({ ... })` — for date-based
archive pages.

**There is no `listFeatured`.** Use `getSticky` for editor-pinned
content. If brand-driven "featured" needs different logic, surface that
as a backend gap.

---

## Pages (static / hierarchical)

`api.pages.queries.list({ paginationOpts })`
`api.pages.queries.listPublished({ paginationOpts })`
`api.pages.queries.get({ id })`
`api.pages.queries.getByPath({ path })` — **primary read for `/page/$`**
`api.pages.queries.getFrontPage()` — the static front page if configured
`api.pages.queries.getTree()` — full hierarchy
`api.pages.queries.getChildren({ parentId })`
`api.pages.queries.getBreadcrumbs({ pageId })`
`api.pages.queries.getTemplates()` — available page templates (legacy)
`api.pages.queries.verifyPassword({ pageId, password })`

---

## Commerce — Products

Live under `api.commerce.products.*` **(not `api.products.queries.*`)**:

`api.commerce.products.list({ paginationOpts })`
`api.commerce.products.listAll({ paginationOpts })`
`api.commerce.products.listPublished({ paginationOpts })`
`api.commerce.products.get({ id })`
`api.commerce.products.getBySlug({ slug })` — **primary read for single product**
`api.commerce.products.counts()`
`api.commerce.products.listVariants({ productId })`
`api.commerce.products.listOptionTypes({ productId })`

There is **no `listFeatured`**. Use `commerce.categories.getFeatured`
to discover featured *categories*; for featured *products*, the brand
doc + manual curation is the current path.

---

## Commerce — Categories (product taxonomy)

Live under `api.commerce.categories.*`:

`api.commerce.categories.list()` — all
`api.commerce.categories.listPublic()` — public-safe
`api.commerce.categories.getBySlug({ slug })` — **for `/category/$slug`**
`api.commerce.categories.getTree()` — hierarchy
`api.commerce.categories.getFeatured({ limit })` — featured categories
`api.commerce.categories.getNavCategories({ limit })` — top-nav-suitable

**Don't confuse with post taxonomies** (categories/tags on posts) which
live in `api.taxonomies.queries.*`.

---

## Taxonomies (post categories + tags)

`api.taxonomies.queries.list({ type, paginationOpts })` — post categories/tags
`api.taxonomies.queries.get({ id })`
`api.taxonomies.queries.getBySlug({ slug, type })`
`api.taxonomies.queries.getByPost({ postId })`
`api.taxonomies.queries.getCategoryTree()`
`api.taxonomies.queries.getPostsByTerm({ termId, paginationOpts })` —
**for post category/tag archive pages**

---

## Search

`api.search.queries.search({ query, ... })` — site-wide search across
multiple content types
`api.search.queries.suggest({ query })` — typeahead suggestions

---

## Menus (navigation)

Live under `api.menus.queries.*`:

`api.menus.queries.listMenus()`
`api.menus.queries.getMenu({ id })`
`api.menus.queries.getMenuItemTree({ menuId })`
`api.menus.queries.getMenuForLocation({ location })` — **for header/footer**
`api.menus.queries.getMenuLocations()` — all known locations

**The function is `getMenuForLocation`, not `getByLocation`.** Skills
that show "by location" in their text mean to call `getMenuForLocation`.

---

## Recipes (recipe content type)

`api.recipes.queries.list({ paginationOpts })`
`api.recipes.queries.listPublished({ paginationOpts })`
`api.recipes.queries.get({ id })`
`api.recipes.queries.getBySlug({ slug })`
`api.recipes.queries.getCategoryBySlug({ slug })`

---

## Gallery (gallery / portfolio content type)

`api.gallery.queries.list({ paginationOpts })`
`api.gallery.queries.listPublished({ paginationOpts })`
`api.gallery.queries.getBySlug({ slug })`
`api.gallery.queries.getEmbed({ slug })`

---

## Knowledge Base

`api.kb.queries.list({ paginationOpts })`
`api.kb.queries.listPublished({ paginationOpts })`
`api.kb.queries.getBySlug({ slug })`
`api.kb.queries.getPopular({ limit })`
`api.kb.queries.getRecent({ limit })`
`api.kb.queries.getFeatured({ limit })`

---

## Media

`api.media.queries.list({ paginationOpts })`
`api.media.queries.get({ id })`
`api.media.queries.getByIds({ ids })`
`api.media.queries.getUrl({ storageId })`
`api.media.queries.getSrcSet({ storageId, sizes })` — **use for
responsive `<img srcset>`**

---

## Comments

`api.comments.queries.list({ paginationOpts })`
`api.comments.queries.forPost({ postId, status })` — **for inline
comments under a post**
`api.comments.queries.recent({ limit })`
`api.comments.queries.pendingCount()`

---

## Membership (access gating)

`api.membership.queries.checkAccess({ resourceType, resourceIdOrKey })` —
**use before showing gated content**

`<RestrictedContent>` from `@/components/membership/RestrictedContent`
wraps this for you; prefer the component over manual calls.

---

## SEO

`api.seo.queries.*` exposes SEO settings + per-content overrides.
Helpers in `@/lib/seo/resolve` already wrap these — **prefer the
helpers** over direct query calls.

---

## What is NOT available

These were referenced in earlier kit drafts but **do not exist**:

| Mentioned | Reality |
|---|---|
| `api.settings.queries.getBrand` | Use `getBySection({ section: "brand" })` |
| `api.settings.mutations.setBrand` | Use `updateSection({ section: "brand", values })` |
| `api.settings.queries.getSiteIdentity` | Use `getBySection({ section: "general" })` |
| `api.posts.queries.listFeatured` | Use `getSticky` for editor-pinned posts |
| `api.products.queries.list` | Use `api.commerce.products.list` |
| `api.products.queries.getBySlug` | Use `api.commerce.products.getBySlug` |
| `api.categories.queries.list` | Use `api.commerce.categories.list` (product cats) or `api.taxonomies.queries.list` (post cats) |
| `api.menus.queries.getByLocation` | Use `api.menus.queries.getMenuForLocation` |
| `api.designKit.mutations.recordGeneration` | Does not exist — log to `design-kit/.generations.log.jsonl` |
| `api.designKit.queries.listGenerations` | Does not exist — read the JSONL log directly |

---

## Calling these from a CLI for inspection

When a skill says "pull a sample of the data," use the Convex CLI from
the admin backend's working directory:

```bash
cd ConvexPress-Admin/packages/backend
bunx convex run settings:queries:getBySection '{"section":"brand"}'
bunx convex run posts:queries:listPublished '{"paginationOpts":{"numItems":3,"cursor":null}}'
bunx convex run commerce:products:list '{"paginationOpts":{"numItems":1,"cursor":null}}'
```

Note the file-path-style CLI naming: `settings:queries:getBySection`
(colons separate folder / file / function), NOT `api.settings.queries.getBySection`
which is the JS import path.

---

## When in doubt

1. Read the actual admin backend file the function should live in.
2. If it's not there but you need it, that's a backend gap. Surface it
   in the generation report. Don't fake the call.
