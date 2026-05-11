---
name: design-single-post
description: Use when the user asks to design, redesign, build, regenerate, or restyle the single blog post / single article page. Triggers on phrases like "design the post page", "fix how blog posts look", "rebuild post detail", "redo the article template". Generates apps/web/src/routes/_marketing/blog/$slug.tsx.
---

# design-single-post

You are generating the **single-post** template — the route that renders
one blog post by slug. Output: a complete
`apps/web/src/routes/_marketing/blog/$slug.tsx`.

## Workflow

1. **Read the kit:** `design-kit/README.md`, `ARCHITECTURE.md`,
   `CONTRACTS.md`, `BRAND.md`, `references/single-post.example.tsx`.

2. **Pull brand + sample data:**
   ```bash
   bunx convex run settings:getBrand
   bunx convex run posts:queries:getPublished '{"slug": "<any real post slug from the site>"}'
   ```
   To find a real slug, list a few:
   ```bash
   bunx convex run posts:queries:listPublished '{"limit": 5}'
   ```

3. **Read current file** at `apps/web/src/routes/_marketing/blog/$slug.tsx`.

4. **Generate the new file**, following the reference's structure:
   - Zod-validated `slug` param
   - SSR loader prefetches the post + brand
   - `head:` returns title, description, OG meta, canonical link, JSON-LD article
   - Component: header (categories, title, excerpt, byline, date) → featured
     image → body content via existing structured-content renderer → related
     posts → comments
   - Wrap content in `<RestrictedContent>` for membership gating
   - Skeleton + notFound states required

5. **Use existing components** where they exist:
   - `@/components/blog/PostContent` for body
   - `@/components/blog/AuthorBox` for author info
   - `@/components/blog/RelatedPosts` for related posts
   - `@/components/comments/CommentSection` for comments
   - `@/components/membership/RestrictedContent` for gating
   - `@/components/seo/SeoHead` + `@/lib/seo/resolve` for JSON-LD
   Don't reimplement what's there. Replace only what the brand requires.

6. **Verify it compiles:** `bun --filter web check-types` in
   `ConvexPress-Website/`.

7. **Record generation** (see CONTRACTS.md §8).

8. **Report back.**

## Output contract

- **File:** `apps/web/src/routes/_marketing/blog/$slug.tsx`
- **Required exports:** `Route`
- **Must include:** params validation, loader prefetch of post + brand,
  `head:` with article meta, JSON-LD article, semantic `<article>`, `<h1>`
  with post title, byline, body, skeleton, notFound() on null post.
- **Must respect:** membership gating, comment section, related posts. If
  you remove any of these, justify in your report.
