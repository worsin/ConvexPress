# Architecture

How this site is wired. Read once per design session; the patterns apply
to every template you generate.

---

## 1. Stack at a glance

| Layer | Technology |
|---|---|
| Framework | **TanStack Start** (SSR) on top of **Vite** |
| Routing | **TanStack Router** — file-based routes under `apps/web/src/routes/` |
| Data | **Convex** — this app is a *consumer*, never deploy from here |
| Auth | **Clerk** via `@clerk/clerk-react` + `@clerk/tanstack-react-start` |
| UI primitives | **Base UI** (`@base-ui/react`) — **never** import from `@radix-ui/*` |
| Styling | **Tailwind CSS v4** with `class-variance-authority`, `clsx`, `tailwind-merge` |
| Icons | **Lucide React** (`lucide-react`) |
| Toasts | **Sonner** |
| Forms | **TanStack Form** with Zod validation |
| Runtime | React 19 |
| Package manager | Bun |

This repo is part of a Turborepo monorepo. Workspace alias:
- `@/...` → `apps/web/src/...`
- `@convexpress-website/backend/...` → the consumer-side backend package
  (re-exports Convex generated types from the admin's deployment).

---

## 2. Routing

File-based, under `apps/web/src/routes/`. TanStack Router conventions
apply.

### Layout groups already in use

- **`_marketing/`** — public, marketing-style pages (home, blog, products,
  categories, search, gallery, recipes, etc.). Anything visitor-facing goes
  here unless it lives under `dashboard/` or an auth route.
- **`dashboard/`** — signed-in user dashboard.
- **`api/`** — Server-side endpoints (TanStack Start API routes).
- Top-level files like `login.tsx`, `register.tsx`, `logout.tsx`,
  `forgot-password.tsx`, `reset-password.tsx`, `verify-email.tsx`,
  `signup.$offerId.tsx` are auth pages.

### Route file shape

Every template you generate uses the **`createFileRoute`** pattern:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convexpress-website/backend/generated/api";

export const Route = createFileRoute("/_marketing/some-path")({
	loader: async ({ context: { queryClient }, params }) => {
		await queryClient.ensureQueryData(convexQuery(api.x.queries.get, { ... }));
	},
	head: ({ params }) => ({
		meta: [{ title: "..." }],
	}),
	component: TemplateComponent,
});

function TemplateComponent() {
	// Read params via Route.useParams()
	// Read query data via useQuery() / convexQuery + useQuery from @tanstack/react-query
	// Render
}
```

### Route → template mapping

When a `design:*` skill targets a route, it writes to one of these paths.
Use the existing file as your starting point; replace its contents
completely. Don't preserve old visuals.

| Route URL | File | Skill |
|---|---|---|
| `/` | `_marketing/index.tsx` | `design:homepage` |
| `/blog` | `_marketing/blog/index.tsx` | `design:archive` |
| `/blog/$slug` | `_marketing/blog/$slug.tsx` | `design:single-post` |
| `/page/$` | `_marketing/page/$.tsx` | `design:single-page` |
| `/products` | `_marketing/products/index.tsx` | `design:catalog` |
| `/products/$slug` | `_marketing/products/$slug.tsx` | `design:single-product` |
| `/category/$slug` | `_marketing/category/$slug.tsx` | `design:archive` (category variant) |
| `/tag/$slug` | `_marketing/tag/$slug.tsx` | `design:archive` (tag variant) |
| `/search` | `_marketing/search.tsx` | `design:search` |
| 404 fallback | `routes/__root.tsx` `notFoundComponent` | `design:not-found` |

The site header/footer are shared chrome and live separately from any
single route. They are written/updated by `design:header` / `design:footer`
and rendered inside the layout component (e.g., `_marketing.tsx`).

---

## 3. SSR + data loading

This site uses **SSR by default**. Every route that depends on data
should prefetch in its loader using TanStack Query + Convex.

### The canonical pattern

```tsx
import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { api } from "@convexpress-website/backend/generated/api";

export const Route = createFileRoute("/_marketing/widgets/$slug")({
	loader: async ({ context: { queryClient }, params: { slug } }) => {
		await queryClient.ensureQueryData(
			convexQuery(api.widgets.queries.getBySlug, { slug })
		);
	},
	component: WidgetPage,
});

function WidgetPage() {
	const { slug } = Route.useParams();
	const { data: widget } = useTanStackQuery(
		convexQuery(api.widgets.queries.getBySlug, { slug })
	);

	if (!widget) return <NotFound />;
	return <article>{/* … */}</article>;
}
```

### When to use which client

- **`convexQuery(api.x, args)` + `useTanStackQuery(...)`** — for data that
  must be hydrated from the server. This is the default for any visible
  content on a public route.
- **`useQuery` from `convex/react`** — for client-only data (e.g., the
  current user's session, real-time updates after page load). Don't use
  this for content that must be in the initial SSR HTML.

### Loader guidelines

- Always `await queryClient.ensureQueryData(...)` for primary content.
- Use `head:` (not `meta:`) on the route to set per-page `<title>`,
  description, OG tags. The `head` function receives `params` and
  loader data via the same context.
- Validate path params with Zod (`params: { parse: (raw) => mySchema.parse(raw) }`).
  See `routes/_marketing/blog/$slug.tsx` for the canonical example.
- Don't fetch from the loader and re-fetch from the component — let TanStack
  Query dedupe via `convexQuery`'s queryKey.

---

## 4. Auth (Clerk)

The site uses Clerk. Auth context is wired in `routes/__root.tsx` via
`ClerkProvider` + `ConvexProviderWithClerk`. Templates do not need to
configure auth — they consume it.

### Reading auth in a template

```tsx
import { useAuth, useUser } from "@clerk/clerk-react";

function MyTemplate() {
	const { isSignedIn, isLoaded } = useAuth();
	const { user } = useUser();
	// …
}
```

### Gating content

For pages that require auth (rare on the public/marketing surface), wrap
the route with TanStack's `beforeLoad` redirect-to-login pattern. See
`routes/dashboard.tsx` for the reference.

For membership-gated content (paid memberships restricting a specific
post/page), use the existing `<RestrictedContent>` component from
`@/components/membership/RestrictedContent`. Don't reimplement gating.

---

## 5. Styling

### Tailwind v4

Tailwind v4 is the styling system. There is **no shadcn/ui component
library to compose from** — components are built fresh per site,
constrained by the CSS variable system.

### CSS variables — the brand bridge

The site exposes brand-driven values as CSS variables in `apps/web/src/index.css`.
Use the variables, never literals.

**Available variables (subset):**

```css
--background      / --foreground
--card            / --card-foreground
--popover         / --popover-foreground
--primary         / --primary-foreground
--secondary       / --secondary-foreground
--muted           / --muted-foreground
--accent          / --accent-foreground
--destructive     / --destructive-foreground
--border
--input
--ring
--radius
```

In Tailwind class form: `bg-background`, `text-foreground`,
`bg-primary`, `text-primary-foreground`, `border-border`, etc.

**Never hardcode colors.**

❌ `className="bg-zinc-900 text-slate-200"`
❌ `style={{ backgroundColor: "#0f172a" }}`
✅ `className="bg-background text-foreground"`
✅ `className="bg-primary/10 text-primary"` (opacity modifiers are fine)

This is what allows the brand doc to drive the look of every template
without each template hardcoding its own palette.

### Class composition

Use `cn()` from `@/lib/utils` to merge Tailwind classes safely.
`cn` wraps `clsx` + `tailwind-merge`.

```tsx
import { cn } from "@/lib/utils";
className={cn("base classes", condition && "conditional", props.className)}
```

### Variants

For multi-variant components, use `class-variance-authority` (`cva`).
See existing components in `@/components/` for examples.

---

## 6. UI primitives (Base UI)

For anything interactive — dropdowns, dialogs (for confirmation only),
tabs, popovers, tooltips, accordions, switches, selects — import from
`@base-ui/react`.

**Never import from `@radix-ui/*`.** Radix is not in this project's
dependency tree and adding it is forbidden.

### What Base UI gives you

- `Dialog`, `AlertDialog`
- `Popover`, `Tooltip`
- `Tabs`, `Accordion`
- `Select`, `Combobox`, `Menu`
- `Switch`, `Checkbox`, `Radio`
- `Slider`, `Progress`
- `Toast` (but prefer `sonner` for app-level toasts)

Refer to the official Base UI docs for the exact composition pattern; it
uses a `<Root>` + `<Trigger>` + `<Portal>` + `<Popup>` style similar to
Radix but with different prop names and slot conventions.

### Icons

`lucide-react`. Import per icon, don't barrel-import:
```tsx
import { ChevronRight, ShoppingCart } from "lucide-react";
```

---

## 7. Data layer — Convex

The Convex deployment is **owned by the admin app**. This repo is a
**consumer only.** Don't run `convex deploy`, don't write schema files,
don't define mutations. All mutations and queries live in the admin's
backend; this repo imports them via the generated types.

### Backend import path

```tsx
import { api } from "@convexpress-website/backend/generated/api";
import type { Id, Doc } from "@convexpress-website/backend/generated/dataModel";
```

### Public queries you can rely on

The full surface is what's defined in `ConvexPress-Admin/packages/backend/convex/*/queries.ts`.
Common patterns:

- `api.posts.queries.getPublished({ slug })` — single post by slug
- `api.posts.queries.listPublished({ ... })` — paginated post list
- `api.pages.queries.getFrontPage()` — site's configured static front page
- `api.pages.queries.getBySlug({ slug })` — single page
- `api.products.queries.list({ ... })` / `.getBySlug({ slug })`
- `api.categories.queries.list()` / `.getBySlug({ slug })`
- `api.search.queries.search({ query })`
- `api.settings.queries.getBrand()` — **the brand doc**, see `BRAND.md`
- `api.settings.queries.getBySection({ section })` — generic settings reader
- `api.menus.queries.getByLocation({ location })` — nav menus (header/footer)

When in doubt, grep the admin backend at
`ConvexPress-Admin/packages/backend/convex/<system>/queries.ts`
to confirm a query exists and check its arg shape. **If a query you need
doesn't exist, you cannot just write it here — it has to be added in the
admin repo first.** Mention this in your generation report.

### Public-safety

Queries you call from the Website may need to be public-safe (no auth-only
fields leaking). Most `.queries.getPublished*` and `.queries.getBy*` are
already designed for public consumption. If you're unsure, prefer the
explicit "public" variant if it exists.

---

## 8. SEO

Every route MUST set its `<head>` via the route's `head:` function.
Don't render meta tags as JSX inside the component body.

```tsx
head: ({ params, loaderData }) => ({
	meta: [
		{ title: `${data.title} — Site Name` },
		{ name: "description", content: data.excerpt },
		{ property: "og:title", content: data.title },
		{ property: "og:description", content: data.excerpt },
		{ property: "og:image", content: data.featuredImageUrl },
		{ property: "og:type", content: "article" },
		// twitter:* mirror as needed
	],
	links: [
		{ rel: "canonical", href: `https://site.com/blog/${params.slug}` },
	],
}),
```

For structured data (JSON-LD), use the `<SeoHead>` and helpers in
`@/lib/seo/`. There are existing helpers for posts and articles —
prefer those over hand-rolling JSON-LD.

---

## 9. Accessibility & responsive baseline

The CONTRACTS doc enforces minimums. Highlights:

- **Mobile first.** Default styles target the small viewport; use
  `sm:`/`md:`/`lg:` to scale up.
- **Keyboard navigation.** All interactive elements must be focusable
  and have a visible focus ring (Tailwind's `focus-visible:ring-2
  focus-visible:ring-ring focus-visible:ring-offset-2` baseline).
- **Color contrast.** Body text vs background ≥ 4.5:1. Large text ≥ 3:1.
- **Semantic HTML.** Use `<article>`, `<nav>`, `<header>`, `<footer>`,
  `<main>` — not `<div>` for everything.
- **Alt text** on every `<img>`. If purely decorative, `alt=""` is the
  correct choice (don't omit the attribute).

---

## 10. What you don't have access to

- **No widgets, no plugins, no theme presets.** The whole point of this
  kit is that each route is bespoke React. Don't try to reach for a
  pre-built layout system — there isn't one.
- **No section composer / section enum.** Old code in `apps/web/src/templates/`
  and `apps/web/src/template-parts/` and `apps/web/src/lib/template-registry.ts`
  is **deprecated**. Don't import from those modules; rewrite from scratch
  using this kit's patterns.
- **No admin app.** This repo doesn't touch admin UI. If a template needs
  data the admin doesn't expose, that's a gap to flag — not fix here.
