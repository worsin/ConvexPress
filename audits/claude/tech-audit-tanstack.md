# TanStack Router & TanStack Start Route Audit

**Date:** 2026-04-02
**Audited by:** TanStack Router + TanStack Start Technology Expert Agents
**Scope:** KB, Ticket, Support admin routes (TanStack Router SPA) + Help, Support website routes (TanStack Start SSR) + Widget integration

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH     | 8 |
| MEDIUM   | 7 |
| LOW      | 3 |
| **Total** | **21** |

---

## CRITICAL Findings

### C1. Website `$categorySlug.tsx` blocks child route rendering (missing Outlet)

**File:** `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug.tsx`
**Related:** `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug/$articleSlug.tsx`

**Problem:** Both a `$categorySlug.tsx` file AND a `$categorySlug/` directory exist at the same path level. In TanStack Router file-based routing, this makes `$categorySlug.tsx` the **layout route** for all children inside the `$categorySlug/` directory. However, `$categorySlug.tsx` renders a full page component directly -- it does not import or render `<Outlet />`. As a result, the child route `$categorySlug/$articleSlug.tsx` (the article reader page) will **never render**. Navigating to `/help/getting-started/my-article` will show the category listing page instead of the article.

**Fix:** Either:
- **(Option A -- Recommended):** Convert `$categorySlug.tsx` to a layout route that renders `<Outlet />`, and move the category listing into `$categorySlug/index.tsx`.
- **(Option B):** Move `$articleSlug.tsx` out of the `$categorySlug/` directory and use a flat file naming convention like `help/$categorySlug_.$articleSlug.tsx` (dot notation for nested paths without layout).

### C2. Admin `kb/$articleId.tsx` redirect uses wrong path prefix

**File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/$articleId.tsx`

**Problem:** The `beforeLoad` function compares `location.pathname` against `/kb/${params.articleId}`, but the actual URL in the browser will be `/admin/kb/${params.articleId}` (because of the `_authenticated/_admin` layout route prefix which maps to `/admin/`). The redirect logic will never trigger because the pathname comparison will never match.

Additionally, the redirect uses `to: "/kb/$articleId/edit"` -- in TanStack Router's file-based routing, `to` paths are the **route tree paths** (matching the `createFileRoute` string), not the browser URL paths. The createFileRoute string `"/_authenticated/_admin/kb/$articleId"` means the `to` should also be relative to the file-based route path. This needs verification that the route generator correctly resolves `"/kb/$articleId/edit"` -- it likely needs to be `"/_authenticated/_admin/kb/$articleId/edit"` or the shorter form that matches the generated route tree.

**Fix:** Update the pathname comparison to use the correct browser path `/admin/kb/${params.articleId}`, or better yet, use a different approach (e.g., check `location.pathname.endsWith('/edit')` to determine if already on the edit route). Verify the `to` path matches the route tree entry.

### C3. Admin `kb/new.tsx` navigation after create uses wrong route path

**File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/new.tsx` (line 56)

**Problem:** After creating an article, the code navigates with:
```ts
navigate({ to: "/kb/$articleId/edit", params: { articleId: articleId as unknown as string } })
```
The `to` path `"/kb/$articleId/edit"` does not include the `/_authenticated/_admin` prefix from the route tree. TanStack Router's type-safe navigation requires the `to` path to match a route in the generated route tree. If the route tree entry is `/_authenticated/_admin/kb/$articleId/edit`, this navigation may fail silently or go to the wrong place.

**Fix:** Verify the exact route tree path and update `to` accordingly, or use the full path from the route tree. The `as unknown as string` cast on the articleId is also suspicious -- Convex mutations return `Id<>` types which are already strings at runtime.

---

## HIGH Findings

### H1. Admin `kb/$articleId/edit.tsx` uses incorrect `<Link to="/admin/kb">` path

**File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/$articleId/edit.tsx` (lines 167, 183)

**Problem:** Two `<Link>` components use `to="/admin/kb"`. In TanStack Router file-based routing, `<Link to>` expects a **route tree path** (i.e., `"/_authenticated/_admin/kb/"` or the shorthand the route generator creates), not the browser URL path (`"/admin/kb"`). This will likely cause TypeScript errors or navigation failures.

**Fix:** Use the route tree path. If the admin index route is `createFileRoute("/_authenticated/_admin/kb/")`, then `to` should match what the route generator expects.

### H2. Admin ticket detail navigates with raw string path `"/tickets/"`

**File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/$ticketId.tsx` (line 178)

**Problem:** `navigate({ to: "/tickets/" })` does not include the layout prefix. Same issue as H1 -- `to` should match the route tree path, not the browser URL.

**Fix:** Use the correct route tree path for the ticket index route.

### H3. Admin ticket list navigates to `"/tickets/$ticketId"` without layout prefix

**File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/index.tsx` (line 311)

**Problem:** Row click navigates with `to: "/tickets/$ticketId"`. This path does not include the `/_authenticated/_admin` prefix. Same class of bug as H1 and H2.

**Fix:** Use the correct route tree path.

### H4. No `errorComponent` on any route with data loading

**Files:** All routes in both admin and website apps

**Problem:** None of the 21 audited route files define an `errorComponent`. Routes like `kb/analytics.tsx`, `tickets/index.tsx`, and all website help/support routes perform data fetching via `useQuery`/`useSuspenseQuery` that can fail. Without `errorComponent`, a loader or query error will bubble up to the nearest parent error boundary (likely the root), causing the entire page to crash.

**Fix:** Add `errorComponent` to at least the routes that fetch data in loaders (all website `help/` routes) and routes that are entry points for major features (admin `kb/index.tsx`, `tickets/index.tsx`).

### H5. Website `help/search.tsx` loader accesses `search.q` without proper `loaderDeps`

**File:** `ConvexPress-Website/apps/web/src/routes/_marketing/help/search.tsx`

**Problem:** The loader depends on `search.q`:
```ts
loader: async ({ context: { queryClient }, search }) => {
  if (search.q?.trim()) { ... }
}
```
But there is no `loaderDeps` defined. Without `loaderDeps`, TanStack Router may not re-run the loader when the search params change, leading to stale data when users perform a new search.

**Fix:** Add `loaderDeps`:
```ts
loaderDeps: ({ search }) => ({ q: search.q }),
loader: async ({ context: { queryClient }, deps }) => {
  if (deps.q?.trim()) { ... }
}
```

### H6. Website `help/$categorySlug.tsx` loader doesn't fetch articles (data waterfall)

**File:** `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug.tsx`

**Problem:** The loader only fetches the category by slug:
```ts
loader: async ({ context: { queryClient }, params }) => {
  await queryClient.ensureQueryData(
    convexQuery(api.kb.categories.getBySlug, { slug: params.categorySlug }),
  );
}
```
But the component then also fetches `api.kb.queries.listPublished` with the category ID. This creates a **data waterfall**: the loader fetches the category, then the component renders, then `useSuspenseQuery` fetches articles. The articles query requires the category `_id` from the first query, making this tricky, but the loader could do the two-step fetch sequentially to eliminate the waterfall during SSR.

**Fix:** Fetch both the category and its articles in the loader. Since articles require the categoryId, do it sequentially in the loader:
```ts
loader: async ({ context: { queryClient }, params }) => {
  const cat = await queryClient.ensureQueryData(
    convexQuery(api.kb.categories.getBySlug, { slug: params.categorySlug }),
  );
  if (cat?._id) {
    await queryClient.ensureQueryData(
      convexQuery(api.kb.queries.listPublished, { categoryId: cat._id, page: 1, perPage: 50 }),
    );
  }
}
```

### H7. Website support/ticket routes missing SSR loaders -- blank page during SSR

**Files:**
- `ConvexPress-Website/apps/web/src/routes/_marketing/support/tickets/$ticketId.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/support/tickets/index.tsx`
- `ConvexPress-Website/apps/web/src/routes/_marketing/support/new.tsx`

**Problem:** These routes have no `loader` function. They use `useQuery` from `convex/react` (not `useSuspenseQuery` from `@tanstack/react-query` with `convexQuery` wrapper). This means:
1. During SSR, the page renders with `undefined` data (loading state)
2. The HTML sent to the client is just loading skeletons
3. SEO crawlers get empty content

For authenticated pages (tickets list, ticket detail), this is partially acceptable since search engines should not index them. But the landing page `/support/` also lacks a loader, meaning SSR sends skeleton HTML for a public marketing page.

**Fix:** For the support index page at minimum, add a loader. For authenticated ticket pages, add `loader` functions that check auth and either pre-fetch or redirect to login.

### H8. Website `help/search.tsx` `head()` uses unsafe type coercion

**File:** `ConvexPress-Website/apps/web/src/routes/_marketing/help/search.tsx` (lines 24-38)

**Problem:** The `head()` function casts the context with `(ctx as any).search?.q`, bypassing type safety:
```ts
head: (ctx) => {
  const q = typeof (ctx as any).search?.q === "string" ? (ctx as any).search.q : "";
```
This is brittle and defeats the purpose of TanStack Start's typed head management. The `head` callback for routes with `validateSearch` receives `search` as a typed property.

**Fix:** Type the context properly:
```ts
head: ({ search }) => ({
  meta: [{ title: search.q ? `Search: ${search.q} - Help Center` : "Search - Help Center" }],
})
```

---

## MEDIUM Findings

### M1. Widespread `@ts-expect-error` suppressions in website routes

**Files:** All website `help/` route files (`index.tsx`, `$categorySlug.tsx`, `collections/$slug.tsx`, `search.tsx`, `$categorySlug/$articleSlug.tsx`)

**Problem:** Every `useSuspenseQuery` call has a `// @ts-expect-error - Convex query type mismatch with useSuspenseQuery` comment. This indicates a systemic type compatibility issue between `@convex-dev/react-query` and `@tanstack/react-query`. While functional at runtime, this suppresses all type checking on query parameters and return types.

**Fix:** Investigate and resolve the root type mismatch. This may require updating `@convex-dev/react-query` or adding proper type declarations. The `convexQuery()` return type may need augmentation to be compatible with `useSuspenseQuery`'s expected input type.

### M2. Website `$categorySlug/$articleSlug.tsx` has unnecessary `typeof` guards inside `useEffect`

**File:** `ConvexPress-Website/apps/web/src/routes/_marketing/help/$categorySlug/$articleSlug.tsx` (line 159)

**Problem:** The code accesses `sessionStorage` inside a `useEffect`, which is correct for avoiding SSR issues. However, the `trackView` mutation references `document.referrer` and `navigator.userAgent` with `typeof` guards:
```ts
referrer: typeof document !== "undefined" ? document.referrer : undefined,
userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
```
This is inside a `useEffect` that only runs client-side, so the `typeof` guards are unnecessary clutter. Not a bug, but indicates defensive coding that could mask issues.

**Fix:** Remove the `typeof` guards since `useEffect` only runs on the client.

### M3. No code splitting (`.lazy.tsx`) on any route

**Files:** All 21 audited route files

**Problem:** None of the routes use `.lazy.tsx` code splitting. Several routes are heavy (e.g., `kb/$articleId/edit.tsx` at 387 lines with a full editor, `tickets/$ticketId.tsx` at 445 lines with a thread view). All route components are bundled with their route definitions.

**Fix:** For the admin SPA, create `.lazy.tsx` files for heavy routes:
- `kb/$articleId/edit.lazy.tsx`
- `tickets/$ticketId.lazy.tsx`
- `support/analytics.lazy.tsx`
- `kb/workflows.lazy.tsx`
- `kb/collections.lazy.tsx`

### M4. Admin routes use `useEffect` for form state sync instead of loader/route data

**Files:**
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/$articleId/edit.tsx` (line 74-86)
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/kb/settings.tsx` (line 61-91)
- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/tickets/settings.tsx` (line 45-58)

**Problem:** These routes use `useEffect` to sync Convex query data into local `useState` form state. This is a known anti-pattern that can cause stale state issues when the underlying data changes (e.g., another user edits the same article). The `useEffect` dependencies are also fragile -- the KB edit uses `art?._id` with an eslint-disable comment.

**Fix:** This is acceptable for form editing where you need local state for dirty tracking, but consider using a form library like TanStack Form (which is in the tech stack) for proper form state management with reset-on-load semantics.

### M5. Website `support/tickets/$ticketId.tsx` uses `any` type for error catch

**File:** `ConvexPress-Website/apps/web/src/routes/_marketing/support/tickets/$ticketId.tsx` (lines 93, 109, 120)

**Problem:** Multiple `catch (error: any)` blocks. This is inconsistent with the admin routes which use `catch (err: unknown)` with proper type narrowing. Using `any` defeats TypeScript's error-handling type safety.

**Fix:** Use `catch (error: unknown)` and narrow with `(error as { data?: { message?: string } })?.data?.message`.

### M6. Website `support/new.tsx` also uses `catch (error: any)`

**File:** `ConvexPress-Website/apps/web/src/routes/_marketing/support/new.tsx` (line 68)

**Problem:** Same as M5.

**Fix:** Same as M5.

### M7. Admin `support/analytics.tsx` not behind `RoutePermissionGuard` at component level

**File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/support/analytics.tsx`

**Problem:** Unlike every other admin route which wraps content in `<RoutePermissionGuard requiredAccess="...">`, this route renders the analytics dashboard directly without a permission guard wrapper. The null check on `stats` serves a similar purpose, but the pattern is inconsistent with the rest of the codebase.

**Fix:** Wrap the component in `<RoutePermissionGuard requiredAccess="/admin/support">` for consistency.

---

## LOW Findings

### L1. No `head()` meta on any admin route

**Files:** All admin route files (11 KB files, 5 ticket files, 1 support file)

**Problem:** None of the admin SPA routes define `head()` with meta tags. While this matters less for an SPA behind auth (no SEO needed), having proper `<title>` tags improves browser tab identification when users have multiple admin pages open.

**Fix:** Add `head()` with at least a `title` to each admin route (e.g., `head: () => ({ meta: [{ title: "KB Articles - Admin" }] })`).

### L2. Inconsistent loading state patterns

**Files:** Various

**Problem:** Loading states are handled inconsistently:
- Some routes check `=== undefined` and show skeleton (KB analytics, KB edit)
- Some routes check `=== null` for permission denied (ticket list, ticket detail)
- Website routes use `useSuspenseQuery` which throws to Suspense boundaries
- Some admin routes don't handle null (no data yet) distinctly from undefined (loading)

**Fix:** Establish a consistent pattern for loading and empty states across all routes.

### L3. Website `support/index.tsx` conditionally renders cards based on auth

**File:** `ConvexPress-Website/apps/web/src/routes/_marketing/support/index.tsx`

**Problem:** The "My Tickets" card is conditionally rendered based on `isSignedIn`. During SSR, `isSignedIn` may differ from the client state, potentially causing a hydration mismatch. Clerk's `useAuth()` may return `undefined` during SSR.

**Fix:** Either always render the card and show a login prompt, or use `useEffect` to conditionally show it after hydration.

---

## Architecture Notes

### Route Path Convention Inconsistency

The admin routes use TanStack Router's `createFileRoute` with the full layout-prefixed path (e.g., `"/_authenticated/_admin/kb/"`), which is correct. However, internal navigation (`<Link to>`, `navigate({ to })`) inconsistently uses:
- Short paths like `"/kb/$articleId/edit"` and `"/tickets/"` (wrong -- these don't include layout prefix)
- Full browser paths like `"/admin/kb"` (also wrong -- `to` expects route tree paths, not browser URLs)

This is the single most pervasive issue across the admin codebase. TanStack Router's type-safe `to` expects the path as it appears in the generated route tree, which includes the pathless layout prefixes like `/_authenticated/_admin/`.

### SSR Data Strategy

The website routes use two different data fetching strategies:
1. **Help center routes:** `useSuspenseQuery` + `convexQuery` in loaders = proper SSR with data
2. **Support/ticket routes:** `useQuery` from `convex/react` with no loaders = client-only fetching

Strategy 1 is correct for SSR. Strategy 2 means ticket pages send empty HTML from the server. Since ticket pages require authentication, this is partially acceptable, but the pattern should be documented as intentional.

### Widget Integration

The `SupportWidget` component is rendered in `__root.tsx` body, which means it appears on every page. This is correct for a floating support widget. It's rendered inside the `ConvexProviderWithClerk` wrapper, so it has access to both Convex real-time queries and Clerk auth state. No issues found with the widget integration.
