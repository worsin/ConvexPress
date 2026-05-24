# Website SEO Route Conventions

This file defines the current SEO contract for the public website framework.

## Page classes

- Public indexable routes use `buildSeoHead(...)` or `buildIndexablePageHead(...)` in the route loader and return `seoHead` through `loaderData`.
- Search-style routes must stay `noindex, follow`.
- Auth, dashboard, account, and ticket-management routes must use `buildRestrictedPageHead(...)` and stay `noindex, nofollow`.
- Legacy permalink helpers and redirector routes stay non-indexable even when they immediately redirect.

## Route patterns

- Public routes with loader-backed metadata should use `head: ({ loaderData }) => loaderData?.seoHead ?? {}`.
- Routes that do not need site settings or a canonical URL can use `buildRestrictedPageHead(...)` directly in `head()`.
- Prefer absolute canonicals via `path` + `siteUrl` rather than hand-built URLs.

## Quality gates

- `bun run check-types` must stay clean.
- `bun run check:seo` verifies critical route files still use the shared SEO helpers.
- `bun run build && bun run check:bundle` enforces a basic client bundle budget.
- `bun run lint` must stay at zero warnings.
- `bun run smoke:ssr` verifies key public and restricted routes still SSR the expected metadata when runtime env is available.

## When adding a route

1. Decide whether the route is public, search, or restricted.
2. Use the shared helper that matches that policy.
3. If the route is public and SSR-backed, derive metadata from loader data.
4. Add the route to `scripts/check-seo-routes.mjs` if it is a critical page class.
