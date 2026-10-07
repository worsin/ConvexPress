---
name: design-single-post
description: Design or restyle the single blog post surface in an installed ConvexPress template pack using the canonical template SDK.
---

# design-single-post

Edit `ConvexPress-Website/apps/web/src/templates/packs/<installed-pack>/surfaces/blog.post.tsx`. Preserve the existing data route at `apps/web/src/routes/_marketing/blog/$slug.tsx`: it owns SSR, SEO, canonical scope and access decisions.

1. Read the selected pack manifest, tokens, parts and current `blog.post` surface, `apps/web/src/templates/sdk/types.ts`, the `BlogPostSurfaceData` contract in Core's `blog.post.tsx`, and `design-kit/references/single-post.example.tsx`.
2. Use existing authored site content for preview. Keep fixture data in BlockDemo or explicit acceptance fixtures; do not seed customer data merely for styling.
3. Compose pack-owned presentation from PostHeader, PostFooter, AuthorBox, RelatedPosts and CommentSection as appropriate. Preserve header/byline, navigation, comments and membership behavior.
4. Render `PublicCanonicalBody` with `documentId={post._id}` for the authorized body. The production route supplies `PublicCanonicalScope`. When `data.restricted` is present, render the `system.restricted` surface in place of the body. Never resurrect raw article/structured/block-list dispatch, contentMode branches or contentHtml rendering.
5. Preserve `SurfaceProps<BlogPostSurfaceData>` and the default surface export. Register surfaces through the installed pack manifest. Use semantic markup, responsive pack tokens and supported SDK primitives; keep data fetching, authentication and SEO in the route.
6. Run Website type checks, canonical surface and public-body lifecycle tests, and template SSR checks. Preview the selected installed pack on an actual authored post at desktop/mobile; verify membership gating and canonical content survive the presentation change.
7. Record affected pack, source changes, checks and rendered evidence. Do not claim SDK or all-pack completion from one surface.
