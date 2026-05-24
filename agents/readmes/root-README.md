<div align="center">

# ConvexPress

**A modern, type-safe, real-time WordPress replacement — with integrated e-commerce, AI-driven design, and a desktop app.**

[![Status: Heavy Alpha](https://img.shields.io/badge/status-heavy%20alpha-red)](#-heads-up-this-is-heavy-alpha)
[![Version](https://img.shields.io/badge/version-0.1.0--alpha.1-orange)](#-project-status)
[![License: FSL-1.1-MIT](https://img.shields.io/badge/license-FSL--1.1--MIT-blue)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Convex](https://img.shields.io/badge/Convex-1.31-FF5A00)](https://www.convex.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![AI-Built](https://img.shields.io/badge/primarily%20AI--built-Claude-8A2BE2)](#-ai-built-disclosure)

*~308,000 lines of code · 39+ integrated systems · 1,200+ files · Built in public*

</div>

---

## 🚨 Heads Up: This Is Heavy Alpha

> **Stop. Read this before you do anything else.**
>
> ConvexPress is **early alpha software**. A lot of it works. A lot of it doesn't. Some of it works but will break in unexpected ways the moment you stress-test it. **Use at your own risk.**
>
> Specifically:
> - **Things will break.** Generated UI may crash. Mutations may fail. Type errors may appear after schema changes.
> - **Things will change.** APIs, schemas, file paths, conventions — anything could be rewritten between commits.
> - **There are no migrations.** If the schema changes, you may need to re-deploy from scratch.
> - **There is no support.** Open an issue if you find something, but don't expect SLAs.
> - **Do not run this in production.** Don't bet your business on this code. Don't bet your data on this code.
>
> If you're here to read the architecture, learn from the patterns, or contribute to a CMS being built openly — welcome. If you're here to deploy a production e-commerce site this weekend, come back in six months.

---

## 🤖 AI-Built Disclosure

ConvexPress was **primarily built with AI** — specifically Anthropic's Claude, orchestrated through a deliberate expert-agent and skill-kit architecture. Every system has a dedicated expert; major task domains (template generation, extension building) have their own skill kits with verified API surfaces, working reference code, and step-by-step workflows.

This is not a human writing code and asking AI for help. This is a human directing AI to build an entire platform, with careful architecture, code review, and verification loops. We think the result is interesting — both as software and as an artifact of how software can be built in 2026. We're being transparent about it.

You'll see patterns that reflect this — extensive per-system documentation, structured commit messages, heavy schema validation, and skill kits at `.claude/KITS-ROADMAP.md` and per-app `extension-kit/` / `design-kit/` folders. Much of it is deliberate.

---

## What Is ConvexPress?

ConvexPress is a **WordPress replacement**. It's modeled after WordPress in structure, naming, and admin layout — if you know WordPress, you'll feel at home. But everything underneath is different:

| WordPress | ConvexPress |
|---|---|
| PHP + MySQL with polling | TypeScript + Convex with **real-time subscriptions** |
| Plugins (fragile, PHP, often abandoned) | Modular type-safe **extensions** with a defined 7-layer contract |
| WooCommerce (plugin) | **Integrated e-commerce** (products, cart, checkout, orders, payments, shipping, digital products, subscriptions, bundles) |
| Gutenberg blocks | Tiptap editor + **AI content generation** (Claude + Tavily research) |
| Pre-built themes from a marketplace | **AI generates the front end per site** via a description-matched skill kit |
| External analytics (Jetpack/GA) | **Built-in analytics** (privacy-respecting, ~2KB tracking) |
| Browser-only admin | Browser **or** Electron desktop app |
| WP REST API | Type-safe Convex queries |

**Who is this for?** Teams who want a modern, fully-integrated CMS + e-commerce platform with type safety, real-time subscriptions, and AI-assisted content + design creation — and are OK being early.

**Who is this not for?** Anyone wanting to install a single plugin into an existing WordPress site, or anyone deploying to production today. ConvexPress replaces the entire WordPress ecosystem. No themes, no third-party plugins, no widgets — instead, AI builds custom sites and we integrate systems directly.

---

## ✨ Highlights

- 🔄 **Real-time by default** — Every admin UI update, cart change, order status, comment moderation action — all reactive through Convex subscriptions. No "pull to refresh."
- 🛒 **Full e-commerce stack built in** — Products, variations, cart, checkout, orders, payments, refunds, shipping rules, digital products with license keys, bundles, subscriptions, reviews, wishlists, returns. Not a plugin — first-class systems.
- 🤖 **AI-driven front-end design** — A `design-kit` of description-matched skills lets Claude generate or regenerate any front-end template (homepage, blog, product, page, custom post type) per site against a brand doc. See `ConvexPress-Website/design-kit/`.
- 🧩 **Extensions, not plugins** — A formal 7-layer extension contract (schema + queries + mutations + admin UI + registry + nav + capabilities) so new feature modules plug in consistently. See `ConvexPress-Admin/extension-kit/`.
- 🤖 **AI content generation** — Claude-powered article creation with Tavily research. Per-section regeneration. SEO-aware.
- 🖥️ **Desktop app mode** — The admin runs as an Electron app with two install modes: **Server** (new install, creates first admin + provisions Convex DB) and **Client** (connects to an existing instance).
- 📦 **WordPress + WooCommerce import** — Bring a WordPress site over in one job: users, posts/pages, Elementor data, media, menus, comments, products, orders, customers, coupons, reviews. With reconciliation, tombstones, and customer-login continuity.
- 🔐 **Role-based access control** — 5 WordPress-standard roles (Administrator, Editor, Author, Contributor, Subscriber) with granular capabilities.
- 📧 **Transactional email built-in** — Resend integration, template system, order notifications, comment moderation alerts.
- 📊 **Privacy-respecting analytics** — Built-in page analytics with 90-day raw retention and indefinite rollups. No third-party trackers required. GA4 integration available if you want it.
- 🎨 **Base UI only** — No Radix. Consistent component library throughout. (Opinionated, on purpose.)
- 📝 **Type-safe end-to-end** — Every mutation, query, and action is fully typed from schema to UI. No "it compiles and hopefully works."

---

## 🏗️ Architecture

### Two apps, one database

| | Framework | Role |
|---|---|---|
| **`ConvexPress-Admin`** | TanStack Router + Vite (SPA) | **Convex database OWNER** — schema, mutations, queries |
| **`ConvexPress-Website`** | TanStack Start (SSR) | **Convex database CONSUMER** — SSR for SEO, public pages |

The admin owns the Convex database. The website never deploys — it connects as a consumer via `CONVEX_URL`. One database, two apps.

### Monorepo

Both apps are [Better-T-Stack](https://better-t-stack.dev/) Turborepo monorepos:

```
{app}/
├── apps/web/          # The frontend
├── packages/backend/  # Convex schema & functions (admin only)
├── packages/config/   # Shared config
└── packages/env/      # Environment variables
```

### Modular schema

Every system owns its schema file. The hub `schema.ts` just imports and spreads:

```
convex/schema/
├── users.ts
├── posts.ts
├── commerce.ts
├── comments.ts
├── media.ts
└── ... (46 schema files)
```

### Desktop packaging

The admin app packages as a cross-platform Electron app (DMG/EXE/AppImage) via `electron-builder`. Two install flows:

- **Server mode**: First-time setup — installs ConvexPress, creates the first administrator, provisions the Convex database.
- **Client mode**: Connects to an existing ConvexPress instance by entering the site URL.

### Authentication

- **Admin app**: Convex Auth (built-in Convex authentication)
- **Website app**: Clerk (managed auth)

### AI-first work pattern: skill kits

Beyond expert agents, ConvexPress organizes Claude-driven work into **skill kits** — folders of documentation + description-matched skills that let Claude execute domain-specific tasks consistently. Two kits exist today:

- **`design-kit`** in `ConvexPress-Website/` — Front-end template generation per site. Skills: `design:homepage`, `design:single-post`, `design:single-page`, `design:archive`, `design:catalog`, `design:single-product`, `design:search`, `design:header`, `design:footer`, `design:not-found`, `design:custom-post-type`, `design:page-feature`, `design:brand-discovery`, `design:regenerate-all`, `design:data-audit`.
- **`extension-kit`** in `ConvexPress-Admin/` — Building, extending, and auditing toggleable feature modules. Skills: `extension:build`, `extension:add-feature`, `extension:audit`.

See `.claude/KITS-ROADMAP.md` for the full kit roadmap (existing + agreed-on future kits) and the standard kit scaffold.

---

## 🧩 The Systems

ConvexPress is organized around **39+ integrated systems**. Each has a dedicated expert agent with full knowledge of its domain. Here's the map:

<details open>
<summary><strong>Content Management (7)</strong></summary>

- **Post System** — Blog post lifecycle (draft, publish, schedule, trash), revisions, bulk actions
- **Page System** — Static pages, hierarchical, independent of posts
- **Content Editor** — Tiptap-based WYSIWYG editor with autosave, drafts, preview
- **Revision System** — Post/page revision history with restore and compare
- **Taxonomy System** — Categories, tags, custom taxonomies with hierarchy
- **Custom Field System** — ACF-like flexible meta fields for posts/pages/products
- **Media System** — Upload, organize, crop, metadata, gallery

</details>

<details open>
<summary><strong>Commerce (13)</strong></summary>

- **Products** — SKU, pricing, inventory, media gallery, virtual/downloadable
- **Variations** — Variable products (size/color/etc.) with attribute combinations
- **Product Categories** — Hierarchical categories with thumbnails
- **Cart** — Shopping cart with line items, quantities, status
- **Checkout** — Multi-step (shipping → payment → review)
- **Orders** — Order management, statuses, fulfillment tracking, history
- **Customers** — Customer profiles, addresses, purchase history, guest orders
- **Payments** — Payment processing, refunds, payment recovery
- **Shipping** — Zones, classes, rates, address validation, ship-from locations
- **Discount Codes** — Coupons, usage limits, date ranges, product/category restrictions
- **Digital Products** — License keys, download tokens, expiration, seat limits
- **Bundles** — Bundle products with selection variants and bundle-specific pricing
- **Reviews** — Ratings, verified purchases, moderation queue
- **Wishlists** — Saved products, shareable lists
- **Subscriptions** — Recurring billing, renewal schedules, cancellation
- **Returns & Refunds** — Return requests, RMA tracking, restocking

</details>

<details>
<summary><strong>Infrastructure (14)</strong></summary>

- **Auth System** — Authentication, sessions, Convex Auth integration
- **User Profile System** — Accounts, bios, preferences, social links
- **Role & Capability System** — RBAC with 5 standard roles + granular caps
- **Password Management** — Reset flows, token expiration, policies
- **Registration System** — Registration, email verification, invite codes
- **API System** — External API access, API keys, rate limiting, webhooks
- **Routing System** — URL routing, slugs, 404 handling, post type routes
- **Menu System** — Navigation builder, hierarchical menu items
- **SEO System** — Meta tags, JSON-LD structured data, canonical URLs
- **Search System** — Full-text search, filters, real-time indexing
- **Sitemap System** — XML sitemaps, auto-generation on publish
- **RSS/Feed System** — RSS/Atom feeds per post type or category
- **Settings System** — Global site settings, configurable API keys
- **Dashboard System** — Admin dashboard widgets, metrics

</details>

<details>
<summary><strong>Notifications (3)</strong></summary>

- **Email Notifications** — Resend-powered transactional emails, templates
- **Site Notifications** — In-app toast + notification center
- **Event Dispatcher** — Internal event bus (post_published, order_created, etc.)

</details>

<details>
<summary><strong>Data & Analytics (3)</strong></summary>

- **Analytics System** — Built-in page analytics (views, referrers, devices, geo)
- **GA4 Integration** — Google Analytics 4 with property linking
- **Audit Log** — Activity log for compliance and debugging

</details>

<details>
<summary><strong>AI & Advanced (2)</strong></summary>

- **AI Content Generation** — Claude-powered article creation with Tavily research
- **Tabbed Editor Shell** — Per-page dashboard tabs with isolated state

</details>

<details>
<summary><strong>Admin UI (4)</strong></summary>

- **Admin Shell UI** — Left sidebar, admin bar, navigation, breadcrumbs
- **Admin List Table UI** — Bulk actions, filters, sorting, pagination (WordPress-style)
- **Admin Editor UI** — Full-page editor with metaboxes, sidebars, publish box
- **Admin Settings UI** — Settings pages, form patterns, tabbed interfaces

</details>

<details>
<summary><strong>Website UI (4)</strong></summary>

- **Website Layout UI** — Header, footer, navigation, responsive design
- **Website Blog UI** — Archives, category pages, search results, pagination
- **Website Auth UI** — Clerk-powered login, registration, password reset
- **Website User Dashboard UI** — Orders, profile, downloads, license keys

</details>

<details>
<summary><strong>Migration (1)</strong></summary>

- **WordPress/WooCommerce Import** — Full-site import: users, posts/pages, Elementor, media, menus, comments, products, orders, customers, coupons, reviews. Reconciliation + tombstones. Customer-login continuity so imported customers see their orders on first sign-in.

</details>

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Admin frontend** | React 19, TanStack Router, Vite 7 |
| **Website frontend** | React 19, TanStack Start (SSR) |
| **Database** | [Convex](https://www.convex.dev/) — real-time reactive database |
| **Admin auth** | [Convex Auth](https://labs.convex.dev/auth) |
| **Website auth** | [Clerk](https://clerk.com) |
| **UI components** | [Base UI](https://base-ui.com/) *(not Radix)* |
| **Styling** | Tailwind CSS v4 + cva + clsx + tailwind-merge |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Toasts** | [Sonner](https://sonner.emilkowal.ski/) |
| **Forms** | TanStack Form + Zod |
| **Content editor** | [Tiptap](https://tiptap.dev/) v3 |
| **Email** | [Resend](https://resend.com/) |
| **Desktop** | Electron + electron-builder + electron-store |
| **AI routing** | [OpenRouter](https://openrouter.ai/) (Anthropic Claude) |
| **Research** | [Tavily](https://tavily.com/) |
| **Package manager** | [Bun](https://bun.sh/) |
| **Monorepo** | [Turborepo](https://turbo.build/repo) |
| **Language** | TypeScript 5.9 (strict) |

---

## 📁 Repository Structure

```
ConvexPress/
├── ConvexPress-Admin/             # Admin SPA (Convex OWNER)
│   ├── apps/web/                  # TanStack Router admin UI
│   │   └── src/routes/            # File-based routes
│   ├── packages/backend/          # Convex schema + functions
│   │   └── convex/
│   │       ├── schema.ts          # Hub — imports all system schemas
│   │       ├── schema/            # One file per system (46 files)
│   │       ├── helpers/           # Shared helpers (auth, perms, events)
│   │       └── {system}/          # Per-system function dirs
│   ├── packages/desktop/          # Electron main, preload, IPC, build
│   ├── extension-kit/             # Operational AI extension kit
│   └── .claude/skills/            # extension:* skill set
├── ConvexPress-Website/           # Website SSR (Convex CONSUMER)
│   ├── apps/web/                  # TanStack Start public site
│   ├── design-kit/                # Operational AI design kit
│   └── .claude/skills/            # design:* skill set
├── specs/                         # PRDs and design specs
├── plans/                         # Implementation plans and runbooks
├── audits/                        # Audits, reports, and verification notes
├── scripts/                       # Audit, check, and smoke scripts
├── agents/                        # Agent prompts, skills, kit docs, and instructions
└── .claude/
    ├── CLAUDE.md                  # Architecture and development rules
    ├── KITS-ROADMAP.md            # Skill-kits standard + roadmap
    └── docs/                      # Per-system expert knowledge docs
```

---

## 📊 Project Status

Honest, system-by-system. This is heavy alpha — refer back to the **⚠️ Heads Up** section above for scope.

| Category | Status | Notes |
|---|---|---|
| **Core content (posts/pages/media/editor/taxonomies)** | ✅ 90% | Production-capable, but no migration story for schema changes |
| **Commerce (products/cart/checkout/orders/payments)** | ✅ 85% | Feature-complete; payment UI polish remaining |
| **Admin UI** | ✅ 90% | WordPress-familiar list tables, editor, settings |
| **Auth & roles** | ✅ 95% | Solid — Convex Auth + Clerk + RBAC |
| **Desktop/Electron** | 🟡 70% | Server & client modes work; needs refinement |
| **Website SSR** | ✅ 85% | TanStack Start integration solid |
| **Design kit (AI template generation)** | 🟡 60% | Skill kit complete; first real generation cycle not yet validated end-to-end |
| **Extension kit** | 🟡 60% | Skill kit complete; first new extension build via the kit not yet validated |
| **WordPress import** | 🟡 60% | Core flows work; **password sync impossible via WP REST API** — imported users need a password-reset flow before login works |
| **Analytics** | 🟡 20% | Backend ready, UI partial |
| **Automated test suite** | 🔴 Not ready | Framework in place; coverage is thin |

**Bottom line:** You can publish content, run an online store, manage users, and import a WordPress site (with caveats). You should not bet your business on it today.

---

## 🚀 Getting Started

> **Note:** Setup is still rough. If you want to run ConvexPress right now, expect to read some code and probably fix some things.

### Prerequisites

- [Bun](https://bun.sh/) 1.3+
- A [Convex](https://www.convex.dev/) account
- A [Clerk](https://clerk.com/) account (for the website)
- A [Resend](https://resend.com/) account (optional, for transactional email)
- An [OpenRouter](https://openrouter.ai/) API key (optional, for AI content generation)

### Quick start

```bash
# Clone the repo
git clone https://github.com/worsin/ConvexPress.git
cd ConvexPress

# Install admin dependencies
cd ConvexPress-Admin
bun install

# Deploy Convex (provisions your database)
bunx convex dev

# Run the admin dev server
bun run dev
```

Then in a separate terminal:

```bash
# Install website dependencies
cd ConvexPress-Website
bun install

# Point the website at your Convex URL in .env.local
# CONVEX_URL=https://...convex.cloud
# VITE_CLERK_PUBLISHABLE_KEY=...

bun run dev
```

### Electron desktop

```bash
cd ConvexPress-Admin
bun run desktop:dev    # Dev mode
bun run desktop:build  # Package for current platform
```

---

## 🧠 Philosophy

A few opinions baked into the codebase:

**No third-party plugins, no themes, no widgets.** The WordPress plugin model introduces instability, security risk, and fragmentation. ConvexPress takes the opposite approach: a cohesive, integrated platform with a defined extension contract for new feature modules. If you need customization, you customize the code directly (or have AI do it for you).

**AI generates the front end.** Templates aren't picked from a marketplace; they're generated per site by Claude against a brand doc, via the `design-kit`. Each site is bespoke React rather than a theme veneer.

**Full-page navigation, not modals.** Editing a post opens a full page. Adding a user opens a full page. Managing content never happens in a popup. Modals are reserved for destructive confirmations.

**WordPress-familiar naming.** "All Posts," "Add New Post," "Media Library," "Your Profile," "Settings → Reading." If you've used WordPress, the layout is already in your muscle memory.

**Type safety is non-negotiable.** From schema to UI, everything is typed. `any` is a bug.

**Dynamic data everywhere.** No hardcoded content. Every piece of text on every page is driven by database fields controlled from the admin.

---

## 📚 Documentation

- **`specs/`** — PRDs and design specs.
- **`plans/`** — Implementation plans, phased rollout plans, roadmaps, and runbooks.
- **`audits/`** — Audits, gap reports, parity reports, ledgers, and verification notes.
- **`scripts/`** — Audit, check, and smoke scripts.
- **`agents/`** — Agent prompts, skill mirrors, kit docs, instructions, and expert knowledge mirrors.
- **`plans/project/website-import-runbook.md`** — WordPress/WooCommerce import operator guide.

---

## 🤝 Contributing

We're not yet set up for external contributions. The codebase is still stabilizing and we don't have a contribution workflow documented. Watch this space.

If you find a bug or have a question, please [open an issue](../../issues). We read them.

---

## 🛣️ Roadmap

Rough direction, not commitments:

- **Short-term (next few weeks)**
  - Validate `design-kit` end-to-end on a real site
  - Build a real new extension via `extension-kit` and validate the 7-layer contract
  - Polish WordPress/WooCommerce import edge cases (and add the password-reset / magic-link flow for migrated users)
  - Analytics dashboard UI
  - Payment UI polish
- **Medium-term**
  - Expand the kit set (content-kit, migration-kit, seo-kit, performance-kit — see `KITS-ROADMAP.md`)
  - Multi-site deployment tooling
  - Advanced scheduling / workflows
  - Performance audit and optimization pass
- **Long-term**
  - Hosted ConvexPress service (alternative to self-hosting)
  - AI-driven full-site generation from a brief

---

## 📄 License

**[Functional Source License v1.1 (FSL-1.1-MIT)](LICENSE).** Copyright © 2026 Worsin.

In plain English:
- **You can use, modify, and distribute the code** for any purpose **except** competing commercially with ConvexPress itself (i.e., offering it as a hosted CMS service).
- **On 2028-05-11** (two years from initial publication), this license automatically converts to **MIT** — fully permissive, no restrictions.
- See [`LICENSE`](LICENSE) for the full legal text.

This is the same model Sentry, GitButler, and others use. It's source-available now, fully open-source in 2 years.

---

## 🙏 Acknowledgements

Built on the shoulders of [Convex](https://www.convex.dev/), [TanStack](https://tanstack.com/), [Base UI](https://base-ui.com/), [Tiptap](https://tiptap.dev/), [Clerk](https://clerk.com/), [Resend](https://resend.com/), and [Anthropic's Claude](https://anthropic.com/claude). Modeled after [WordPress](https://wordpress.org/), the platform that taught a generation of developers what a CMS should feel like.

---

<div align="center">

**ConvexPress · v0.1.0-alpha.1 · Built in public · Use at your own risk**

[Report an issue](../../issues) · [Discussions](../../discussions) · [License](LICENSE)

</div>
