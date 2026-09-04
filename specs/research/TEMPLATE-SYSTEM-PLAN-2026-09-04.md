# Template System Plan — switchable front-end template packs for ConvexPress

Status: plan, 2026-09-04. No code written. Sequenced after the Dashboard plugin.

## 1. Why, and what changes

One ConvexPress-Website checkout now runs every site (runtime site config, one process per environment). The design-kit's current model — bespoke React written straight into `apps/web/src/routes/…` by the `design:*` skills — cannot survive that: every site shares the same route files, so a regenerated homepage for one site is the homepage for all of them.

The fix is to keep the design-kit's philosophy (each surface is bespoke React, brand-driven, no section enum) but move the *unit* from "a route file" to "a template pack": a folder of surfaces that a site selects in the admin. Routes become thin: they load data and render `<Surface name="blog.post" …/>`; the active pack decides how that surface looks.

What we already have that this builds on: per-site brand (fonts, radius, industry), colour palette, header/footer builders, menus, 51 blocks, the shop and product layout presets, and the runtime site config. Brand stays site data ("skin"); a pack is structure. Any pack on any brand.

Three rules that keep this honest with earlier decisions:

1. **Not a theme marketplace.** The frozen Theme Builder bundled colours + section enums. Packs never own colours; they read the brand. The deprecated `themes`, `layouts`, `templates/`, `template-parts/` code gets deleted in phase 1.
2. **Bespoke React, not a section enum.** A pack surface is a React component with full freedom inside the SDK contract. The block system stays the site owner's composition tool for pages; packs render blocks, they do not replace them.
3. **Plugins own their surfaces.** Each plugin declares the customer-facing surfaces it contributes (and their view models). Packs implement them. The admin coverage matrix is computed from those declarations, so "does this template cover the shopping cart?" is always a true answer.

## 2. Vocabulary

| Term | Meaning |
|---|---|
| **Surface** | One customer-facing screen or region with a typed view model, e.g. `shop.product`, `dashboard.orders`, `chrome.header`. |
| **Part** | A reusable piece surfaces compose: `product.card`, `cart.panel`, `pagination`, `post.card`. Packs can override parts independently. |
| **Variant** | A named alternative composition of one surface inside a pack (today's Boutique/Marketplace and the five product layouts). Chosen per site. |
| **Template pack** | A folder with a manifest, surfaces, parts, variants, previews, optional pack CSS. Ids: `core`, `journal`, `depot`, `<site>-custom`. |
| **SDK** | The only API a pack may use: view-model types, data hooks, primitives, token classes. Versioned. |
| **Coverage** | Which surfaces a pack implements itself, which fall back to Core, which it declares unsupported. Shown in the admin. |

## 3. Surface inventory (what must be templatable)

Derived from the route sweep of 2026-09-04 (116 route files). API handlers, redirects and the legacy `/shop` and `/account/*` routes are excluded. Surfaces marked ★ already have a state hook or layout presets that become SDK view models directly.

### 3.1 Chrome and system (always on)

| Surface / part | Today | Notes |
|---|---|---|
| `chrome.header` | `SiteHeader` + `DesktopNav`, `SiteBrand`, `HeaderActions` | Reads headerConfig + menus; pack decides markup |
| `chrome.mobileNav` | `MobileNav` | Focus-trap behaviour comes from the SDK hook, not the pack |
| `chrome.footer` | `SiteFooter` + `FooterRowsRenderer` | Reads footerConfig rows |
| `chrome.searchOverlay` | `SearchOverlay` | |
| `chrome.cartDrawer` ★ | `CartDrawer` | Same cart hook as the panel |
| `chrome.userMenu`, `chrome.notificationBell`, `chrome.themeToggle` | `UserMenu`, `WebsiteNotificationBell`, `ThemeToggle` | |
| `chrome.breadcrumbs`, `chrome.backToTop`, `chrome.skipLink` | | |
| `chrome.adminBar` | `WebsiteAdminBar` | System-owned, not templatable |
| `system.notFound`, `system.error`, `system.restricted`, `system.passwordGate`, `system.loading` | `NotFoundTemplate`, `ErrorTemplate`, `RestrictedContent`, `PagePasswordForm`, skeletons | |

### 3.2 Content (core, no plugin)

| Surface | Route(s) | Parts used |
|---|---|---|
| `home` | `/` (latest posts / static page / shop dispatch) | `post.grid`, `blocks.list` |
| `page` (variants: default, sidebar-left, full-width, no-sidebar, landing, blank) | `/page/*`, `/$slug` | `blocks.list`, `page.children`, `page.breadcrumbs` |
| `blog.index` | `/blog` | `post.card`, `post.grid`, `pagination` |
| `blog.post` | `/blog/$slug` (+ dated permalinks) | `post.header`, `blocks.list`, `author.box`, `post.related`, `comments`, `share` |
| `blog.archive` | `/archive` | |
| `blog.author`, `blog.category`, `blog.tag` | `/author/$slug`, `/category/$slug`, `/tag/$slug` | `archive.header`, `post.grid`, `taxonomy.breadcrumbs` |
| `search` | `/search` | `search.form`, `search.result`, `search.filters`, `pagination` |

### 3.3 Commerce (plugin `commerce` and sub-plugins)

| Surface | Route(s) | Gate |
|---|---|---|
| `shop.catalog` ★ (variants boutique, marketplace) | `/products`, `/products?q=` | commerce |
| `shop.product` ★ (variants classic, marketplace, split, showcase, minimal) | `/products/$slug` | commerce |
| `shop.categories`, `shop.category` | `/categories`, `/categories/$slug` | commerce |
| `cart` ★, `cart.shared` | `/cart`, `/cart/shared/$token` | commerce |
| `checkout.details`, `checkout.shipping`, `checkout.payment`, `checkout.review`, `checkout.confirmation` | `/checkout/*` | commerce |
| `order.track` | `/track/$token` | commerce |
| `bundles.index`, `bundles.detail` | `/bundles`, `/bundles/$slug` | commerceBundles |
| `wishlist.shared` | `/wishlist/$token` | commerceWishlists |
| `pricing`, `signup.offer` | `/pricing`, `/signup/$offerId` | commerceSubscriptions |
| Parts ★ | `product.card`, `product.miniCard`, `cart.panel`, `cart.line`, `product.reviews`, `product.related`, `assistant.rail` (structure only; behaviour is SDK) | |

### 3.4 Plugins

| Plugin | Surfaces | Routes |
|---|---|---|
| `lms` | `courses.index`, `courses.detail`, `courses.lessonPreview`, `certificates.verify`, `certificates.view` | `/courses/*`, `/certificates/*` |
| `kb` | `help.home`, `help.search`, `help.category`, `help.article`, `help.collection` | `/help/*` |
| `tickets` | `support.home`, `support.new`, `support.tickets`, `support.ticket`, part `support.widget` | `/support/*` + floating widget |
| `gallery` | `gallery.index`, `gallery.album`, `gallery.category`, part `gallery.lightbox` | `/gallery/*` |
| `recipes` | `recipes.index`, `recipes.detail`, `recipes.category` | `/recipes/*` |
| `forms` | `forms.form`, `forms.resume` | `/forms/*` |
| `membership` | `system.restricted` variants, `dashboard.membership` | route gate + dashboard |

### 3.5 Account dashboard (becomes the Dashboard plugin)

`dashboard.shell` (sidebar, mobile nav, header variant) and 21 pages: `home`, `profile`, `settings`, `security`, `notifications`, `comments`, `posts`, `courses`, `lesson`, `orders`, `order`, `orderReturn`, `returns`, `return`, `subscriptions`, `subscription`, `downloads`, `reviews`, `wishlist`, `addresses`, `membership`. Each commerce/LMS page keeps its sub-plugin gate. Dashboard nav items must come from plugin declarations (today the sidebar lists 8 of 21 pages and is not plugin-aware).

### 3.6 Auth

`auth.shell` (`AuthPageLayout`) and `auth.login`, `auth.register`, `auth.logout`, `auth.forgot`, `auth.reset`, `auth.verify`. Forms and Clerk logic stay in the SDK; packs style the frame and fields.

### 3.7 Totals

| Group | Surfaces | Parts |
|---|---|---|
| Chrome + system | 5 | 11 |
| Content | 9 | 12 |
| Commerce (all sub-plugins) | 17 | 7 |
| LMS, KB, Support, Gallery, Recipes, Forms | 22 | 2 |
| Dashboard | 22 | 2 |
| Auth | 7 | 0 |
| **Total** | **82** | **34** |

Coverage areas shown in the admin (16): Chrome, Pages, Blog, Search, Shop, Cart & Checkout, Bundles, Wishlist & Sharing, Subscriptions & Pricing, Courses & Certificates, Help Center, Support, Gallery, Recipes, Forms, Account Dashboard, Auth. An area is "covered" when every surface in it is implemented by the pack, "partial" when some fall back to Core, "system" when the area is not templatable, and "not enabled" when its plugin is switched off in `/plugins` (still shown, not counted).

## 4. The SDK (`@convexpress/storefront-sdk`)

Lives in `ConvexPress-Website/packages/storefront-sdk`. Semver; each manifest declares `sdk: "^1"`. Contents:

- **View models** — one exported type per surface, plus `SiteIdentity`, `MenuTree`, `BrandDoc`, `PublicPlugins`. Existing hooks are promoted: `useProductPage` → `shop.product`, `useCart` → `cart`/`cart.panel`, `useAssistantConfig`, post/page detail types from `lib/blog/types`.
- **Data hooks** — `useSurfaceData(name)` style hooks that are the *only* way a pack reaches data. No `convex/react`, no `api.*` imports inside a pack (lint rule).
- **Primitives** — `MediaImage`, `Link`, `Money`, `RichText` (sanitized), `BlockList`, `Pagination`, `Form` field bindings, `Skeleton`, `Icon`. Base UI only, no Radix.
- **Chrome behaviour hooks** — `useLayoutShell` (mobile nav, search open, inert), `useShopShell` (assistant open/close, cart column), `useHeaderConfig`, `useFooterConfig`, `useMenuForLocation`.
- **Tokens** — the token classes are the whole palette a pack may use. Packs may add a `pack.css` for pack-specific tokens derived from the site tokens (e.g. `--pack-measure`).
- **Contracts** — the design-kit `CONTRACTS.md` list (SSR prefetch, SEO head, a11y, responsive, brand, performance) becomes machine-checked where possible.

Surface component signature:

```
export default function ProductSurface(props: SurfaceProps<"shop.product">): ReactElement
// props.data: ProductPageState, props.site: SiteIdentity, props.variant?: string, props.parts: PartRegistry
```

## 5. Template packs

```
apps/web/src/templates/packs/<id>/
  template.json      id, name, version, sdk range, author, description, coverage[], variants{}, screenshots{}
  pack.css           optional pack tokens (derived from site tokens only)
  surfaces/          one file per surface id it implements (shop.product.tsx …)
  parts/             product.card.tsx, cart.panel.tsx …
  variants/          shop.catalog/boutique.tsx, marketplace.tsx …
  previews/          <surface>.png generated by the check script
```

Discovery: `import.meta.glob("../templates/packs/*/template.json")` at build time, same pattern as blocks. Packs are in the repo, so Tailwind compiles their classes and SSR just works.

**Resolution** (WordPress hierarchy, per environment): site setting `appearance.template.active` → `appearance.template.overrides[surface]` → pack surface → pack variant default → `core`. Missing surface in a pack is never an error at runtime; it is a coverage gap shown in the admin.

**Launch packs**

| Pack | Character | Best for |
|---|---|---|
| `core` | The current front end, extracted unchanged. Full coverage by definition. | Fallback, migration safety |
| `journal` | Editorial, centred measure, serif-friendly, generous whitespace, boutique shop, split product page. Northstar's look, generalised. | Small catalogs, content-led brands, services |
| `depot` | Dense, edge-to-edge, utility-first, marketplace shop, three-column product page, compact dashboard. Ridgeline's look, generalised. | Large catalogs, parts, comparison shoppers |

Both new packs implement all 82 surfaces (Core fallback is allowed only while they are being built; the phase gate is 100% coverage).

**Custom and AI packs** are the same shape with id `<site-slug>-custom`, written by the `template-build` skill into the same folder, committed, and deployed. Because one checkout runs all sites, a site-specific pack is simply an extra folder that only that site activates.

## 6. Settings, control plane and preview

- New section `appearance.template`: `{ active: string, overrides: Record<surface, packId>, variants: Record<surface, variantId>, updatedAt }`. Public via `templateConfig` in `getPublic`. `commerce.layout` from tonight folds into `variants` (`shop.catalog`, `shop.product`) with a migration.
- Per environment: live and staging each hold their own value; "Promote to live" copies staging's section (matches the instance model).
- Preview: `?template=<id>` and `?variant.<surface>=<id>` overrides, never persisted, same mechanism as `?layout=` today.
- Control plane (later): an org-level "template library" listing which packs exist in the checkout and which sites use them; useful for 20 sites, not required for phase 1.

## 7. Admin: Appearance › Templates

Replaces the frozen Themes screen.

1. **Gallery** of installed packs from the registry: cover screenshot, name, author, SDK version, "Active" badge, and a **coverage matrix** of the 16 areas (covered / partial / system) with a count, e.g. "Shop ✓ · Cart & Checkout ✓ · Courses partial (2 of 5 fall back to Core)".
2. **Pack detail**: every surface with its screenshot, which variants it offers, and per-surface override (use another pack's surface). "Preview on site" per surface via the runner.
3. **Activate** (per environment) with a diff of what changes; "Promote staging to live".
4. **Variants** tab: the shop and product pickers move here, generalised to any surface that declares variants.
5. **Generate with AI**: wizard collecting brand doc confirmation, references, industry, and which areas to cover; launches the `template-build` skill through the site runner, shows progress, produces a new pack in the gallery with its screenshots.

## 8. Plugin ↔ template contract (built on the existing plugin enabler)

The admin already has the WordPress-style enabler: `/plugins` toggles write the `plugins` settings section; every plugin is an `AdminPluginDefinition` (`settingsKey: "<id>Enabled"`, `navSectionIds` that auto-hide sidebar sections, `adminAccessPrefixes` guarded by `PluginGuard`, public `routePrefixes`); platform plugins are hand-listed and v2 extensions are discovered from `extensions/<id>/manifest.ts`. The Website mirrors the on/off state through `isPublicPluginEnabled` and `PublicPluginGate`. The template system extends that contract rather than adding a second one:

1. **Website-side manifest per plugin.** `ConvexPress-Website/apps/web/src/extensions/<id>/manifest.ts` (platform plugins get the same file under `plugins/<id>/`) declares, next to the id and `settingsKey` it shares with the admin definition: `routePrefixes`, `surfaces[]` (id, title, coverage area, view-model type, gate), `parts[]`, `dashboardNav[]` (label, path, icon, which sub-plugin gates it) and `chromeParts[]` (e.g. the support widget, the cart drawer). Discovered with `import.meta.glob`, like blocks and the admin scanner.
2. **One source of truth for "enabled".** `isPublicPluginEnabled` is rewritten to read the manifests' `settingsKey` (this also retires the hand-written switch with the `kb`/`knowledgeBase` alias). Parent dependencies (commerce sub-plugins) come from a `parent` field, matching the admin's `getPluginParent`.
3. **Surface catalog = core surfaces + surfaces of every plugin**, enabled or not. The registry knows all of them; the site only *renders* the enabled ones because the route gate runs first, exactly as today.
4. **Coverage follows the enabler.** The Appearance › Templates matrix counts only enabled plugins' areas toward a pack's coverage. Disabled areas show as "Not enabled — 5 surfaces ready" so the operator knows that switching a plugin on later will not leave a hole, and each disabled area links to `/plugins`. Enabling a plugin re-computes coverage immediately (same settings query).
5. **Sidebar and nav follow the enabler too.** Appearance › Templates is core and always visible. Plugin-specific template settings (variant pickers such as Shop layouts) carry `pluginId` and live inside that plugin's nav section, so they appear and disappear with the plugin — the existing behaviour for Shop assistant and Shop layouts.
6. **Dashboard plugin first.** It becomes a platform plugin definition (`navSectionIds: ["dashboard"]`, `routePrefixes: ["/dashboard"]`) whose Website manifest declares `dashboard.shell` and the 21 pages, plus `dashboardNav` entries that other plugins contribute to (commerce adds Orders/Addresses, commerceReturns adds Returns, lms adds Courses, and so on). The customer sidebar is then built from the enabled plugins' entries, which fixes today's hard-coded 8-item list.
7. **AI generation scope.** The Generate wizard proposes the enabled plugins' surfaces by default and lets the operator include disabled ones so the pack is complete before a plugin is switched on.

## 9. Validation

`bun run check:templates` (mirrors `check:blocks`): manifest schema; every declared surface file exists and default-exports the right signature; no `convex/react`, `api.*`, `@radix-ui`, deprecated modules; no colour literals; SSR-safe (no `window` during render — lint rule + a render-in-node smoke); coverage computed and written back to the manifest; Playwright screenshots of every surface for the gallery (extends `shoot-storefront.mjs`). CI runs it per pack. Existing suites (website 367, admin 2178) stay green throughout; the storefront screenshot suite becomes the regression net for phase 1.

## 10. Phases

| Phase | Work | Gate |
|---|---|---|
| 0 | Dashboard plugin (in progress, separate) declares its surfaces and nav per §8 | Dashboard routes render from the declaration |
| 1 | SDK package, surface registry, `<Surface/>` in every route, Core pack extraction, `appearance.template` section, resolution + preview override, delete legacy themes/layouts/templates/template-parts, `check:templates`, screenshot suite for all 82 surfaces | Core pack = 100% coverage, all tests green, every route renders through the registry |
| 2 | Appearance › Templates gallery, coverage matrix, activate, per-surface overrides, variants tab (migrating Shop layouts), promote staging→live | Switching Core ↔ Core-copy in the UI changes the live site |
| 3 | `journal` pack, all 82 surfaces | Coverage 100%, screenshots, a11y pass, Northstar switched to it through the UI |
| 4 | `depot` pack, all 82 surfaces | Same, Ridgeline switched to it |
| 5 | `template-build` skill (retarget design-kit + `design:*` skills from routes to packs), admin Generate wizard, runner integration for preview, CI | An AI-generated pack for a third demo brand activates and passes checks |
| 6 | Hardening: contract versioning tests, control-plane library, docs | |

Rough sizing at agent pace: phase 1 is the large one (touches ~90 route files) at 1–2 weeks; phases 2–4 about a week each; phase 5 about a week.

## 11. Decisions to make now

1. **Names**: `journal` and `depot` for the launch packs (avoid "Atelier", which is the admin shell brand).
2. **Where variants live**: inside packs (proposed) rather than as a global list, so a pack can offer its own compositions.
3. **Delete legacy**: `templates/` (14 files), `template-parts/` (7), admin `appearance/themes`, backend `themes` and `layouts` tables — remove in phase 1 rather than carry.
4. **`/shop` legacy route**: delete; `/products` is the catalog.
5. **`useLayoutConfig` shell hard-coding**: fold into the pack (content max-width becomes a pack decision).
6. **Consent banner**: none exists; add as `chrome.consent` surface in phase 1 so packs style it from day one.
7. **Surface-level override granularity**: allow per-surface, not per-part, in the admin (parts follow their pack) to keep the UI understandable.


## 12. The extension SDK: three kits, one contract style

Goal (2026-09-04): AI can build a whole site in a short time and nothing is hardcoded unless the AI wrote a block, a plugin or a template. The SDK is therefore three kits with the same anatomy, and the contracts between them.

| Kit | Exists today | Adds | Produces |
|---|---|---|---|
| **block-kit** (`block-build`, `block-add-feature`, `block-audit`) | Yes: contract, references, scaffold, `check:blocks`, skill | Two reference blocks that exercise every field type and a live-data block (the commerce blocks from tonight are the model) | `apps/web/src/blocks/<id>/` in both apps |
| **extension-kit** (`extension-build`, `extension-add-feature`, `extension-audit`) | Yes for the admin side (manifest, nav, guard, settings) | The **Plugin Template**: a complete reference plugin (`events`) with backend schema + functions, admin screens, the Website manifest from §8 (public surfaces, dashboard nav entries, chrome parts), Core-pack surfaces for its public routes, tests, and screenshots. Scaffold `bun run create:extension` copies it | admin `extensions/<id>/`, website `extensions/<id>/`, backend `convex/extensions/<id>/` |
| **template-kit** (new: `template-build`, `template-add-surface`, `template-audit`) | No; replaces the route-writing `design-*` skills | Contract (SDK rules from §4), reference pack (`core` itself plus an annotated mini-pack), scaffold `bun run create:template`, `check:templates`, screenshot gallery | `apps/web/src/templates/packs/<id>/` |

Shared anatomy every kit must have (the `block-build` shape, kept identical so agents transfer between kits):
1. `README.md` — what the thing is, when to use which skill.
2. `CONTRACT.md` — hard requirements, machine-checked where possible.
3. `references/` — real, working examples that pass the checks.
4. `scaffold/` — the starting files the create command copies.
5. `check:<kind>` — one command, exit code is the verdict, prints what to fix.
6. `SKILL.md` — reads 1–4, writes files, runs 5, reports.
7. `DATA-API.md` — the verified callable surface (queries, mutations, view models) for that kind. For templates this is the storefront SDK types; for plugins it is the backend helper API; for blocks it is the settings and media queries a renderer may call.

Contracts between kits (what makes a whole site composable):
- A **plugin** declares surfaces; a **template** implements them; the admin computes coverage (§8).
- A **plugin** may ship blocks; blocks render inside any template because they use tokens and SDK primitives only.
- A **template** never contains data or content; content comes from the block editor, menus, settings and plugin data.

Orchestration skill (after the kits): `site-build` runs brand discovery → choose or generate a template → enable plugins → author pages, menus, media and shop through the admin API (the same steps the Playwright driver performed by hand this week) → screenshot audit. That is the "whip up an entire site" path; it composes the kits, it does not bypass them.

Sequencing relative to §10: the Plugin Template lands with phase 0 (the Dashboard plugin is built from it, so the template is proven on a real plugin first), the reference blocks with phase 1, template-kit with phase 5, `site-build` after phase 5.
