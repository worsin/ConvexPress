# September 5 — migration geometry and structured text safety

The prior status-only goal turn made no implementation progress. This continuation corrected two verified defects in the isolated hardening worktree.

## Field Guide

The actual legacy BlockListRenderer wraps FieldGuideView in an unstyled section. It does not provide a page gutter. FieldGuideView uses a stretched grid, whereas the canonical Stack used start-aligned flex items; its link therefore remained left-aligned despite inherited right text alignment. Canonical Section also supplied a new horizontal gutter.

Editorial treatment now uses a one-column stretched grid and inherits the original link line height. A full-width Section containing this exact treatment omits the extra gutter; contained/wide layouts retain their gutters. The pure legacy converter now supplies width full and spacing none when this treatment has no authored layout. Explicit legacy layout/lock review remains separate and migration service activation is still pending. The 28-file deployed foundation was regenerated and checked; only the converter and its manifest changed.

The comparison fixture includes the actual legacy section wrapper. The persistent browser test now checks width and relative geometry for heading, body, detail list, link box and link text, in addition to the existing typography/content comparisons. The focused gate passed 72 cases (9 spacing values, four packs, two widths), eight screenshots. A separate CLI browser probe passed 24 alignment/pack/width cases with zero geometry differences. Root visually inspected the 390px Aster House comparison: title wrapping, details and right-aligned CTA match.

Evidence: worktree-root output/block-demo/browser-results-treatment-geometry; output/playwright/field-guide/after.json; /tmp/convexpress-treatment-geometry-browser.log. Pure migration tests: 3 passed / 982 assertions. These results do not increase the 87 accepted renderer count or prove native migration activation.

## Structured article text

ContentText and Sources previously interpolated authored prose into dangerouslySetInnerHTML after a regular-expression URL replacement. Raw HTML and quotes in URLs could become markup/attributes. Both callers now use LinkifiedText, which creates React text nodes and explicit HTTP(S) anchors. Paragraph/source splitting and link styling/new-window protection remain. Authored HTML/entities now remain literal text.

Three SSR regression tests / 12 assertions cover raw HTML, literal entities, multiple HTTP(S) links, query strings, URL attribute injection and non-HTTP script schemes. The actual browser helper probe checks exact visible text, zero image/script elements, no injected event handler and protected link target. It is a helper-level browser check, not acceptance of all StructuredContent media/CTA paths. Existing generic video embed and CTA URL policies require separate review.

Website and backend (convex/tsconfig.json) type checking passed. The browser helper probe passed with exactText=true, zero image/script nodes, null injected handler and executed=false; receipt: output/playwright/field-guide/structured-text.txt. Scoped diff whitespace checking passed and the original checkout has no tracked modifications. No live provider publication or backend deployment was performed in this batch.
