# Canonical editorial58 renderer outcome

Status: implemented and locally checked; root browser/visual acceptance pending. **58 of 136 canonical specs have Library render.tsx modules**. No legacy-content, provider or production route activation; renderer discovery alone does not satisfy capability/data readiness.

This slice adds eight attrs-only editorial views:

- `blocks/page-banner` v1 — contextual label, heading/prose/action and panoramic target image; no invented breadcrumb destinations.
- `blocks/promo-band` v1 — editorial split, authored details in a definition list and both actual CTA destinations.
- `blocks/media-mentions` v1 — source/byline/kind, summary, target image and safe link; audio/video kinds do not manufacture embedded players.
- `blocks/story-timeline` v2 — ordered author sequence, literal labels, content/media/links; no guessed dates.
- `blocks/customer-showcase` v1 — authored quotation, name/role/company/project descriptor, target image and optional project URL.
- `core/testimonial-wall` v1 — attributed quotations and optional resolved portrait with authored alt/focal point.
- `blocks/tabbed-content` v2 — canonical legacy-text prose, images and actions in accessible panels.
- `core/feature-tabs` v1 — canonical structured RichText marks and resolved structured media, preserving alt/focal point.

The views use existing SDK Heading/Quote/Image/Text/Stack/Button parts and actual pack tokens. Library layout containers have definite widths to avoid intrinsic containment collapse. Tab controls have a 48px target, visible focus, instance-unique React IDs, one roving tab stop, automatic Arrow/Home/End activation including RTL direction, independent instance state, and native hidden inactive panels. Panels change without height animation; no autoplay or new motion dependencies. The internal panel compositor accepts React content because the existing composition-safe Tabs primitive accepts only text; it does not widen public primitive props or duplicate canonical attribute schemas.

Richer final examples were appended only to these eight canonical block.json files, using existing demo image identities. Sample publications, people, quotations and projects are explicitly fictional, not endorsements. Auth agent synced root/staged generated contracts from the stable source. No duplicate handwritten schema/registry was introduced. Dynamic/feed/provider/automatic-navigation/scheduler blocks remain explicit not-ready.

## Verification

- Actual renderer SSR and DOM suite: **30 passed, 1011 assertions**. Includes every canonical example under all four discovered packs with pack-isolation checks; target media/metadata and URL refusals; hidden-panel missing-media refusal; rich-text mark preservation; actual two-instance tab rendering/associations, keyboard wrap/Home/End/RTL, independent state and focus.
- Isolated BlockDemo TypeScript passed.
- Offline Vite BlockDemo build passed.
- Targeted renderer/component/browser lint passed (10 files).
- External discovery/watch tests: **4 passed**.
- Filesystem inventory: **58 render.tsx modules**.
- Browser listing: **14 tests across 3 files**; listing does not launch a browser.

From `ConvexPress-Website/apps/web`:

```sh
bun src/templates/sdk/block-renderer/run-tests.fixture.mjs
bun x tsc --noEmit -p tsconfig.block-demo.json
bun x vite build --config vite.block-demo.config.ts
node --test block-demo/discovery.test.mjs
bun x playwright test --config playwright.block-demo.config.ts --list
```

Root-owned acceptance command:

```sh
bun x playwright test --config playwright.block-demo.config.ts --output ../../../output/block-demo/browser-results-editorial58
```

Expected full matrix: exact 58 filesystem/runtime names, **464 canonical captures** (58 × 4 packs × 2 widths), existing 32 card captures, plus **16 editorial tab captures**. New `editorial.pw.ts` tests both widths/all packs, opens the real local editor preview as a second instance, checks unique IDs/independent state/keyboard focus/actual distinct loaded media, and saves durable association/geometry evidence. Browser acceptance and premium review must be supplied by root; no browser/live/provider actions were performed by this agent.

Prior polished50 proof is recorded in canonical-content50-renderer-outcome.md: root **12 tests, 58.7 seconds, 400 canonical plus 32 card captures**, with accepted desktop Depot/mobile Journal bento and existing keyboard/media/tables/reveal checks. This is the accepted baseline, not an automatic acceptance of these eight additions.

## Parent browser proof — editorial58

Root ran the full58 gate: **14 tests passed in approximately 1.2 minutes**, with **464 canonical + 32 card + 16 editorial captures**, saved under `output/block-demo/browser-results-editorial58`. Root visually accepted desktop Depot promo-band. Mobile Journal testimonial-wall review identified inline attribution wrapping; the following narrow attribution polish is pending its own visual acceptance. Existing58 runtime/interaction evidence remains valid and does not imply all136 blocks or legacy activation are complete.

### Attribution polish checkpoint

Testimonial-wall-only CSS places name and source on separate grid rows, with a stronger name and a smaller muted upright role. The SDK pack Quote treatment, authored values and semantics remain intact. The final canonical fixture uses concise explicitly fictional guest/designer/editor roles instead of repeating an endorsement disclaimer on every card. Other blocks and runtime author data are unchanged. Targeted browser gate checks actual text/cite line geometry, preserved values, hierarchy and overflow at1440/390 under every discovered pack; visual acceptance pending parent.

Attribution follow-up local checks:30 renderer tests/1011 assertions, isolated TypeScript, offline build, targeted test lint, generated-contract freshness and scoped diff-check all passed. Inventory stays58; browser listing now15 tests. Root targeted command (Website/apps/web): `bun x playwright test --config playwright.block-demo.config.ts --grep 'testimonial names' --output ../../../output/block-demo/browser-results-testimonial58-polish`. Expected8 captures, one per pack/width, plus durable attribution geometry. No browser was run by this agent.

## Parent acceptance — testimonial attribution

Root targeted browser session37293 exited0: **1 test and 8 pack/width captures**, saved at `output/block-demo/browser-results-testimonial58-polish`. Root personally reviewed mobile Journal and accepted the separate name/role hierarchy. This closes the reported attribution polish defect; source inventory remained58 during that gate.
