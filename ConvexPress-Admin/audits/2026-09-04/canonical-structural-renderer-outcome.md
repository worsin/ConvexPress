# Structural renderer slice and responsive gate

Added eight canonical views: `core/sticky-aside`, `core/accordion`, `core/tabs`, `core/faq`, `core/table`, `core/definition-list`, `core/callout`, `core/pullquote`. Independent filesystem discovery finds **34 source renderers among136 canonical specs**. Browser runtime coverage is verified separately below. The remaining102 renderers are pending. No form blocks, live data, production routes or legacy content were activated.

Behavior:

- Accordion preserves the prior numeric default-open semantics through an optional closed SDK `defaultOpenId` prop; an out-of-range/fractional index opens none. Native disclosure interaction and multiple-open behavior are retained.
- Tabs retain accessible labels and keyboard semantics through SDK Tabs, with local horizontal overflow containment and preserved body line breaks.
- Table renders real caption, column headers and cells inside a keyboard-focusable horizontal scroll region. Definitions use semantic `dl/dt/dd` and the canonical rich-text renderer. Callout keeps its semantic note/tip/important/warning copy without presenting every note as an interrupting alert.
- Sticky-aside keeps every child: first is main content, remaining children are complementary content. It stacks on small/short viewports and uses the shared header offset for sticky desktop positioning, with a keyboard-focusable bounded scrolling aside. No new child-count restriction or child truncation was invented outside the canonical contract.
- Styling uses existing pack tokens. No new animation dependency or motion effect was added.

Checks: main primitive/gallery wrappers14tests248assertions pass; expanded renderer suite7tests88assertions pass, including every canonical example for all34 views plus disclosure/default state, tab labels, table semantics and preservation of all sticky children. Dedicated canonical-source typecheck, offline BlockDemo build, owned renderer lint and scoped diff checks pass.

Parent browser evidence:

1. Prior26-renderer gate: one matrix test passed10.3s,26×4packs=104screenshots. Root reviewed Journal feature grid, Depot hero and Aster menu as crisp, without visible artifacts; this is representative review, not full pack acceptance.
2. Correction: the full four-test harness passed16.7s in `output/block-demo/browser-results-structural34`, but a later check proved that its running Vite module graph still exposed only26 renderers. The folder name is not coverage evidence; this run verified26, not34.
3. Parent ran the expanded six-test responsive/interaction gate. Its matrix captured26×4×2=208screenshots, while both structural interaction tests failed because `core/accordion` had no loaded renderer. This exposed a coverage-oracle defect: the matrix trusted the browser-advertised list. No34-renderer browser pass is claimed yet. The repaired gate expects the independently discovered source set: currently34×4×2widths=272screenshots at1440px and390px. Separate interaction tests verify native disclosure keyboard/open state, Tabs End/Home/Right and hidden panels, table caption/header/focus/scroll semantics, and desktop-sticky versus mobile-static behavior. JSON stores `renderedBlockCount`, `canonicalSpecCount`, `expectedScreenshots` and `capturedScreenshots` separately to avoid conflating34 renderers with136 specs.

Parent-only command, preserving prior output:

```sh
bun x playwright test --config playwright.block-demo.config.ts --output ../../../output/block-demo/browser-results-responsive34
```

Aster preflight advice is in `output/block-demo/treatment-proposals/aster-legacy-treatment-contract.md`. It proposes exact pack-local mappings for Field Guide internal gap/alignment/ink/font and Product Showcase responsive three-column behavior. It supplies **no verified receipt**, changes no preflight files and explicitly requires matching source/environment/pack/code/token/wrapper evidence before a trusted resolver returns verified:true. In particular, legacy Field Guide spacing6 is an internal1.5rem gap, not Section vertical spacing; Showcase columns3 means three columns from768px upward, not the SDK's default two-at-md/three-at-lg layout.

Remaining: parent responsive/interaction gate and visual review, wider per-block accessibility, complete102 pending treatments, dynamic/visibility/reference adapters, exact Aster named-treatment acceptance and original-revision-preserving migration integration. None of these tests automatically marks a tracker row Verified.

Discovery repair: internal Vite config now explicitly watches the external canonical `blocks` directory. Only two-level `render.tsx` add/unlink events invalidate the loaded discovery importer and trigger a debounced harness reload; unrelated paths, startup enumeration and closed-server events do not reload. No storefront runtime or broad watcher configuration changed. The browser matrix independently scans regular `block.json`/`render.tsx` files, verifies canonical name/version identity, records content hashes and rejects missing/unexpected/duplicate runtime renderer names before screenshots. It also checks each rendered schema version against source. `canonical-source-inventory.json` persists even when the initial comparison fails. Four local Node regressions pass, including stale runtime mismatch and scoped add/remove lifecycle handling. Parent owns real browser add/remove and rerun acceptance.

Verified parent acceptance: the repaired six-test gate passed in30s at `output/block-demo/browser-results-responsive34-verified`. Independent filesystem and browser inventories matched exactly34 renderers, yielding272 screenshots across four packs at1440px/390px. Disclosure/Tabs keyboard, table semantics/overflow and responsive sticky assertions passed. Parent also verified a temporary canonical renderer probe changing discovery34→35→34 without restarting; the exact probe was removed. This supersedes the earlier stale26 runs, which remain accurately recorded above.
