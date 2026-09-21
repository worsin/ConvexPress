# Canonical media/details66 outcome

Implemented, locally checked and browser-ready. **66 of 136 canonical specifications now have Library render.tsx files.** Parent browser/premium visual acceptance remains pending. Data resolvers, shipped routes and legacy-content activation remain unpublished/unactivated by this work.

Added eight attrs-only views:

- `blocks/grade-gallery` v1: ordered grade sections, descriptions, notes and every resolved image/caption in responsive grids.
- `core/hero-video` v1: separate owned video/poster identities, native controls, captions and authored CTA; no autoplay/provider iframe. Uses video focal point when present, otherwise poster focal point; poster-only state preserves its image alternative/focal point.
- `core/lightbox-grid` v1: canonical image list with the existing modal's focus boundary, navigation, Escape and trigger restoration.
- `core/marquee` v1: authored text, media and links; starts paused, explicit play/pause, pause on hover/focus, and live reduced-motion preference. Decorative repeated group is aria-hidden and inert, so it adds no accessible links. Animation changes transform only; no new GPU/performance claim is made before parent measurement.
- `core/steps-with-media` v1: ordered rich-text steps, canonical marks, resolved media alternatives and focal points.
- `core/countdown` v1: fixed authored date, stable UTC date-only initial SSR/client output, then local clock after hydration. Countdown digits are not a live region. One expiry status transition preserves CTA and stops the timer. Target change/unmount cleanup is covered.
- `local/sample-alert` v1: explicit info/success/warning text treatment and actual CTA. Static authored notes do not become unsolicited live alerts.
- `reference/field-guide` v2: preserves count, showDetails, note nullability, exact target media and new-tab link behavior; uses the accepted shared layout/presentation vocabulary without reintroducing legacy visual attrs.

`ImageGallery` was extracted into a shared Library component; `core/gallery` and `core/lightbox-grid` each bind their own generated schema to it. No renderer calls another renderer or bypasses canonical policy/dependency checks. The existing gallery behavior and regressions remain intact. Shared presentation uses SDK pack primitives and actual tokens; root Section/reveal/model files were not edited.

Examples-only appends in these eight specs use existing mapped synthetic media. Countdown's 2040 date is expressly a fictional gathering example with no booking/offer claim. Reference/grade/alert content is likewise explicit demonstration copy. Auth agent refreshed both root and staged generated contract sets. No source schema fields or handwritten duplicate registry were added.

## Local evidence

- **39 renderer SSR/DOM tests passed, 1222 assertions**. Full canonical example × discovered pack coverage, with pack-isolation guards, remains included.
- New regressions exercise real views: grade content/media integrity; native hero video/captions; shared lightbox optional media; inert marquee repetition/safe links; step marks/media metadata; guide visibility/count and alert variants.
- Countdown test hydrates its actual server-rendered tree without recoverable errors, advances through expiry, checks no ticking live region, preserves CTA and cancels outstanding timeout on unmount.
- Marquee DOM test exercises play/pause, live preference change and listener cleanup. Existing actual gallery modal DOM regression still passes after extraction.
- Isolated BlockDemo TypeScript, offline Vite build and targeted browser/countdown/marquee lint passed.
- Discovery/watch tests: **4 passed**. Root check:blocks confirms current generated 136-spec/4-pack output. Scoped diff-check passed.
- Browser listing only: **17 tests across 5 files**; no browser launched by this agent.

Commands from `ConvexPress-Website/apps/web`:

```sh
bun src/templates/sdk/block-renderer/run-tests.fixture.mjs
bun x tsc --noEmit -p tsconfig.block-demo.json
bun x vite build --config vite.block-demo.config.ts
node --test block-demo/discovery.test.mjs
bun x playwright test --config playwright.block-demo.config.ts --list
```

Parent acceptance:

```sh
bun x playwright test --config playwright.block-demo.config.ts --output ../../../output/block-demo/browser-results-media66
```

Expected: **528 canonical captures (66×4×2)**, existing 32 card +16 editorial +8 testimonial captures, and 32 new media-details interaction captures. New gate covers both widths/all packs: native video source/poster/controls; actual lightbox forward/reverse focus/Escape; marquee paused/default/play/focus/reduced behavior and only 3 accessible fixture links; countdown non-live digits, date/CTA, nonzero geometry and no animation. It is browser-ready coverage, not browser proof or a full 136-block claim.

Prior accepted baseline: root 58 gate: 14 passed with 464 canonical captures, followed by root testimonial polish: 1 passed / 8 captures and personal mobile Journal acceptance. Those proofs are appended in canonical-editorial58-renderer-outcome.md. Root must supply the 66 result and visual review before this slice is called accepted.

## Parent browser proof — media66

Root's full gate passed **17 tests in1.5 minutes**: **528 canonical +32 card +16 editorial +8 testimonial +32 media-details captures**, stored in `output/block-demo/browser-results-media66`. Root visually accepted mobile Aster hero-video. Desktop Depot grade-gallery review found each single-image study occupying only half its row while copy stacked above; the following grade-only layout polish is pending targeted visual acceptance.

### Grade layout follow-up

Grade entries now establish an actual-width container. At48rem and above, authored copy and media share a deliberate desktop row; below that they remain stacked. A single photo fills the media region, multiple photos form pairs, and an odd final photo spans the media row. Caption-only records remain visible; entirely empty image records produce no vacant tile. No canonical fixture or schema changes are needed. Other66 sources, including countdown/marquee/Section/reveal behavior, remain unchanged during this polish.

Grade follow-up checks: **40 renderer tests / 1229 assertions**, isolated BlockDemo TypeScript, offline Vite build, targeted test/renderer lint, root contract freshness and scoped diff-check passed. Existing multi-image SSR content tests still pass; a new case verifies empty records do not leave vacant tiles while caption-only and multiple actual images remain. The browser-ready `grade-gallery.pw.ts` requires positive copy/media/image geometry, full single-image media width, desktop side-by-side placement and mobile stacking under all four packs. It writes geometry before assertions and expects8 captures. No fixture changes or generated-contract refresh were necessary. Inventory stays66; total browser listing18 tests. Targeted root command: `bun x playwright test --config playwright.block-demo.config.ts --grep 'grade studies' --output ../../../output/block-demo/browser-results-grade66-polish` from Website/apps/web. Grade visual acceptance remains pending parent.

## Parent acceptance — grade gallery polish

Root targeted grade gate passed **1 test in3.7 seconds**, producing **8 captures** under `output/block-demo/browser-results-grade66-polish`. Root personally reviewed desktop Depot and accepted the balanced copy/image rows and full-region single photo. This closes the grade layout defect. The66 accepted baseline remains bounded to its renderer/browser scope, with full136/production activation flags unchanged.
