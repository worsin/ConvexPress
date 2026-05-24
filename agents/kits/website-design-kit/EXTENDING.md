# Extending the design kit — the four content patterns

This kit handles four distinct ways a site exposes content. Knowing
which pattern a request falls into is half the battle. Each pattern
maps to specific skills; if you can't match a request to one of these
four, the request probably isn't a design-kit task.

---

## Pattern 1 — Blog post (built-in)

Standard content type. Every site has it. Two surfaces:

- **Single post** — one article by slug.
- **Archive** — the index of posts, plus category / tag / author archives.

**Skills:** `design:single-post`, `design:archive`
**Routes:** `_marketing/blog/$slug.tsx`, `_marketing/blog/index.tsx`,
`_marketing/category/$slug.tsx`, `_marketing/tag/$slug.tsx`,
`_marketing/author/$slug.tsx`
**Backend:** `api.posts.queries.*`, `api.taxonomies.queries.*`

Nothing special. The most common case.

---

## Pattern 2 — Vanilla page (built-in)

A static page authored in the Pages admin: About, Contact, Privacy, etc.
No custom UI; just title + content + SEO. The catch-all `/page/$` route
renders any page record by path.

**Skill:** `design:single-page`
**Route:** `_marketing/page/$.tsx`
**Backend:** `api.pages.queries.getByPath({ path })`

Use this when the page is **purely content** — text, images, maybe an
embedded form, but nothing that requires bespoke React.

---

## Pattern 3 — Page with custom functionality

The page record exists in admin (so it's in menus, has SEO, is editable)
but the front end needs bespoke React beyond rendering the content
block. Examples:

- `/find-a-dealer` — store locator with a map
- `/contact` — page intro + a custom contact form below
- `/pricing-calculator` — page intro + an interactive calculator
- `/integrations` — page intro + a filterable grid of integrations

**Skill:** `design:page-feature`
**Route:** named file at `_marketing/<slug>.tsx` (overrides the catch-all
for that specific URL)
**Backend:** `api.pages.queries.getByPath({ path })` for the page record,
plus whatever the custom UI needs

### How the override works

TanStack Router resolves more-specific routes first. A file at
`_marketing/find-a-dealer.tsx` wins over the catch-all `_marketing/page/$.tsx`
for the URL `/find-a-dealer`. The named file:

1. Pulls the page record (title, content, SEO meta) so the editor still
   controls those.
2. Renders the page header / intro from the page record.
3. Renders the custom feature below or interleaved.

The page record stays the source of truth for everything an editor
expects to control: title, slug (and thus menu link), SEO, intro copy.
The "feature" is just additional React layered on top.

### When this is the right pattern

- The page needs to show up in menus and be editable in the Pages admin.
- But the front end has structured UI beyond a content block.

### When this is NOT the right pattern

- The "page" is actually a new content type with many instances (e.g.,
  "Case Studies") — that's Pattern 4 (CPT).
- The page is content-only with no custom UI — that's Pattern 2.
- The custom UI applies to every page of some type — that's also Pattern 4.

---

## Pattern 4 — Custom Post Type (CPT)

A user-defined content type the admin manages: Case Studies, Events,
Team Members, Locations, etc. Many instances, each with the same shape.
Two surfaces (like blog posts):

- **Single** — one item by slug
- **Archive** — index of all items

**Skill:** `design:custom-post-type`
**Routes:** `_marketing/<cpt-plural>/index.tsx`,
`_marketing/<cpt-plural>/$slug.tsx`
**Backend:** the CPT must already exist in the admin backend with
public queries (`api.<cpt>.queries.listPublished`, `.getBySlug`). If it
doesn't, that's a backend gap — admin work happens first.

### Two-step pipeline

1. **Admin side** — the user (or another skill) defines the CPT in the
   admin backend: schema file, public queries, optional admin list/edit
   routes, capability + nav entries. This is **outside this skill's
   scope** — when extensions are involved, see the `extension-kit` in
   the Admin repo.
2. **Website side** — `design:custom-post-type` generates the two
   public routes against the CPT's queries.

### When this is the right pattern

- Multiple instances of the same shape (Case Studies has many studies).
- Each instance has the same field set (title, body, featured image,
  custom fields).
- Each instance gets its own URL (`/case-studies/$slug`).
- Each instance should appear in archives, search, sitemaps.

### When this is NOT the right pattern

- Only one instance (e.g., "About Us") — that's a page (Pattern 2) or
  a page-with-feature (Pattern 3).
- No URL per item — that's not a content type, it's data behind a UI.

---

## Decision tree

```
Is the request about content visible to public visitors?
├── No → not a design-kit task; check admin systems or extension-kit
└── Yes
    │
    Does this involve many instances of the same shape?
    ├── Yes
    │   │
    │   Is the shape "blog post"?
    │   ├── Yes → Pattern 1 (built-in blog) — design:single-post, design:archive
    │   └── No  → Pattern 4 (CPT) — design:custom-post-type
    │
    └── No (single instance)
        │
        Does it need bespoke React beyond title + content?
        ├── Yes → Pattern 3 (page+feature) — design:page-feature
        └── No  → Pattern 2 (vanilla page) — design:single-page
```

---

## What this doc is NOT for

- Designing the visual *look* of a route — that's `BRAND.md` + the
  references.
- Defining what data the route uses — that's `DATA-API.md`.
- The end-to-end pipeline for a new site — that's `WORKFLOW.md`.

This doc only answers the question "which skill do I use for this
content shape?"
