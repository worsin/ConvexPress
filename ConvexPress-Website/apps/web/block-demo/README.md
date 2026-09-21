# BlockDemo — internal block and template study

An account-free gallery of all 137 canonical Library renderers, 32 portable starter patterns and 25 SDK primitives. It uses the actual Library/pack renderer registry and schema editor controls. Data-bound blocks receive explicitly synthetic fixtures; the demo does not provision records, send messages, accept payments or grant backend access. This internal tool is separate from the shipped storefront.

The catalog supports categories, search, keyboard navigation and direct URLs with `block`, `example` and `pack`. Selecting a block shows its normalized examples and actual renderer. **Try local field edits** opens the shared schema-driven editor: invalid drafts retain the last valid preview, and edits reset on scope/specimen changes or reload. There is no save path or live resource picker.

## Templates and example pages

Core, Journal, Depot and Aster House supply their real tokens and palette choices. Journal and Depot each supply 15 owned block renderers plus an explicit primitive override module. Core and Aster House use the shared primitive/Library baseline with their own tokens. Overrides do not borrow another pack's implementation.

The Fieldwork example website contains Studio, Journal and Collection pages plus story/product detail previews. The same authored trees render through the selected pack. `demoPage` and `demoItem` retain page identity through navigation, Back and reload; `view=website` opens the full-page study. The source inspector exposes the authored blocks. These example layouts supplement the catalog; they do not demonstrate every block or certify a finished customer site.

Named template styles, runtime compositions and composed definitions have dedicated studies. All data and editorial content are fictional. Orders, provider operations and live submissions remain outside this demo's acceptance scope.

The separate `/wishlist-surfaces.html` study renders the actual account/shared wishlist surfaces under all four packs with synthetic actions. Both HTML entries and their local styles are included in the production demo build; neither requires a second development server.

## Assets and isolation

The ten generated sample images are checked into `assets/`; imports do not depend on ignored repository output folders. Their promotion preserved the original image bytes. `public/media` contains explicitly labeled synthetic video/audio/download fixtures. The silent still-image workshop video tests native controls and captions, not real footage. These files are demo assets, not customer uploads.

The entry point is separate from the TanStack storefront and mounts no account provider or live backend client. The interactive contact fixture supplies an in-memory adapter around the real form controls and reports that nothing was sent or stored. The demo shell's styling stays separate from the selected template's specimen tokens. Production routes and starter sites must not import demo fixtures or CSS.

## Run and verify

Install the Website workspace's pinned dependencies, then run from `ConvexPress-Website/apps/web`:

```sh
bun x vite --config vite.block-demo.config.ts
```

The server binds loopback at port 4318 with `strictPort`. First verify that the chosen port is unused or belongs to this exact checkout; `BLOCK_DEMO_PORT` selects a different explicit port. Preserve other running app/test servers.

```sh
bun test ./block-demo/gallery.test.tsx ./block-demo/authoring-preview.test.ts ./block-demo/fixture-media.test.mjs ./block-demo/discovery.test.mjs
bun x vite build --config vite.block-demo.config.ts
bun x vite preview --config vite.block-demo.config.ts --host 127.0.0.1 --port 4330 --strictPort
BLOCK_DEMO_URL=http://127.0.0.1:4330 bun x playwright test --config playwright.block-demo.config.ts library-navigation.pw.ts composed-pages.pw.ts
```

The build writes ignored `block-demo/.dist`. Browser tests use one worker and do not start a server automatically. Supply a fresh explicit Playwright `--output` directory when preserving earlier evidence. Stop only the server created for the current acceptance run.

The Library/type/data foundation has separate tests documented in `scripts/blocks/README.md`. The complete Website, backend contracts and native editor also require their own type/build/live acceptance; a successful demo build does not establish those results.

## Evidence boundaries

The browser suites cover catalog inventory/navigation, composed layouts, selected block interactions, media, form controls and motion behavior. Source discovery independently compares names/versions/hashes with the browser registry, and watches renderer additions/removals outside the demo root. Directory names and screenshot counts are not acceptance evidence.

Inspect rendered hierarchy, spacing, contrast, focus and media at desktop/mobile sizes. Reduced-motion screenshots do not establish animated performance. The RAF sampling suite reports frame intervals and long tasks; it does not certify GPU composition or remove hardware variance. Baseline motion uses transform/opacity, starts marquee motion paused, and respects reduced motion.

The thumbnail capture tooling consumes this demo to produce synthetic editor specimens. Thumbnail integrity is separate from visual quality and interactive acceptance. Current item-level status lives in the September 4 audit's current-acceptance ledger and the Standalone MagicTables Blocks table; historical counts belong in dated receipts, not this current usage guide.
