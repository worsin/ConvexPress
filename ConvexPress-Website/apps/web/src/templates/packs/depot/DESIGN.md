# Depot — design brief

**Character.** A dense, fast marketplace: the whole width, tight rhythm, information first. Built for
large catalogs, parts and comparison shopping (Ridgeline Cycles is the reference site). Everything is
scannable: prices tabular, stock and sale as badges, filters always one click away.

**Never.** Colour literals (tokens only), `@radix-ui`, direct backend imports, decorative whitespace,
display type below h2, rounded-full controls (Depot is `rounded-md`).

## Rhythm and measure

- Page container `Container` = `w-full px-4 md:px-6 xl:px-8` with `max-w-none` (edge to edge; a
  `max-w-[1760px]` cap keeps ultra-wide screens sane). Reading measure `Prose` = `max-w-3xl`.
- Sections: `py-6 md:py-8`, `gap-4`/`gap-6`. Grids are dense: products `grid-cols-2 md:grid-cols-3
  xl:grid-cols-4 2xl:grid-cols-5 gap-3`.
- Boxes, not rules: `Card` = `rounded-md border border-border bg-card`; panels stack with `gap-3`.
- Radius `rounded-md` everywhere; controls `h-10`.

## Type

- h1 `font-display text-2xl md:text-3xl font-semibold tracking-tight`; h2 `text-lg font-semibold`;
  everything else sans in `text-sm`/`text-[13px]`. Labels `text-[11px] font-semibold uppercase tracking-wide
  text-muted-foreground`.
- Prices `text-lg font-semibold tabular-nums`; big price in buy boxes `text-3xl`.
- Badges (`Badge`): `sale` (primary tint), `stock` (muted), `new` (foreground on muted).

## Parts (`parts/index.tsx`)

`Container`, `Prose`, `Label`, `SectionHeading` (title left, optional "See all" link right, one row),
`Card`, `Button` (`primary` = `rounded-md bg-primary text-primary-foreground h-10 px-4 font-semibold`,
`secondary` = `border border-border bg-background`, `quiet` = text), `Badge`, `Price`, `Pagination`
(numbered, compact), `EmptyState`, `Skeleton`, `PostCard` (16:9 thumbnail left, title + date right, list
row), `ProductCard` (square image, category label, two-line name, one-line excerpt, price + full-width
"Add to cart" button, sale badge on the image), `Breadcrumbs` (small chevrons), `DataTable` (dense
`table` styles for orders, specs, comparison), `Toolbar` (row of chips + select on the right),
`StickyPanel` (sticky top-24 card for buy boxes and summaries).

## Chrome

- `chrome.header`: two rows. Row one `h-14`: wordmark left (sans, bold), a **prominent search bar**
  across the middle (`h-10`, button on the right, placeholder from the site), right cluster: account,
  wishlist, cart with count and subtotal. Row two `h-10`: department navigation as the primary menu
  (`text-[13px] font-medium`), with an "All" mega dropdown when the menu has children. Sticky both rows.
  Mobile: search bar stays; menu behind hamburger in `chrome.mobileNav` as a drawer with grouped links.
- `chrome.footer`: a "back to top" bar, then four link columns on a muted band, then a compact bottom
  row with copyright and legal links.
- `system.*`: card centred on a muted band, plain heading, actions as buttons.

## Surfaces, the important ones

- `home`: blocks through `BlockList` inside `Container` with Depot rhythm; when the front page is the
  latest-posts feed, render a "news" list of `PostCard` rows in a two-column grid.
- `page`: `default`/`no-sidebar` = `Prose`; `full-width`/`landing`/`blank` = `Container`; `sidebar-*` = 9/3.
- `blog.index`: two-column list of `PostCard` rows with a compact pagination.
- `blog.post`: `Prose` with a small title, meta row of labels, inline 16:9 hero, related posts as a
  four-up card row, comments in a `Card`.
- `shop.catalog`: marketplace variant only (assistant column + dense grid + persistent cart are provided by
  `ShopShell`; the surface renders a `Toolbar` of department chips, price caps and sort, then the grid and
  numbered pagination). Boutique variant is not offered.
- `shop.product`: default variant `marketplace` (square gallery with side thumbnails 5/12, details with a
  `DataTable` of specs 4/12, `StickyPanel` buy box 3/12 with big price, stock badge, quantity, add to cart,
  shipping line). Also offers `classic` and `showcase`.
- `cart` / `checkout.*`: `DataTable` of lines with quantity steppers, `StickyPanel` summary; checkout as a
  left form column and right sticky summary, steps as a numbered strip across the top.
- `dashboard.shell`: top tab strip of sections (no left rail), content as `Card`s and `DataTable`s.
- `auth.*`: `Card` centred on a muted band, compact fields, primary button full width.

Everything else (help, support, gallery, recipes, courses, forms, bundles, wishlist, pricing) follows the
same vocabulary: `SectionHeading` rows, `Card` grids, `DataTable`s, dense rhythm, sans type.
