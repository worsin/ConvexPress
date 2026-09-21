# September 21 motion review

This checkpoint establishes current hardware evidence for the two marquee implementations and repairs four card entrances. It does not establish universal device performance, every block's motion quality, or complete production readiness.

## Hardware marquee result

Ran the existing32-case motion matrix in headed Chromium with `BLOCK_DEMO_REQUIRE_GPU=1` against the owned BlockDemo server. It covers SDK text marquee and canonical `core/marquee` image track under Core, Journal, Depot and Aster House at1440/390px and DPR1/2. All32 cases passed on Apple M5 through ANGLE Metal, with hardware GPU compositing enabled.

The3,840 measured frame intervals had worst p95 of8.6ms and worst individual interval8.8ms. There were no long tasks, no frames over twice the sample median, and no steady paints on the measured animated layers. CDP reports an active accelerated transform animation for the exact track. Manual pause and reduced-motion stop passed in each case. A separate visible Chromium147.0.7727.15 session exercised and captured the image track while running; its screenshot was inspected.

These are finite samples on this machine, not a guarantee for every display, browser, animation or user workload. The32 cases cover two shared implementations, not32 different blocks.

## Product defect and repair

`core/ugc-grid`, `core/social-feed`, `core/search-results` and `commerce/download-library` started entrance animations immediately at mount. Headed DOM observations recorded their cards over6,000px below the viewport while animating. Five new browser cases failed before repair, including missing-observer fallback.

Each card now uses the existing `observeSectionReveal` helper as a React19 cleanup-returning callback ref. Animation CSS applies only to an entered card with no reduced-motion preference. Pending and unsupported-browser content stays visible. Keyboard focus settles the card immediately; reduced-motion changes stop it without replay. Ref cleanup disconnects the observer/listeners when dynamic results disappear. A StrictMode fixture verifies ref cleanup and proves ordinary card updates do not recreate observers or restart entrances. Content contracts, references, actions and persistence are unchanged.

Five browser cases now pass in both development and the production demo build. The four block cases each cover all four packs at1440/390px: offscreen/static → viewport entry → focused/settled → reduced motion → no replay. The fifth covers all four blocks without IntersectionObserver. Existing affected interaction suites pass nine cases, preserving pagination, dialogs/focus, broken-image behavior, social-image opt-in and download controls.

The first post-fix harness run exposed its own staging error: returning to the page top inherited smooth scrolling, so later specimens were still onscreen. That run was deliberately interrupted after diagnosis. The harness now blurs the previous control, positions the viewport instantly and asserts scrollY0 before mounting. The offscreen assertion remains intact; `entrance-current` and `entrance-production` are the final results.

## Repaired entrance hardware samples

Four additional headed measurements used the production demo, Core pack,1440×900,DPR1. Each sampled80 frame intervals starting from the actual animationstart event. Every exact card had active accelerated transform and opacity reasons, visible document state and GPU compositing enabled. Sample windows were555–557ms; worst frame interval7.9ms, no long tasks. Settled UGC/download card screenshots were inspected. This is specific Core desktop evidence; other-pack/mobile behavior is tested, but their hardware frame timing is not claimed from these four samples.

## Validation, tracking and preservation

All283 renderer tests/4,956 assertions pass, plus the expanded reveal fixture. Website/demo types, Website client/SSR and BlockDemo builds, block/generated-contract/kit freshness and focused lint pass. No dependency added; the existing CSS compositor and viewport observer provide the motion. Build chunk-size warnings remain unrelated to this scoped result.

Five MagicTables Blocks Notes updates record exact evidence for the marquee and four repaired blocks. Dry-run requires zero creates/five updates, and readback compares all137 rows with only the planned Notes changes. Full-block completion flags remain unchanged. No native account session, backend data, provider configuration or live site was changed. The owned browser and production preview are closed after checks; original app processes remain running.

Evidence: `output/motion-acceptance-20260921/{hardware.log,hardware-summary.json,hardware/,entrance-before-observed.json,entrance-before.log,entrance-current.log,entrance-production.log,entrance-hardware.json,interactions.log,reveal-tests.log,renderer-tests.log,website-types.log,demo-types.log,website-build.log,demo-build.log,contracts.log,lint.log,mt-verified-current.json}`. The inventory files identify other motion code still requiring its own review.

The original audit stays five accepted/nineteen open. Full block/native/live-data/visual acceptance, the remaining motion implementations, template handoffs and production release gates remain open.
