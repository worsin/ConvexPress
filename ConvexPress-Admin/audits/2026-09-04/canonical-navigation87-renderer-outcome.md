# Navigation renderer source checkpoint

The four new Library renderer paths are `core/breadcrumbs`, `core/anchor-nav`, `core/table-of-contents`, and `core/site-info`. Source discovery is 87 of 136. The last accepted browser/tracker checkpoint remains 83 until the root runs the new gate.

These consume the authoritative correlated resolver contracts `content.breadcrumbs`, `content.anchors`, `content.headings`, and `site.info`. Native/public canonical service integration is owned by the auth agent. The new server adapter uses the existing bounded request/source ledgers; breadcrumb traversal stops at a denied ancestor and site info projects only public title/tagline/logo. The Website installs the same validated envelope through its existing in-memory display grant, bound to the exact tree, revision, viewer, policy, website and instance. No stored attribute grants data authority.

The pure navigation index is shared with the actual renderer. It preserves authored anchors and rich heading content, derives stable collision-checked IDs for other headings, and refuses manual links to absent document targets. Native anchor links work without JavaScript; enhanced navigation updates the hash, moves focus to the actual heading, honors reduced motion and indicates the current location. The gallery uses explicitly synthetic context through the production renderer; it does not claim live site data acceptance.

The FieldGuide `editorial` treatment is composable: nine spacing values, three physical alignments, three semantic ink choices and two font choices. Each of the four pack manifests explicitly declares support; missing pack support or invalid axes refuse. The Library maps those finite values to the current pack's tokens. No CSS or 162 combined style identifiers enter storage. Old/new SSR comparisons preserve empty body/note elements, literal whitespace/markdown, count slicing and incomplete CTA omission; the accessible new-tab suffix is an intentional improvement to the old link's accessible description. The dedicated browser comparison checks original and canonical computed gap, alignment, color, heading size/line/font/case and body line height across four packs, two widths and all nine spacing values.

Local gates: 83 renderer tests / 2,604 assertions, including four navigation interaction/data-boundary cases and two treatment parity cases; Website, Admin and BlockDemo TypeScript; generated block freshness; portable closure 18 exact files with no server graph; scoped diff whitespace check. Earlier red tests exposed the empty-body omission, and canonical derived anchors exposed reused IDs in a two-carousel test fixture. Both were repaired without weakening the intended assertions. The current live/visual acceptance remains pending.

Root browser command from `ConvexPress-Website/apps/web`:

```sh
bunx playwright test --config playwright.block-demo.config.ts --output ../../../output/block-demo/browser-results-navigation87
```

Focused first gate, if desired:

```sh
bunx playwright test --config playwright.block-demo.config.ts navigation.pw.ts treatment.pw.ts --output ../../../output/block-demo/browser-results-navigation87-focused
```

Expected new evidence: 32 navigation captures (four blocks × four packs × two widths), eight original/canonical treatment captures plus 72 computed-style records, and full matrix 696 canonical captures (87 × four × two). The full suite retains existing interaction, article flow and motion gates. Suggested visual review: desktop Depot breadcrumbs/site-info, mobile Journal table-of-contents, mobile Aster anchor navigation, and desktop/mobile FieldGuide comparisons. Root alone owns browser runs, visual approval, deployment and four MagicTables updates.

## Focused browser red cases and repairs

Root's first focused gate (`browser-results-navigation87-focused`, session51002) failed all three tests. At both widths, keyboard navigation focused the correct heading but an IntersectionObserver callback replaced `aria-current` with a later heading: the observer excluded the viewport's top15% and retained stale intersection-time coordinates. The repaired observer treats intersections as invalidation only, reads current geometry at the shared header offset, preserves explicit hash/keyboard navigation intent through programmatic scrolling, and releases that intent on manual scroll input. The DOM regression delivers the exact competing callback and then verifies that actual manual scrolling updates the current link; cleanup disconnects the observer and cancels pending animation frames.

The original FieldGuide comparison was unstyled because BlockDemo has no Tailwind pipeline. Its computed `gap:normal` was not valid parity evidence. `block-demo/compile-legacy-style.mjs` now compiles the original view's discovered utility tokens using the pinned production Tailwind theme/preflight, existing app token declarations, and actual brand selector. Its output is scoped exclusively to the original fixture. Six source hashes and the generated stylesheet hash are recorded beside it; `--check` refuses drift. No global gallery styles or expected CSS values were fabricated. Actual legacy font-sans is inlined to Inter Variable by the existing app theme, so the compatibility treatment preserves that body-heading face; display uses the installed pack display token. Normal block typography remains unchanged.

Post-repair local gate:83 tests /2,609 assertions, BlockDemo types, exact legacy stylesheet freshness and scoped diff check pass. Failed browser artifacts remain intact. Root will rerun to a new output directory; no browser pass is claimed here. The first failed run also reported a30s teardown timeout after the substantive assertion failures; reevaluate only if it persists with those defects repaired.
