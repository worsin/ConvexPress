# Stateless content slice:50 source renderers

Added eight convention-discovered Library views: `core/roadmap-timeline`, `core/pricing-table`, `core/bento-grid`, `core/team-grid`, `core/footnotes`, `core/comparison-table`, `core/feature-list-alternating`, `core/hero`. Source now has50 renderers among136 canonical specs;86 remain pending. No external providers, dynamic resolvers, checkout actions, legacy records or shipped storefront routes were activated. Existing BlockDemo editor integration in canonical-blocks.tsx stayed with its owner.

The schema owner extended canonical matrix constraints to nested row fields and a header offset. Pricing values must match the plan count; comparison cells must match columns minus the row-label column. Populated rows with missing/null/insufficient headers reject instead of being truncated or associated with invented headings. Comparison columns:null with rows:[] remains an intentional empty state. Footnote keys now use the existing anchor format and within-block unique-by validation. Renderers consume those generated contracts without a second schema.

Pricing is editorial presentation: authored price labels, descriptions, features, row values and safe links. It creates no billing toggle or financial authority. Both tables retain real caption/column/row headers and keyboard-focusable horizontal scroll regions; absent pricing metadata says Not specified. Footnotes keep exact authored IDs and structured rich-text marks, with hash links and the shared header scroll offset. Page-wide collisions across blocks remain owned by root's separate tree-preflight work; this slice does not claim those solved.

Roadmap retains authored order and textual statuses without parsing vague labels into invented dates. Bento and alternating treatments keep every item and target-resolved image; alternate visual placement preserves copy-first DOM order and stacks on small screens. Team cards retain named profiles and omit absent photos rather than inventing portraits. Hero preserves its nullable title, both actions and resolved media. Presentation uses existing SDK parts/tokens with no motion dependency, arbitrary composition props or new autoplay behavior.

The schema owner supplied richer canonical final examples: all three roadmap states; two editorial plans and three rows; multiple image cells; two explicitly fictional team members without portraits; distinct footnote keys; complete comparison rows; two alternating features; and a hero with media and two links. Media fixture variety stays under root's ownership.

Local validation:23 renderer/security/component tests pass with766 assertions. The offline suite now discovers actual template manifests and opt-in primitive parts, renders every example for all50 views under all four packs, verifies all declared overrides are exercised and rejects cross-pack treatment leakage. This is structural/contract SSR proof, not CSS visual proof. Dedicated staged typecheck, offline BlockDemo build, owned lint, scoped diff and four discovery watcher regressions pass. Table keyboard-scrolling lint exceptions are narrowly documented beside the focusable region props.

Parent browser gate is ready but not run by this agent:10 tests and50×4×2=400 expected matrix screenshots. Two added tests run pricing/comparison row-to-column assertions, native keyboard focus/horizontal scrolling and exact footnote target navigation under each pack at1440px/390px. The matrix still requires an exact independent filesystem/browser renderer inventory match before capture.

Parent command from Website/apps/web, preserving earlier42 evidence:

```sh
bun x playwright test --config playwright.block-demo.config.ts --output ../../../output/block-demo/browser-results-content50
```

Existing verified scope: media42 passed eight parent browser tests in36.9s with336 captures; root reviewed mobile Depot's single disclosure marker and desktop Journal gallery. That prior evidence does not automatically cover this new50-renderer slice.

Remaining: parent50-renderer browser/visual acceptance, root page-wide anchor collision preflight,86 remaining treatments, unresolved dynamic/visibility/reference/provider adapters and authored-content migration/activation evidence. None of these source counts alone mark all136 blocks Verified.

Parent content50 browser acceptance:10 tests passed in46.9s with400 canonical captures after root's page-wide anchor preflight caught duplicated child-fixture anchors. Root repaired the fixture and added heading/footnote anchor declarations. Root reviewed mobile Journal pricing as good. Desktop Depot bento remained visually unacceptable despite the functional gate: viewport-sized h3 text broke NOTEBOOK mid-word in its narrow card, and the asymmetric span rule stranded the third item. This was recorded as a visual defect, not accepted design.

Bento/card polish: added a Library-only copy-width container with container-relative h3 sizing, ordinary word wrapping and preserved pack font/weight/case/italics. Applied it to bento, team, alternating-feature and feature-grid copy; global Heading and root-owned model/anchor code were untouched. Bento now has a horizontal full-width lead and balanced supporting pairs; a lone trailing card spans the full row. Layout adapts at the bento container's width, keeps every item and uses consistent image proportions. Source styling no longer depends on a wide browser viewport to size narrow card copy.

Local polish checks:24 tests775 assertions pass, including all50 canonical example/pack combinations and root's anchor regression. Dedicated staged typecheck, offline build, owned lint and scoped diff checks pass. A targeted parent-only browser test named `card typography and bento rhythm follow the container` is ready:32 screenshots across four packs/two widths/four affected views, per-word DOM Range line checks, heading overflow/size checks, retained Depot uppercase and Journal italics, and equal supporting-card geometry. It persists `card-typography-evidence.json`. This visual polish remains pending parent browser acceptance; no next blocks were started.

Targeted command from Website/apps/web:

```sh
bun x playwright test --config playwright.block-demo.config.ts --grep 'card typography' --output ../../../output/block-demo/browser-results-card-polish50
```

### Card polish geometry regression follow-up

Parent's first targeted card gate failed before screenshots: bento article widths were zero (`browser-results-card-polish50`, gallery test geometry assertion). Source inspection found a real sizing defect in the new polish: an inline-size query container was a shrink-to-fit child of the SDK Stack (`align-items:flex-start`) without a definite inline size. Inline containment removes its intrinsic content contribution. The actual canvas has no closed details ancestor; the authoring details is a sibling. The initial hidden-copy hypothesis was not adopted as fact.

The bento query shell and card-copy context now have explicit full inline size. Team/feature grids receive a Library-only full-width collection wrapper, and alternating rows receive an explicit width, preventing the same contained-copy intrinsic collapse. Pack primitives and their typography treatment remain intact. The browser gate scrolls the actual canvas, requires visible/nonzero canvas and headings plus positive card width/height, retains all word-wrap and balanced-row assertions, and writes intermediate geometry evidence before assertions so failures remain inspectable. No invisible-node filtering or weakened geometry threshold was introduced.

Local verification: renderer regressions **24 passed, 775 assertions**, isolated BlockDemo TypeScript passed. Browser test lint passed; a broader lint invocation exposed existing `Prose` array-index-key/non-null warnings in unchanged lines of presentation.tsx, outside this sizing repair. Browser and premium visual acceptance of this follow-up remain pending parent rerun. Earlier parent content50 proof remains 10 tests / 400 captures and root anchor regressions 24 tests / 775 assertions; these do not claim the rejected bento layout was accepted.

### Parent acceptance — polished50 verified

Parent's targeted card/motion gate passed **2 tests in 9.7 seconds**, producing 32 card captures across four packs at 1440/390. Parent visually accepted desktop Depot and mobile Journal bento: no mid-word NOTEBOOK break or stranded support row. The subsequent full polished50 gate passed **12 tests in 58.7 seconds**, with exact 50-renderer inventory, **400 canonical captures plus 32 card captures**, keyboard/media/tables and viewport Section reveal checks. Evidence: `output/block-demo/browser-results-polished50-verified` (targeted proof: `browser-results-card-motion-polish50`). This closes the reported bento polish defect; overall 136-block and production activation flags remain false.
