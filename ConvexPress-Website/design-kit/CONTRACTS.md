# Contracts

The validation checklist. Every template you generate must satisfy every
item below. Treat each as a hard requirement; if you can't satisfy one,
say why in your generation report.

---

## 1. File-level

- [ ] File written to the correct path (the skill's `SKILL.md` specifies it).
- [ ] File exports `Route` via `createFileRoute(...)`.
- [ ] No imports from deprecated modules:
  - ❌ `@/templates/*`
  - ❌ `@/template-parts/*`
  - ❌ `@/lib/template-registry`
  - ❌ `@/lib/template-part-registry`
  - ❌ `@/lib/theme-context`
- [ ] No imports from `@radix-ui/*` (use `@base-ui/react`).
- [ ] No hardcoded color literals (`#abc123`, `bg-zinc-*`, `text-slate-*`, etc.).
  Use CSS variable classes (`bg-background`, `text-foreground`, `bg-primary`).

---

## 2. SSR + data

- [ ] Primary content is prefetched in the route's `loader` via
  `queryClient.ensureQueryData(convexQuery(api.x, args))`.
- [ ] The same query is read in the component via the matching
  `useTanStackQuery(convexQuery(...))` or `useQuery(api.x)` so it's
  hydrated, not refetched on the client.
- [ ] If the route has path params, they're validated with Zod via the
  `params: { parse: ... }` option on `createFileRoute`.
- [ ] Loading state is handled — usually a `<Skeleton>` block in the
  component while `data === undefined`. Don't render `null`; users will
  see a flash of empty layout.
- [ ] Not-found state is handled — when `data === null`, render a useful
  message (or trigger TanStack's `notFound()`).

---

## 3. SEO

- [ ] The route defines a `head:` function returning at minimum:
  - `meta: [{ title }]`
  - `meta: [{ name: "description", content }]`
  - Open Graph: `og:title`, `og:description`, `og:type`, `og:image` (if
    the data shape has an image)
  - `links: [{ rel: "canonical", href }]`
- [ ] For articles, products, and recipes, the route also emits the
  appropriate JSON-LD structured data via `<SeoHead>` or a `lib/seo`
  helper. Use existing helpers; don't hand-roll JSON-LD.
- [ ] Robots: don't add `noindex` to public templates. If gated content
  shouldn't index, that's the membership system's concern.

---

## 4. Accessibility

- [ ] Each page has exactly one `<h1>` containing the primary subject.
- [ ] Heading hierarchy is correct: `<h1>` → `<h2>` → `<h3>`, no skips.
- [ ] All images have `alt` text. Decorative images use `alt=""` (don't
  omit).
- [ ] All interactive elements (buttons, links, form fields) are
  reachable by keyboard with a visible focus state.
- [ ] Color contrast: body text ≥ 4.5:1 against its background. Use the
  variable system — if the brand doc chose accessible colors, you inherit
  accessibility for free.
- [ ] Use semantic HTML: `<article>`, `<nav>`, `<header>`, `<footer>`,
  `<main>`, `<section>`. Don't ship a tag soup of `<div>`s.
- [ ] Forms (if any) have associated `<label>` elements; placeholder text
  is not a label substitute.

---

## 5. Responsive

- [ ] Layout works at viewport widths 360, 768, 1024, 1440. No horizontal
  scrolling at 360px.
- [ ] Mobile-first Tailwind: default classes target small screens, `sm:`
  / `md:` / `lg:` scale up.
- [ ] Touch targets ≥ 44×44px on interactive elements.
- [ ] Images use intrinsic dimensions (`width`/`height` attrs) or
  aspect-ratio Tailwind classes to avoid CLS.

---

## 6. Brand alignment

- [ ] Visual choices are driven by the brand doc (`api.settings.queries.getBrand`).
  See `BRAND.md` for the mapping table from brand fields to design choices.
- [ ] Hard rules from `brand.hardRules` are obeyed (e.g., "must have phone
  number in header").
- [ ] Voice/tone (`brand.voice`) is reflected in any copy you author —
  CTA labels, empty-state copy, error messages. If the route has zero
  authored copy, this rule doesn't bind.
- [ ] If the brand doc pins explicit `palette` or `typography`, use those
  exactly. If it leaves them undefined, you're free to choose values
  *but* they must be set as CSS variables, not literals.

---

## 7. Performance

- [ ] No client-side data fetching for content that should be in the
  initial SSR HTML.
- [ ] Images are served with the right dimensions (no 4000px hero on
  mobile). Use `srcset` or the `loading="lazy"` attribute where
  appropriate.
- [ ] Don't pull a JavaScript-heavy library to do something CSS can
  handle. No `framer-motion` for a fade-in.
- [ ] Bundle hygiene: import only what you use. No `import * as`.

---

## 8. The generation receipt

After successfully writing a template, the skill records a generation
entry in Convex so the admin's inventory page can show "Generated X
minutes ago by `design:homepage`". The receipt mutation lives at:

```
api.designKit.mutations.recordGeneration
```

Args:
```ts
{
  route: string,          // e.g. "/" or "/blog/$slug"
  skill: string,          // e.g. "design:homepage"
  filePath: string,       // path written, relative to repo root
  brandSnapshot: object,  // the brand doc as read at generation time
  notes?: string,         // anything notable, including data gaps flagged
}
```

If the mutation does not yet exist on the admin side, the skill should
write to a local file `design-kit/.generations.log.jsonl` (append-only,
one JSON entry per generation) as a fallback. The admin will reconcile
this on first sync once the mutation lands.

---

## 9. The "don't"s

- ❌ Don't preserve old visual choices "just in case." This is a complete
  rewrite per generation.
- ❌ Don't introduce a section enum or composer pattern. Each template
  is bespoke React for this site.
- ❌ Don't generate stub/lorem content. Real data only — pull from
  Convex. If data is missing, surface that as a clear empty state.
- ❌ Don't add tests in the same generation as the template. Tests are
  a separate concern, handled by other skills/agents.
- ❌ Don't fix unrelated bugs in adjacent files. Stay in your file.
