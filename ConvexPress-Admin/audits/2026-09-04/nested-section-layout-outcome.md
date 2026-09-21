# Nested composition spacing

The carousel's authored group and media-text children exposed repeated outer-page spacing: every nested block wrapper added another Section's vertical padding and horizontal gutter. Desktop compositions had excessive blank space and mobile content became progressively narrower.

The shared baseline Section now carries a private React context. Its nested default spacing is `none`; the outer Section still uses the pack's normal spacing. Nested Section containers reuse the existing parent gutter. Explicit primitive or authored layout spacing, width, tone, anchors and content remain intact. No schema field, animation, block-specific workaround or renderer content was added.

The actual SSR regression failed before this repair, then passed with nested/deep defaults and explicit compact/default spacing preserved. Final shared primitive/DOM/reveal suite: 12 tests, 99 assertions. Isolated types, the full Website types checked by the auth agent, and the BlockDemo production build pass.

Final root browser suite: 22 tests passed in 1.8 minutes (session 57684). This includes 592 canonical captures across 74 renderers/four packs/two widths, plus 64 utility and eight new nested-carousel captures and all existing interaction gates. The dedicated nested tests measure zero additional nested padding/gutters, preserved outer padding, actual image loading and no overflow. Root reviewed the final Depot desktop and Aster House mobile carousel composition.

Evidence: `output/block-demo/browser-results-utility74-verified`, `/tmp/convexpress-nested-section-final-tests.log`, `/tmp/convexpress-nested-section-final-types.log`, and `/tmp/convexpress-nested-section-build.log`.

An intermediate run (30348) passed 21 tests but its matrix was interrupted by a page reload during root formatting and subsequently waited for a now-missing example option. That evidence remains in `browser-results-utility74-final`; the final stable-source rerun passed all 22 tests. This is isolated Library/template acceptance, not canonical storage or public data-resolver activation.
