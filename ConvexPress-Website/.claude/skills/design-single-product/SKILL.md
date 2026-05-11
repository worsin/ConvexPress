---
name: design-single-product
description: Use when the user asks to design, redesign, build, regenerate, or restyle the single product / product detail page. Triggers on "design the product page", "rebuild product detail", "redo single product", "fix how products look". Generates apps/web/src/routes/_marketing/products/$slug.tsx.
---

# design-single-product

You are generating the **single-product** template. Output: a complete
`apps/web/src/routes/_marketing/products/$slug.tsx`.

## Workflow

1. **Read the kit:** README, ARCHITECTURE, CONTRACTS, BRAND, and
   `references/single-product.example.tsx`.

2. **Pull brand + sample data:**
   ```bash
   bunx convex run settings:getBrand
   bunx convex run products:queries:list '{"paginationOpts":{"numItems":1,"cursor":null}}'
   # Then for a real slug from the result:
   bunx convex run products:queries:getBySlug '{"slug":"<real slug>"}'
   ```

3. **Read current file** at `apps/web/src/routes/_marketing/products/$slug.tsx`.
   Note: there's an existing `-variantSelection.ts` helper next to it —
   reuse that helper for variant-availability logic, don't reimplement.

4. **Generate the new file** following the reference's structure:
   - Zod-validated `slug` param
   - Loader prefetches product + brand
   - `head:` includes `og:type: "product"`, JSON-LD Product/Offer
   - Component: two-column layout (gallery + buy box on desktop)
   - Gallery: hero image + thumbnails
   - Buy box: title, short description, price, variant selectors,
     add-to-cart, description
   - Variant pickers wired via `-variantSelection.ts`
   - Long description rendered with `prose` typography
   - Skeleton + notFound states

5. **Hard rule check:** if `brand.hardRules` mentions "trust badges on
   product pages" or similar, include them. Surface what was added in
   your report.

6. **Verify it compiles** and **record generation** (CONTRACTS §8).

## Output contract

- **File:** `apps/web/src/routes/_marketing/products/$slug.tsx`
- **Required exports:** `Route`
- **Must include:** params validation, loader prefetch, OG product meta,
  Product JSON-LD, `<h1>` with title, gallery, buy box, variant logic,
  add-to-cart button, skeleton + notFound.

## When NOT to use this skill

- Product catalog → `design:catalog`
- Category archive → `design:archive`
