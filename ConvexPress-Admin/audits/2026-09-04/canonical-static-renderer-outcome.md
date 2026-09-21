# Canonical static renderer foundation

Implemented26 staged Library renderers alongside canonical `block.json` files, with a convention-discovered dispatcher at Website `src/templates/sdk/block-renderer`. There is no hand-maintained block registry or duplicate attribute schema. Generated canonical contracts remain authoritative. Legacy content, production routes, server resolver execution and saved records were not activated or changed by this work.

Supported checkpoint: core heading/paragraph/rich-text/list/quote/divider/spacer; feature-grid/process-steps/stats-band/testimonials/CTA-band/hero-text-only/pricing-cards; image/media-text/hero-split; section/columns/group/grid/split; business service-list/locations/opening-hours/menu. Names/versions/examples are read from canonical discovery; parent/auth agent owns regeneration.

The dispatcher fails explicitly for unknown names, wrong versions, disabled blocks/plugins, unmet runtime requirements, absent renderers, unresolved dependencies, unsupported styles/instance fields, invalid attributes/layout/anchors, forbidden children, duplicate IDs and bounded tree limits. It admits only validated declared public-media DTOs into each renderer; arbitrary extra resource entries do not cross that boundary. The passed harness policy is trusted configuration, not a substitute for the future authorized server/viewer boundary.

The live article-preflight requirement is handled in rendering: paragraph and rich-text use generated RichTextDoc; heading/list preserve the canonical inline doc. SDK RichText consumes the generated schema and preserves bold/italic/strike/underline/code/link targets and hardBreak. No marks are stripped or documents converted to plain text. Structural legacy article migration remains separate. Media focal points use bounded numeric coordinates; no CSS escape props are introduced.

BlockDemo now exposes exact-version canonical block selection and generated examples, with actual pack primitives. Unsupported blocks remain visibly pending. A new parent-only browser matrix captures all26 current renderer specimens across four discovered packs (104 screenshots) with durable JSON; it is a partial block matrix, not a136block completion claim.

Verification at this checkpoint:

- Existing primitive/gallery/dispatcher wrappers:14tests,248assertions pass, including isolated DOM/hydration checks.
- Expanded actual renderer suite:6tests,66assertions pass, including SSR of every canonical example for every discovered renderer and failure-policy/media-isolation cases.
- Main Website typecheck and dedicated `tsconfig.block-demo.json` typecheck pass. The latter includes canonical renderer source outside the application root; the unactivated UI/dispatcher use isolated type resolution rather than changing runtime dependency selection.
- Scoped Website SDK/harness lint and all owned canonical renderer lint pass. A broad whole-block-root lint encountered the generated safe-link helper's intentional control-character regex warning; that helper belongs to canonical tooling, was not modified to suppress it, and is outside this renderer lint scope.
- Dedicated offline Vite build passes without chunk warnings, with separate entry/canonical/existing-vendor chunks. No dependency or lockfile changes, no browser/provider/native/deployment calls by this agent.

Parent's earlier primitive motion proof remains scoped: visible Chrome147/AppleM5/DPR2,240frames median6.9ms/p957.6ms/max7.8ms; active accelerated transform layer; marked trace0Paint/0Layout, no >33ms frame or long task. Files `output/block-demo/motion-acceptance.json` and `motion-trace.json`. This does not certify the new canonical matrix, all devices or full accessibility.

Remaining: parent visual matrix acceptance (including new rich-text render states), full mobile/keyboard coverage for each block, remaining110 Library treatments, advanced tree policy/migration acceptance, named pack treatment acceptance, dynamic authorized resolvers, non-media reference adapters, and production integration. No tracker row is automatically marked Verified by renderer existence or this report.
