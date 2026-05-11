---
name: design-catalog
description: Use when the user asks to design, redesign, build, regenerate, or restyle the product catalog / shop index / products listing page. Triggers on "design the shop", "rebuild the catalog", "redo the products page", "fix the product grid". Generates apps/web/src/routes/_marketing/products/index.tsx.
---

# design-catalog

You are generating the **catalog** template — the paginated grid of all
products with filters/sort. Output:
`apps/web/src/routes/_marketing/products/index.tsx`.

## Workflow

1. **Read the kit:** README, ARCHITECTURE, CONTRACTS, BRAND, and
   `references/catalog.example.tsx`.

2. **Pull brand + sample data:**
   ```bash
   bunx convex run settings:queries:getBySection '{"section":"brand"}'
   bunx convex run commerce:products:list '{"paginationOpts":{"numItems":24,"cursor":null}}'
   bunx convex run commerce:categories:list
   ```

3. **Read current file** at `apps/web/src/routes/_marketing/products/index.tsx`.

4. **Generate the new file** following the reference's structure:
   - Loader prefetches first page of products + categories list + brand
   - `head:` with title, description, canonical, og:type "website"
   - JSON-LD CollectionPage
   - Component: header (title + sort dropdown) → two-column grid (filter
     rail + product grid)
   - Filter rail: categories (desktop only), price range, optional facets
   - Product grid: cards with image, title, price
   - "Load more" pagination via `continueCursor`
   - Empty state when zero products
   - Skeleton state

5. **Verify it compiles** and **record generation** (CONTRACTS §8).

## Output contract

- **File:** `apps/web/src/routes/_marketing/products/index.tsx`
- **Required exports:** `Route`
- **Must include:** paginated loader, `head:` meta + canonical,
  CollectionPage JSON-LD, sort control, filter rail (responsive),
  product grid, empty + skeleton states, load-more.

## When NOT to use this skill

- Single product → `design:single-product`
- Category page → `design:archive` (category variant)
