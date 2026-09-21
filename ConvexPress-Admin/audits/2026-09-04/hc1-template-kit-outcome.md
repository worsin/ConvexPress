# HC1 — template kit and Aster House

Implementation is local in `codex/convexpress-hardening`. No deployment, provider calls, browser launch, commit or push by this agent. Root owns staging/live visual and workflow acceptance.

## Delivered

- Aster House is a fourth selectable pack with **89/89 catalog surfaces**, including its own Events index/detail/member timeline. Its warm limestone/forest/vermillion palette, Cormorant Garamond/DM Sans type, large authored cover, portrait product cards, header/footer and restrained motion use active Customize tokens. Two presets include dark-mode values. Existing gated commerce/auth/member behavior is preserved through SDK view models and actions.
- The homepage uses CMS title/excerpt/featured image/alt text, defers to an authored hero block, and renders stored composition blocks. Site names, photography, product prices, events and claims are not embedded in pack components. The business must still be authored in the site's isolated database. Event registration follows the supplied registration URL; paid ticketing/RSVP is outside Events' implemented contract.
- Fixed a real SDK projection omission: `pages.getFrontPage` and successful password verification now resolve authored featured media only after content gates, and the homepage consumer passes excerpt/media to the view model. Password-locked media stays absent. Existing membership route-alias policy remains in force.
- `ConvexPress-Website/template-kit/` contains contract/workflow docs and an annotated mini-pack. `create:template` creates a minimal pack or copies an existing one, retargets absolute self-imports, refuses overwrite/path escape, and never activates a site. Existing design skills now write pack surfaces. Three new template skills cover build/add-surface/audit.
- Static checks recursively inspect shared parts as well as surfaces, SDK version, module/field declarations, backend import boundaries and tokens. Admin mirror parity is checked before reporting success.
- `check:templates:ssr` builds Vite's real pack module graph and renders four loading-home fixtures plus an authored Aster title/excerpt/image/escaping fixture. No HTTP listener or backend access is needed.
- Operator-run `scripts/template-screenshots.mjs` accepts real staging fixture paths, optional authorized storage state, and expected surface IDs. It captures full pages and rendered surface crops, writes `index.json` and a browsable `gallery.html`, restricts case paths to the supplied origin and closes its one browser/context. This browser command was **not executed by this agent**.

## Evidence

- `bun test scripts/create-template.test.ts scripts/template-contract.test.ts scripts/template-screenshots.test.ts`: **4 pass / 18 assertions**. Clone self-import regression was red first (copy still referenced source pack), then green after retargeting.
- Backend production-handler content suite: **44 pass / 453 assertions**, including `homepage SDK carries authored imagery only after its content gate`.
- Website `bun test src`: **487 pass / 1182 assertions / 32 files**.
- `check:templates`: **4 packs / 89 surfaces**, Aster89/89 and Core89/89; Journal/Depot86/89 deliberately fall back to Core Events.
- `check:templates:ssr`: four loading fixtures plus authored Aster cover passed. Build transforms756 modules; benign bundled `use client` directive warnings remain.
- Website lint, Website `tsc --noEmit`, backend `tsc --noEmit -p convex/tsconfig.json`, and `git diff --check`: passed after the Events route typing repair.

## Root staging acceptance

1. Activate Aster via Templates on the new site's staging instance. Author a static homepage with excerpt, featured image/alt and content blocks. Confirm the cover renders those actual values and changing them updates the site.
2. Add a hero block first; confirm the pack's own cover is suppressed while the authored hero renders. Verify a password and membership version never shows the gated cover media/body before access.
3. Exercise Events list/detail/cancelled/empty/member list and externally authored registration destination; products/cart/checkout/orders; blog/search; courses/gallery/forms/support; login and member dashboard.
4. At desktop/mobile widths, inspect both presets, light/dark, long headings and keyboard navigation. Use real Header/Footer/Menu Customize controls and save/publish/reset/undo to confirm draft values apply.
5. Capture explicit fixture routes with the screenshot command or root's authorized browser. Review every represented surface; loading SSR and static coverage are not visual acceptance or proof of completed payment/member flows.

HC3 reference blocks were not included in this HC1 delivery. Existing live commerce block renderers remain available for the authored homepage.
