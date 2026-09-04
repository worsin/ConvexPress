# Journal — design brief

**Character.** An editorial storefront: a magazine that happens to sell things. Calm, centred,
typographic. Whitespace does the work; rules and measure replace boxes and shadows. Built for
small catalogs and content-led brands (Northstar Coffee is the reference site).

**Never.** Colour literals (tokens only), `@radix-ui`, direct backend imports, cards for everything,
drop shadows heavier than `shadow-sm`, more than one accent element per viewport.

## Rhythm and measure

- Page container `Container` = `mx-auto w-full max-w-6xl px-5 sm:px-8`. Reading measure
  `Prose` = `max-w-[68ch]`. Sections breathe: `py-14 md:py-20` between major sections, `gap-10`
  inside.
- Grid: content 12 columns; two-column layouts are `lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]`.
- Rules, not boxes: `<Rule />` (`border-t border-border`) separates sections; lists are
  `divide-y divide-border` rows, not tiles.
- Radius: images `rounded-2xl`, controls `rounded-full` (pills), panels `rounded-xl`.

## Type

- Headlines use `font-display` (the site's display face from Brand) with tight tracking:
  h1 `text-4xl md:text-6xl leading-[1.02] tracking-tight`, h2 `text-3xl md:text-4xl`, h3 `text-xl`.
- Eyebrows `<Eyebrow>`: `text-[11px] font-semibold uppercase tracking-[0.22em] text-primary`.
- Body `text-base md:text-[17px] leading-8 text-muted-foreground`; captions `text-sm`.
- Numbers `tabular-nums`. Prices set in `font-display text-2xl`.

## Parts (`parts/index.tsx`)

`Container`, `Prose`, `Eyebrow`, `SectionHeading` (eyebrow + title + optional lede, left aligned,
optional `align="center"`), `Rule`, `Button` (`primary` = `rounded-full bg-primary text-primary-foreground h-11 px-6`,
`ghost` = `rounded-full border border-border`, `link` = underline offset), `Badge` (pill, muted),
`Price` (display face, optional compare-at struck through), `Pagination` (Previous / page / Next as text links
with a rule above), `EmptyState` (eyebrow + line + one action), `Skeleton` blocks, `PostCard`
(3:2 image, eyebrow date, display title, excerpt, rule below), `ProductCard` (4:5 image, name in display face,
one-line excerpt, price + quiet "Add" pill that fills on hover), `Breadcrumbs` (small caps with slashes).

## Chrome

- `chrome.header`: single row, `h-16`, sticky, `bg-background/90 backdrop-blur`, hairline bottom border.
  Wordmark left in `font-display text-xl`; primary menu centred as text links with `tracking-wide`;
  right cluster: search (icon), account, cart with count. Below the header on the home page only, an
  optional tagline line from site identity. Mobile: hamburger opens `chrome.mobileNav` as a full-height
  sheet with the menu in large display type.
- `chrome.footer`: a masthead — big wordmark across the top (`font-display text-5xl`), then footer rows
  as four narrow columns of small links, then a rule and the copyright line. Newsletter row uses a single
  underline-style input.
- `system.*`: centred, display headline, one sentence, one link.

## Surfaces, the important ones

- `home`: renders the page's blocks through `BlockList` inside `Container` with Journal rhythm; when
  the front page is the latest-posts feed, the first post is a full-width feature (image left 7/12,
  text right) followed by a rule and a two-column list.
- `page`: variants map to measure: `default`/`no-sidebar` = `Prose` centred; `full-width` = `Container`;
  `landing` = no padding top, blocks own the layout; `blank` = nothing but blocks; `sidebar-*` = 7/5 grid
  with the children list in the narrow column.
- `blog.index`: feature + list as above; author, date, reading time in small caps.
- `blog.post`: centred `Prose`; title in display type at `text-5xl`; hero image 3:2 `rounded-2xl`;
  author box as a rule-separated row; related posts as a three-up `PostCard` row; comments below a rule.
- `shop.catalog`: boutique variant only (three-up, `gap-x-8 gap-y-12`); filters are a single row of
  text links under the heading (categories) plus a sort select on the right; price caps as pills.
  Marketplace variant is not offered by this pack.
- `shop.product`: default variant `split` (sticky 4:5 image, right column with display-type title,
  price, options as pills, add to cart pill, then description in `Prose` and specs as a rule-separated
  dl). Also offers `classic` and `minimal`.
- `cart` / `checkout.*`: receipt style — two columns, lines as rule-separated rows, summary in the right
  column with the total in display type; checkout steps shown as a small-caps progress line.
- `dashboard.shell`: quiet left rail of text links (no icons), content in `Prose`-width sections with rules.
- `auth.*`: centred column, wordmark on top, one field per row, pill button.

Everything else (help, support, gallery, recipes, courses, forms, bundles, wishlist, pricing) follows the
same vocabulary: `SectionHeading`, rule-separated lists, display-type titles, generous rhythm.
