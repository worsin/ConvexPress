# Shopping Experience Build — Assistant Rail, Site Runner, Demo Shops

**Built:** 2026-09-03 → 2026-09-04. **Strategy:** `AI-SHOPPING-EXPERIENCE-STRATEGY-2026-09-02.md` (phases 0–2 delivered, plus the multi-storefront runner that gates all testing).

## What exists now

### 1. One storefront codebase, N running sites
- **Runtime site config** (`ConvexPress-Website/apps/web/src/lib/site-runtime.ts`): each storefront process reads `CONVEXPRESS_CONVEX_URL`, `CONVEXPRESS_CONVEX_SITE_URL`, `CONVEXPRESS_SITE_URL`, `CONVEXPRESS_ADMIN_APP_URL`, `CONVEXPRESS_INSTANCE_KEY`, `CONVEXPRESS_CLERK_PUBLISHABLE_KEY` at boot (VITE_* still work as fallbacks) and injects them into every HTML document as `window.__CONVEXPRESS_SITE__`. `router.tsx`, `start.ts`, feeds, sitemaps, robots, analytics, admin bar and SEO helpers all read from it. `vite.config.ts` takes `PORT` and `CONVEXPRESS_VITE_CACHE_DIR` so concurrent dev servers do not collide.
- **Site runner** (Electron main): `packages/desktop/electron/siteRunner/{siteRunnerValidation,manager}.ts`, IPC in `electron/ipc/siteRunner.ts`, preload namespace `window.convexpress.siteRunner`, renderer hook `apps/web/src/lib/site-runner.ts`, UI in `components/shell/EnvironmentMenu.tsx` + `LocalStorefrontsDialog.tsx`. One process per environment instance (`instanceKey`, or `instanceKey#preview`), each on its own loopback port, Vite cache under `userData/storefront-cache/<key>`, own process group, killed on quit. State in `userData/convexpress-sites.json` (checkout path, remembered ports).
- **"View website" contract:** obeys the environment's site address. Loopback address → start the storefront on that address's port, then open. Remote address → just open. "Open local preview" always starts a dev server on an allocated port (4200–4399), so Live and a local preview of the same site can run at once. "Local storefronts" dialog lists every process with status, port, database, logs, stop/restart, and the checkout folder (auto-found next to the admin, overridable).
- Dev aid: `CONVEXPRESS_SITE_ORIGIN_MAP='{"http://192.168.1.246:4820":"http://127.0.0.1:14820",…}'` rewrites deployment origins for spawned storefronts (used when the worker is only reachable through the SSH tunnel). `CONVEXPRESS_WEBSITE_REPO` overrides the checkout path.

### 2. Backend (`packages/backend/convex`)
- Schema `schema/commerceAssistant.ts`: `commerce_product_relations` (typed edges + evidence), `commerce_assistant_sessions/_messages`, `commerce_shopper_memory`, `commerce_assistant_briefs`, `commerce_search_facets`, `commerce_recommendation_events`. Products gained `searchText` (+ `search_commerce_products_text` index), `conversationalAttributes`, `assistantSummary`. Site-wide `searchIndex` now indexes products (`search/products.ts`, hooked into create/update/status changes and reindex).
- Settings sections `commerce.assistant` (all rail behaviour; exposed publicly as `assistantConfig`) and `brand` (design-kit brand doc). Admin screen: `/settings/shop-assistant`.
- `commerce/storefront.ts`: hybrid product search with facets, product cards, relation-graph groups (`relatedForProducts`, `relatedForCart`), `cartContext`, cached AI facets. `commerce/relations.ts`: graph CRUD + Woo seed.
- `commerce/assistant/`: `actions.respond` (tool-calling turn: search, get, related, add_to_cart, remember, compare → typed blocks), `actions.brief` (zero-prompt brief for search / cart / product, cached 30 min, deterministic fallback), queries/mutations for thread, memory, feedback, attribution. Provider = OpenRouter (or OpenAI) key from Settings › AI; model from `commerce.assistant.model` → `ai.blockEditingModel`.
- Demo seeds: `demoSeed/catalogs/{northstarCoffee,ridgelineCycles}.ts`, `demoSeed/shops.ts` (`seedShop`, `clearShop`, `listShops`), runner `packages/backend/scripts/seed-demo-shop.ts` (OpenRouter image generation, cached on disk; uploads through `demoSeed/actions:importGeneratedMedia`).

### 3. Storefront (`ConvexPress-Website/apps/web/src`)
- `components/shop/ShopShell.tsx` (rail region left/right, sticky, remembered, bottom sheet + FAB on phones), `assistant/{AssistantRail,AssistantBlocks,useAssistant}.tsx`, `ProductMiniCard` / `ProductGridCard` sharing `hooks/useCart.ts` (live "n in cart" steppers everywhere), `RelatedProducts.tsx`.
- Routes: `/products` = catalog + search (`?q`, `category`, `sort`, `min`, `max`), AI "narrow your search" chips, filter rail, grid; product page gets "Goes with this" + "Ask … about this"; cart page and drawer get "Goes with your cart", free-shipping bar, assistant hooks. Header search goes to `/products?q=` when commerce is enabled; site-wide search renders products too.
- Everything is token classes only; each site's palette comes from its active theme (`themes.colorPalette`) via `ThemeStyleInjector`.

### 4. Control plane
- `packages/control-plane/convex/maintenance/demoShops.ts` (`applyShopDemo`): renames the fleet into **Northstar Coffee Co. → Northstar Coffee** (alpha live `http://127.0.0.1:4201`, beta staging `:4202`) and **Ridgeline Cycles → Ridgeline Cycles** (gamma live `:4203`), realigning instances and connections to the new business (session exchange requires it).

## Verified
- Website: 367 tests pass, `check-types` clean. Admin: `check-types` clean; desktop/electron tests pass (site runner validation covered). Backend deploys cleanly to alpha, beta, gamma; control plane deploys.
- Playwright (Chromium): Northstar search brief, cart-aware answer ("You've got the Northstar Compact 15 in your cart…"), memory chip, rail add-to-cart syncing grid + header badge, cart drawer recommendations, product page relations, cart page, phone sheet. Ridgeline: dark palette, standards reasoning (9-speed chain, tube-type tire, mechanical pads; tubeless warning), add-to-cart on request.
- Electron (`scratchpad/fleet/electron-runner.mjs demo`): from the real admin, View website launched Northstar Live (4201), Northstar Staging (4202) and Ridgeline Live (4203) concurrently from one checkout; all three served the right store; Local storefronts dialog listed them; `/settings/shop-assistant` renders. Zero renderer errors.

## How to run it
1. Tunnel (only from this Mac's sandbox; node/Electron cannot reach the worker directly): `ssh -f -N -D 127.0.0.1:17890 -L 14720:192.168.1.246:4720 … -L 14841:192.168.1.246:4841 worsin-worker` (see `CLAUDE-TESTING-HANDOFF.md`).
2. Admin renderer: `VITE_CONVEX_URL=http://192.168.1.246:4720 VITE_CONVEX_SITE_URL=http://192.168.1.246:4721 VITE_STANDALONE_CONTROL_PLANE=true bun --cwd apps/web run dev -- --host 127.0.0.1` (port 4105).
3. Electron: `electron-runner.mjs` sets `CONVEXPRESS_WEBSITE_REPO`, `CONVEXPRESS_SITE_ORIGIN_MAP` and `--proxy-server=socks5://127.0.0.1:17890`. On a Mac with Local Network permission granted to the app none of the map/proxy is needed.
4. Storefronts start from the environment menu ("View website" / "Open local preview"). Manually: `PORT=4201 CONVEXPRESS_CONVEX_URL=http://127.0.0.1:14820 CONVEXPRESS_CONVEX_SITE_URL=http://127.0.0.1:14821 CONVEXPRESS_SITE_URL=http://127.0.0.1:4201 bun run dev --host 127.0.0.1 --port 4201` in `ConvexPress-Website/apps/web`.
5. Re-seed a shop: `SITE_ADMIN_KEY=… OPENROUTER_API_KEY=… bun run scripts/seed-demo-shop.ts --shop northstar-coffee --url http://127.0.0.1:14820 --site-url http://127.0.0.1:4201 --images <cache dir>` from `packages/backend` (images cached under `<cache dir>/<shop>/`).

## Known gaps / next
- Pre-existing hydration warning on `/products` (PublicPluginGate renders nothing during SSR, so the client tree differs). Recoverable, but SSR of product pages effectively re-renders on the client. Fix in the gate (SSR-safe settings read) when touching that layout.
- Images are served from the deployment's own origin (`192.168.1.246:4820/api/storage/…`), which only loads in browsers with Local Network access to the worker; the Playwright run rewrote those requests to the tunnel.
- Phases 3–5 of the strategy (proactive tips scheduling, compare-table prompts, photo → cart, UCP 2026-08-25 conformance, agentic watches) are not started. The `commerce.assistant.proactiveTips` setting exists but the rail does not yet emit unsolicited tips.
- Assistant latency is 15–25 s per tool-calling turn on `anthropic/claude-sonnet-4.6`; briefs 6–12 s (then cached). No streaming yet.
- Admin relation-graph review queue and recommendation analytics screens are not built (backend queries exist: `commerce/relations.ts`, `commerce_recommendation_events`).


---

## Update 2026-09-04 (evening): real demo sites, authored through the admin UI

Both demo stores are now full websites built the way a customer would build them — through the
ConvexPress admin (Electron), not seeds. Driver: `output/playwright/shopping-experience/author-site.mjs`
(signs in, switches site via the site switcher, then works the real screens).

Per site (Northstar Coffee on alpha, Ridgeline Cycles on gamma):
- **Media Library** → Add New: 6 hero/lifestyle images uploaded per site (generated with the OpenRouter
  image model; `scratchpad/images/<shop>/site`). Library is scoped per site deployment.
- **Pages** → Add New Page → block editor: Home (Hero split · Category Tiles · Product Showcase · Feature Grid ·
  Media + Text · Testimonials · Shopping Assistant Band · Newsletter), Our Story (Hero · Media+Text · Stats ·
  Media+Text · CTA), Help (Hero · FAQ · CTA; slug changed to `/faq` in the permalink editor because `/help`
  and `/support` are built-in routes), Contact (Hero · Contact Stack · Contact form). Images picked from the
  library inside the block's media field. Published from the Publish box.
- **Settings → Reading**: "A static page" → Homepage = Home.
- **Menus**: "Main Navigation" (Home, Shop, two category links, Contact, Help, Our Story) → Primary Navigation;
  "Footer" (Shop all, three categories, Cart, Contact, Help) → Footer Navigation.

New blocks (block-build contract, admin `blocks/*` + website `blocks/*`, `bun run check:blocks` passes, 13 official):
`commerce/product-showcase` (newest / category / sale / hand-picked slugs, live cards with cart steppers),
`commerce/category-tiles` (live categories with cover + count → `/products?category=`),
`commerce/assistant-band` (example questions → `/products?ask=…` opens the rail with that question).
Backend: `commerce/storefront.ts` gained `productCardsBySlugs` and `categoryTiles`.

Bugs found and fixed along the way (all real, all in the product):
- Block media picker called `api.media.queries.getById`, which never existed → editor crashed on every image pick. Now uses `get`.
- Desktop CSP only allow-listed the control plane; site deployment origins were blocked for websockets and
  images (Media Library thumbnails broken for any fleet site). Origins are now registered at runtime
  (`electron/deploymentOrigins.ts`, `ipc/security.ts`, `SiteRuntimeProvider` registers + reloads once) and
  `img-src`/`media-src` include them.
- Website `PublicPluginGate` and `/page/$` read Convex directly → SSR skeleton vs client content hydration
  mismatch. Both read the TanStack cache the loaders fill. `/$slug` redirect moved server-side.
- Cart session token was read from localStorage during render → `disabled` hydration mismatch on every product grid.
- 49 routes hardcoded "… - ConvexPress" titles. `lib/seo/head.ts` now has `siteTitled()` / `resolveSiteName()`;
  root loader + SettingsProvider remember the site name (one process = one site).
- Pages that open with a hero no longer repeat the page title; full-width template is actually wide (max-w-6xl);
  default template drops the empty sidebar column when there are no child pages.
- Brand typography/radius from Settings › Brand now applied on the storefront (`ThemeStyleInjector` loads the
  Google Fonts and sets `--font-sans`, `--font-display`, `--radius`); Fraunces vs Space Grotesk visible per site.
- Admin: settings selects showed raw values ("full") → show labels; block outline shows icons for official blocks;
  media titles from filenames are capitalized.

Evidence: `output/playwright/shopping-experience/{authoring,storefronts}/<site>/*.png`.
Tests: admin 2178 pass, website 367 pass, desktop CSP/origins 7 pass; both apps typecheck.


---

## Update 2026-09-04 (night): layout presets, persistent cart, animated assistant

**Settings › Shop layouts** (`/settings/shop-layout`, section `commerce.layout`, public `layoutConfig`):
picks a **shop layout** (`boutique` | `marketplace`), a **product page layout** (`classic` | `marketplace` |
`split` | `showcase` | `minimal`), cart mode (persistent column | drawer) and grid density. Each preset card has a
token-drawn wireframe; the panel on the right shows the selected preset large with "best for" / "includes" and a
**Preview on site** button that opens the storefront with `?layout=` / `?productLayout=` overrides (never persisted).
Preset catalog: `ConvexPress-Admin/apps/web/src/lib/commerce/layout-presets.tsx`; ids validated in
`settings/defaults.ts` (`SHOP_LAYOUT_IDS`, `PRODUCT_LAYOUT_IDS`).

**Storefront** (`hooks/useShopLayout.ts`, `components/shop/ShopShell.tsx`, `components/shop/CartPanel.tsx`,
`components/shop/product/{useProductPage,ProductParts,ProductLayouts}.tsx`):
- Marketplace = edge-to-edge, assistant column left, dense grid (4–5 up) with a filter toolbar, cart pinned right.
  Boutique = centred 1440px, filter rail, 3-up grid (2-up while both side columns are open), cart column right.
- Assistant column stays mounted and animates width + flex gap (360 ms, eased); measured 0→207→295→327→337→340 px on
  open and symmetric on close. Conversation survives close. Re-open pill fades in/out.
- Persistent `CartPanel`: same reactive cart as steppers/drawer; quantity, free-shipping bar, subtotal, checkout.
  Off on the cart page. Ends above the corner support button.
- Scrollbars use tokens everywhere (`scrollbar-color` / webkit), and `ThemeStyleInjector` sets `color-scheme` from
  the palette background so native UI is dark on dark sites.
- Product page: one state hook, five layouts; gallery uses `galleryMediaIds`; add-to-cart stays on the page
  (no redirect); descriptions render sanitized HTML (WooCommerce imports arrive as HTML).

Chosen through the admin UI: Ridgeline = Marketplace + Marketplace product page, dense; Northstar = Boutique + Split.
Evidence: `output/playwright/shopping-experience/layouts/<site>/` (settings page, rail closed/open, shop, every
product layout). Probe: `probe-rail.mjs`. Tests: admin 2178, website 367; both typecheck.
