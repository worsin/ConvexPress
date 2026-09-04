# Template packs and the storefront SDK

A **template pack** decides how the customer-facing site looks. A **surface** is one
screen or region (`blog.post`, `chrome.header`, `dashboard.orders`). Routes load data and
render `<Surface name="…" data={…} fallback={CoreX} />`; the active pack (Settings ›
Appearance › Templates) decides which component draws it. Plan and inventory:
`specs/research/TEMPLATE-SYSTEM-PLAN-2026-09-04.md`.

```
templates/
  sdk/            catalog.ts (surface ids + coverage areas), types.ts, registry.ts, useTemplate.ts, Surface.tsx
  packs/<id>/     template.json + surfaces/<surface id>.tsx   (discovered at build time)
```

## The contract (enforced by `bun run check:templates` in apps/web)

1. A surface file default-exports a component `({ data, variant, packId }: SurfaceProps<Data>) => ReactElement`.
2. Surfaces **never** import `convex/react` or `@convexpress-website/backend/generated/api`. All data comes in
   through `data`; all writes come in as callbacks inside `data` (e.g. `data.actions.addToCart`). Hooks from
   `@/hooks/*`, `@/contexts/*` and `@/components/*` are allowed (they are SDK surface area).
3. Token classes only (`bg-background`, `text-primary`, …). No colour literals, no `@radix-ui`.
4. SSR-safe: no `window`/`document` during render (effects are fine).
5. Every surface id must exist in `sdk/catalog.ts`; every file under `surfaces/` must be listed in
   `template.json` → `surfaces` (the Core manifest is maintained by the person merging).

## Extraction recipe (moving a route's rendering into the Core pack)

Goal: the route becomes a thin loader; the JSX moves into `packs/core/surfaces/<id>.tsx`; behaviour is unchanged.

1. In the route, keep: `createFileRoute`, `validateSearch`, `loader`, `head`, data hooks (`useSuspenseQuery`,
   `useQuery`, `useMutation`), auth/plugin gates, redirects, toasts. Build one `data` object from what the
   component computed (view model + callbacks). Prefer the TanStack cache hooks the loader filled so SSR
   and hydration agree.
2. Create `packs/core/surfaces/<id>.tsx` with an exported `interface <Name>SurfaceData` and the default
   component that renders exactly the JSX the route rendered. Local UI state (`useState` for tabs, open
   panels, drafts) lives in the surface; data and persistence live in the route.
3. Route renders `<Surface name="<id>" data={data} fallback={CoreX} />` where `CoreX` is the default import
   of the surface file (the fallback keeps the site working if a pack omits the surface).
4. Shared pieces that several surfaces use (post cards, pagination, cart lines) stay in `@/components/*`;
   the surface composes them.
5. For layout chrome (`_marketing.tsx`, `dashboard.tsx`, `AuthPageLayout`) the "route" is the layout file;
   same recipe.

Reference: `packs/core/surfaces/shop.product.tsx` (data = `{ product, state }` from `useProductPage`) and
`shop.catalog.tsx` (renders `components/shop/ShopCatalog`), with their routes under `routes/_marketing/products/`.

## Adding a pack

Copy `packs/core/template.json`, change `id`/`name`, implement only the surfaces you want (everything else
falls back to Core), run `bun run check:templates`, then pick it in Appearance › Templates.
Preview without saving: `?template=<id>` on any storefront URL.
