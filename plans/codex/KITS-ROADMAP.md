# Skill Kits Roadmap

ConvexPress is an AI-first CMS. The architectural unit of "doing work" in
this project is a **skill kit** — a folder of documentation + a folder of
description-matched skills that let Claude execute domain-specific tasks
flawlessly against this codebase.

This file lists every skill kit that exists, every kit we've agreed to
build over time, and the standard shape every kit follows. Future Claude
sessions: **read this before suggesting that a kit should be built from
scratch** — the standard already exists; build to it.

---

## Kits that exist today

| Kit | Status | Lives in | Purpose |
|---|---|---|---|
| **design-kit** | Built (2026-05-11) | `ConvexPress-Website/design-kit/` + `.claude/skills/design-*` | Generate or regenerate any front-end template per site — homepage, single post/page, archive, product, catalog, search, header, footer, 404, custom post type, page-with-feature. AI generates real React per route against a brand doc. |
| **extension-kit** | Built v2 (2026-05-11) — scanner-based | `ConvexPress-Admin/extension-kit/` + `.claude/skills/extension-*` | Build, extend, or audit an Admin extension end-to-end via the v2 scanner-discovered architecture. Extensions live additively under `extensions/<id>/` (official) or `extensions.local/<id>/` (user, gitignored). Hub registry files (schema.ts, plugins/registry.ts, nav-config.ts) are never modified by extensions — Vite `import.meta.glob` + backend codegen merge them. Survives `git reset --hard` updates. |

---

## Kits we will build, in rough priority order

We agreed to all of these over time. We're not queueing them now. **Do
NOT spontaneously start building a kit from this list** — the user will
tell you when to pick the next one up. This list exists so the *idea*
isn't forgotten and so the kit boundaries stay clean.

### 1. content-kit — bulk content authoring at AI scale
- **Lives in:** both repos
- **Purpose:** Bulk-author posts, pages, knowledge-base articles, and
  per-route copy via AI. Skills cover: ghostwriting in brand voice,
  AI-assisted editorial review, bulk import from outlines or briefs,
  bulk SEO meta generation. Ties tightly to the `brand` settings section
  written by `design:brand-discovery` for voice/tone.
- **Why it matters:** the design kit handles *layout*; the content kit
  handles *what fills the layout*. Both AI-driven.

### 2. migration-kit — import an existing site into ConvexPress
- **Lives in:** `ConvexPress-Admin/`
- **Purpose:** Import from WordPress (REST + WP-CLI), Shopify, Squarespace,
  raw markdown, etc. Skills cover: content type mapping, media re-hosting,
  URL preservation, redirect generation, user import with the credential
  reality (we can't pull WP password hashes via REST), role mapping.
- **Why it matters:** ConvexPress deploys to 10+ sites. Migration is the
  on-ramp.

### 3. seo-kit — audit + fix SEO across an entire site
- **Lives in:** `ConvexPress-Website/`
- **Purpose:** Site-wide SEO audit (meta tags, JSON-LD, canonical, sitemap,
  Open Graph, Core Web Vitals proxies), then targeted fixes. Skills run
  audits per content type and per route group.
- **Why it matters:** SSR is the value prop; SEO is the table stakes.

### 4. performance-kit — bundle + LCP + image audits and fixes
- **Lives in:** `ConvexPress-Website/`
- **Purpose:** Analyze bundle composition, identify route-level perf
  regressions, optimize images (srcset, dimensions, format), de-duplicate
  imports, audit third-party scripts.

### 5. test-kit — generate Playwright/Vitest tests
- **Lives in:** both repos
- **Purpose:** Generate route-level tests for the Website, component
  tests for shared UI, integration tests for Convex functions, smoke
  tests for new extensions.
- **Why it matters:** Without tests, regen cycles risk silent
  regressions.

### 6. deployment-kit — release flows + rollback + per-site config
- **Lives in:** top-level
- **Purpose:** Release a Website/Admin version to one or more sites,
  manage per-site env vars and feature flags, roll back, monitor.
- **Why it matters:** Multi-site reality.

### 7. multi-site-kit — fleet management for 10+ deployments
- **Lives in:** top-level
- **Purpose:** Clone a designed site to N new ones, propagate a brand
  pivot across the fleet, audit drift across sites, manage shared vs
  per-site content.
- **Why it matters:** This is the long-term operational reality of the
  business.

---

## The skill-kit standard

Every kit follows this shape. If you build a new kit that doesn't, you're
breaking the contract.

```
<domain>-kit/
├── README.md           ← entry + reading order, links to all other docs
├── ARCHITECTURE.md     ← what this domain touches in the codebase
├── CONTRACTS.md        ← validation criteria; what makes "done" provable
├── DATA-API.md         ← verified backend surface (if applicable)
├── WORKFLOW.md         ← end-to-end pipeline for the common case
├── TROUBLESHOOTING.md  ← failure modes + fixes
└── references/         ← real, working code samples (not pseudocode)
    └── *.example.tsx
```

```
.claude/skills/
├── <domain>-<task>/    ← N specialized skills, one per granular action
│   └── SKILL.md
├── <domain>-orchestrate/   ← "do everything in order"
│   └── SKILL.md
└── <domain>-audit/         ← "check what's drifted"
    └── SKILL.md
```

### Non-negotiable kit qualities

1. **Verified backend surface** — every Convex (or other) API the skills
   tell Claude to call is grepped against reality before the kit ships.
2. **Real working references** — actual code, with comments explaining
   *why* each piece exists. Not pseudocode. Not stubs.
3. **Description-matched skills** — the user types intent in natural
   language; Claude routes via the `description:` field. Slash commands
   are an escape hatch, not the primary path.
4. **An orchestrator** for the "redo everything" case.
5. **A troubleshooting doc** — failure modes Claude would hit are
   documented before they happen.

### When building a new kit

1. Read this file (KITS-ROADMAP.md) first.
2. Pick the kit's home directory (which repo, which subfolder).
3. Build the standard 7-file scaffold first; fill it before writing any
   skills.
4. Build skills against the filled scaffold, not in parallel.
5. Verify backend APIs before declaring the kit done.
6. Update this file's status table.

### Future helper: `skill-kit-builder` skill

Eventually a meta-skill that bootstraps a new kit following this standard.
Don't build it until at least 3 kits exist, so the pattern is well-tested.

---

## What this file is NOT for

- Implementation plans for kits not yet started. Those live in the kit
  itself (in its own `WORKFLOW.md`) once we build it.
- A backlog of features within an existing kit. Those are tasks the user
  raises in conversation; the kit's troubleshooting/data-audit catches drift.
- A wish list. Every entry above is a kit we've explicitly agreed to.
