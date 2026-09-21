# Contact/embed79 — local source checkpoint

## Implemented scope

Four new canonical renderer modules bring filesystem discovery to **79 of 136**: `blocks/contact-stack`, `core/booking-cta`, `core/embed`, `core/iframe`. These use the shared production dispatcher and Core/Journal/Depot/Aster primitive parts. No public canonical endpoint, storage migration, editor activation, provider deployment or tracker write occurred.

- Contact Stack preserves authored phone/email/address/hours/extra rows, including authored label-only notes; telephone/email navigation is normalized conservatively. Optional maps accept reviewed OpenStreetMap share-embed URLs with validated bounds/layer/marker.
- Booking CTA preserves the real authored link and optional basic Calendly scheduling iframe. It does not submit, confirm or simulate appointments. The final specimen explicitly uses a fictional placeholder scheduling path.
- Embed supports reviewed YouTube and Vimeo URL forms, exact video identities, YouTube start time and Vimeo player privacy hash. Authored captions survive empty media. Arbitrary rich-media providers remain explicitly unsupported.
- Iframe accepts the reviewed video/map/scheduler adapters only, with authored title and an external fallback. No arbitrary iframe flags, srcdoc, provider scripts or arbitrary host embedding.

All frames start as visible SSR consent panels. No iframe or provider request is emitted before consent. Consent is per resource/instance and resets on replacement/remount; loading moves keyboard focus into the requested frame; unloading removes it and restores the load control's focus. Reviewed external HTTPS origins receive fixed sandbox permissions: scripts/same-origin, plus forms only for Calendly; no popup/top-navigation permissions. Same-origin embedding is refused. Video autoplay is disabled, provider prefill/tracking fields are discarded, and only the origin is sent by the fixed referrer policy. This is not a promise that the providers themselves perform no tracking or redirects. Responsive controls retain at least 44px targets and reduced motion removes the short hover transform.

Examples were appended to the existing four block.json files, preserving earlier specimens. Contact details/map are explicitly illustrative; no invented real business location or client endorsement. Auth refreshed root/staged/portable discovery at79. Auth also refreshed capability metadata: Contact Stack and Booking CTA now conservatively require `embed.sandbox`, including their no-embed state, under the current static requires model. Tests verify missing capability refusal for all four blocks.

## Primary provider contracts reviewed

- [YouTube player parameters](https://developers.google.com/youtube/player_parameters), [privacy-enhanced embeds](https://support.google.com/youtube/answer/171780?hl=en), and [required referrer behavior](https://developers.google.com/youtube/terms/required-minimum-functionality): fixed privacy-enhanced player URL, controls enabled, no autoplay, minimum200×200 and strict-origin-when-cross-origin referrer.
- [Vimeo official embedding guidance](https://help.vimeo.com/hc/en-us/articles/12426259908881-How-to-embed-my-video): player availability, video privacy and embed-domain restrictions remain provider-owned. The adapter supports numeric public video URLs and player URLs with the documented privacy hash; arbitrary custom URLs are not inferred.
- [OpenStreetMap export documentation](https://wiki.openstreetmap.org/wiki/Export): Share HTML iframe, preserved map region and optional marker.
- [Calendly basic iframe guidance](https://calendly.com/help/how-to-embed-calendly-with-an-iframe): scheduling URL iframe, responsive width and700px minimum height. No advanced scripts, booking events or autoresize integration is claimed.
- [Iframe sandbox semantics](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe): exact cross-origin reviewed providers and fixed least-functionality flags; no authored permission strings.

## Local evidence

- Provider normalization: **3 tests /22 assertions**, `/tmp/contact79-provider-tests.log`.
- Shared renderer suite after full examples/anchors: **67 tests /1,637 assertions**, `/tmp/contact79-final-renderer-tests.log`. Includes all canonical examples under each discovered pack, consent SSR/hydration, per-resource reset, unloading/focus, malformed/provider/mode refusal and independent current-data binding checks.
- Primitive/provider combined gate: **15 tests /121 assertions**, `/tmp/contact79-primitives-tests.log`, including actual primitive DOM, hydration, Section nested spacing/reveal and reduced-motion cases.
- Production Website and isolated BlockDemo types: exit0, `/tmp/contact79-final-website-types.log` and `/tmp/contact79-final-demo-types.log`.
- Offline production-view closure: **79 modules /0 forbidden imports /no build output**, `/tmp/contact79-final-closure.log`.
- Canonical freshness check136 specifications/four packs passes; scoped lint and diff checks pass. Browser `--list` discovers26 tests; no browser was launched by this agent.

A new actual DOM regression first reproduced keyboard focus falling to the page body when the consent button unmounted (`/tmp/contact79-focus-red.log`,66pass/1fail). Loading now focuses the iframe; unloading restores its trigger. Full67 tests pass after that repair.

Generated full-tree planning now refuses malformed anchors/layout before installing data. The previous featured regression initially failed because it expected that malformed installation to reach rendering; it now checks early planner refusal and invalidation of an already-issued grant, preserving separate renderer collision tests. Narrow approved deduplication removed heading/footnote manual anchor callbacks: the dispatcher reads generated domId metadata through collectCanonicalAnchors. Primitive block-layout validation now calls the shared generated factory. Section/base/reveal/CSS and rendered anchor/link values are unchanged.

## Root browser gate and outstanding acceptance

From ConvexPress-Website/apps/web:

```sh
bunx --no-install playwright test --config playwright.block-demo.config.ts --output ../../../output/block-demo/browser-results-contact79
```

This runs the full26-test suite. Expected canonical matrix is **79×4×2 =632 captures**; new contact/embed gate adds **32 consent captures** and two durable contact-embed-boundaries JSON files. The new tests intercept provider frames with a clearly labeled local response: they prove consent request boundaries, configured sandbox/referrer, iframe dimensions, keyboard entry/unload, focus, links and pack geometry. They do **not** prove live provider availability, Vimeo privacy configuration, Calendly account existence or successful booking. A real approved Calendly URL is needed for actual scheduler acceptance; no appointment should be submitted for these checks.

Suggested first visual review: mobile Journal Contact Stack, desktop Depot Booking CTA, mobile Core Embed, desktop Aster Iframe. Screenshots use `contact-{width}-{pack}-{namespace}-{name}.png` within the respective test output directory. Full source-generated matrix inventory remains exact; do not confuse79 implemented renderers with136 complete blocks. Provider/browser/premium visual acceptance and MagicTables remain root-owned and pending.

## First root browser gate — responsive defect and source correction

Root session66342 completed **24 passed /2 failed**. Failed artifacts remain at `output/block-demo/browser-results-contact79`. Both failures selected Aster House `core/embed`, final Example3 at390px: the focused contact gate measured canvas scrollWidth447 versus clientWidth374; the canonical matrix measured document overflow, followed by a secondary timeout. Desktop contact gate passed. This run is not accepted browser completion.

Source diagnosis and the failure screenshot agree: the unloaded stage's16:9 aspect ratio and240px minimum block size imposed approximately426.67px intrinsic width, plus20px container inset, matching447px. The screenshot also showed the consent button clipped by the stage's overflow rule. The fix bounds the stage's inline size and grid track, gives consent natural content height, removes clipping, and applies aspect ratio only after media is loaded. Consent children remain bounded and wrapped without truncating authored text. No root Section/primitive styling or schemas changed.

Added browser containment assertions for every consent child and the full button, plus loaded/unloaded stage state checks. Existing canvas/document overflow assertions remain unchanged. Local renderer/DOM tests now **67 pass /1,640 assertions** (`/tmp/contact79-responsive-renderer-tests.log`); scoped lint/diff pass. Root must rerun the full26 gate into **`output/block-demo/browser-results-contact79-fixed`**, preserving the initial failed evidence. Provider availability and booking remain separately unverified.

## Root acceptance completed

Full26 browser rerun passed in2.1 minutes, session75981 exit0. Output browser-results-contact79-fixed contains exactly632 canonical captures and32 contact consent captures. Root viewed Journal mobile Contact Stack, Depot desktop Booking CTA, Core mobile Embed and Aster desktop Iframe: readable wrapped text, complete controls, bounded panels and distinct pack styling. MagicTables four existing rows updated after zero-create dry run; all five fields read back exactly,136 unique rows unchanged. Receipt: output/blocks-tracker/renderer79-verification-2026-09-05.json. Full-block completion flags remain false; intercepted provider frames are not live provider availability.

Root live provider check: isolated real Chromium with no provider interception rendered the actual OSM map canvas and YouTube Developers player after consent. Screenshots viewed; output/aster-house/contact-provider/acceptance.json. YouTube playback was attempted but not established: shared demo refresh detached the iframe and reset consent before observation completed. Vimeo and real Calendly remain pending. Isolated browser closed.

## Root accepted Contact79

The stable corrected full gate passed **26 tests in2.1min**, session75981, `/tmp/convexpress-contact79-fixed-browser.log`, artifacts `output/block-demo/browser-results-contact79-fixed`: **632 canonical +32 contact consent captures**. Root visually accepted four representative pack/width specimens. MagicTables acceptance updated four existing rows, created zero, and verified exact readback; all136 scope remains tracked.

Root additionally loaded the real, unintercepted OpenStreetMap map and YouTube Developers player through these consent adapters. Evidence is `output/aster-house/contact-provider`. This confirms those live iframe/provider load paths; it does not claim playback, Calendly account availability or booking completion. The original24pass/2fail artifacts remain preserved.
