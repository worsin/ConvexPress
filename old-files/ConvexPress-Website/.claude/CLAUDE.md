# ConvexPress Website — Claude Instructions

This repo is the **public-facing Website** for a ConvexPress site. It is
the Convex *consumer* — the admin app at `ConvexPress-Admin/` owns the
database and deploys it. This repo never deploys Convex.

## How to design or rebuild any part of the front end

This repo ships with a **design kit + skill set** that lets Claude
generate (or regenerate) any page template per site.

### The skill kit

In `.claude/skills/`:

| Skill | When to invoke (auto-routes via skill descriptions) |
|---|---|
| `design:brand-discovery` | "set up the brand", "change the vibe", "update the brand voice" |
| `design:homepage` | "design the homepage", "rebuild home", "redo landing" |
| `design:single-post` | "design the post page", "fix how blog posts look" |
| `design:single-page` | "design the page template", "rebuild static pages" |
| `design:archive` | "design the blog index", "redo category archives", "fix tag pages" |
| `design:single-product` | "design the product page", "rebuild product detail" |
| `design:catalog` | "design the shop", "rebuild the catalog" |
| `design:search` | "design the search page" |
| `design:header` | "design the header", "rebuild the nav" |
| `design:footer` | "design the footer" |
| `design:not-found` | "design the 404" |
| `design:regenerate-all` | "redesign the whole site", "regenerate all templates" |
| `design:data-audit` | "audit the templates", "check data contracts" |

Skills are *description-matched* — the user types natural language and
Claude picks the right one. No memorizing slash commands.

### The constitution

Every `design:*` skill reads from `design-kit/`:
- `README.md` — entry point + reading order
- `ARCHITECTURE.md` — how this site is wired (TanStack Start, Convex,
  Clerk, Tailwind v4, Base UI)
- `CONTRACTS.md` — what a valid template must satisfy (SSR, SEO, a11y,
  responsive, no hardcoded colors)
- `BRAND.md` — the brand doc schema + how brand inputs drive design
- `references/*.example.tsx` — real working pattern references per route

Don't bypass the kit. If you're tempted to write a template "from
scratch" without reading the kit, stop — that's exactly the failure mode
the kit prevents.

## Hard rules

- **No imports from `@radix-ui/*`.** Use `@base-ui/react`.
- **No hardcoded color literals.** Use the CSS variable system
  (`bg-background`, `text-foreground`, `bg-primary`, etc.). See
  `design-kit/ARCHITECTURE.md` §5.
- **No imports from `@/templates/*`, `@/template-parts/*`,
  `@/lib/template-registry`, `@/lib/template-part-registry`,
  `@/lib/theme-context`.** These are deprecated. The kit replaces them.
- **No Convex deploys from here.** This repo is a consumer. All schema +
  mutations + queries live in `ConvexPress-Admin/`.
- **No `bunx convex deploy`** or `npx convex deploy` from this repo,
  ever.

## Tech stack — quick reference

- TanStack Start (SSR) + TanStack Router (file-based routing)
- Convex (consumer; `@convexpress-website/backend` package)
- Clerk auth (`@clerk/clerk-react`, `@clerk/tanstack-react-start`)
- Tailwind CSS v4
- Base UI (`@base-ui/react`)
- Lucide icons (`lucide-react`)
- Bun
- React 19

## When you don't know what to do

Type a natural-language description of the goal. Claude will route to
the right `design:*` skill. If no skill matches, the request probably
belongs in the admin app (`ConvexPress-Admin/`) — not here.
