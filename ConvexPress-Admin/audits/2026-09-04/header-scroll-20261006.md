# E84 Header layout and scroll acceptance

2026-10-06. Completes the bounded header layout control repair begun in5751595b. Full Task5 and the delivery goal remain open.

## Demonstrated failures and changes

All4 pack headers reduced `scroll-up` to the same sticky boolean as Always. Two focused behavioral tests failed because downward travel left the header visible. Core separately replaced Transparent/None with an opaque background and shadow after scrolling; a real-component before/after regression reproduced that override.

The shared sticky-header observer now receives the configured mode from all4 headers. On Scroll Up hides after downward travel beyond the header and reveals on reversal or keyboard focus. Small deltas accumulate to avoid trackpad flicker. The anchor offset follows visible header height, including resize, and returns to0 while hidden. Cleanup restores the prior inline position and offset and removes listeners. Always/None remain independent modes. Core's unrequested scrolled decoration override is removed.

## Fresh evidence

- `output/header-scroll-20261006/red.log`:2expected scroll/focus failures before repair. `appearance-red.log`:Core changed Transparent/None on scroll before repair.
- `green.log`:6test cases pass across scroll controller, four-pack layout and branding test files. Internal real-component fixtures exercise32layout checks and66branding cases. Scroll tests cover direction, top boundary, resized height, keyboard focus, Always/disabled behavior and listener cleanup.
- Website types and production build exit0 (`types.log`, `build.log`); changed-file oxlint0warnings/errors. Prior full lint remains affected by2 unchanged no-control-regex warnings documented in the layout checkpoint; no claim of a green repository-wide suite.
- Controlled browser:actual pack header markup, production CSS and production scroll observer;12 desktop pack/mode combinations plus4mobile Scroll Up combinations. All Scroll Up cases hide at bottom0/offset0 then reveal at top0/full offset. Always remains at top0;None scrolls away with offset0. See `desktop-scroll.json`, `mobile-scroll.json`. Complements the prior104 layout renders. This harness directly mounts the production observer; actual React hook integration is separately proved by the published Website below.

## Native Electron and actual Website

Isolated Acceptance.app, normal scoped operator sign-in, disposable staging4860, current owned Website4322. Opened Header Layout in native Customize and changed all5 fields through native controls.

| Pack | Layout | Sticky | Background | Height | Border | Observed desktop main row |
|---|---|---|---|---|---|---|
| Core | Centered | On Scroll Up | Transparent | Tall | None |80px|
| Journal | Split | On Scroll Up | Glass Blur | Compact | Bold |48px|
| Depot | Centered | On Scroll Up | Transparent | Tall | Shadow |72px|
| Aster House | Split | On Scroll Up | Glass Blur | Compact | None |64px|

Core saved a draft, reloaded the native app, explicitly loaded the saved draft, retained all field values, then published through Review changes. Other3 packs were activated and published through native Templates/Customize. Native screenshots and `native-loaded-draft.txt` are in the batch folder.

Actual Website at1440x900 and335x600:all4 published layouts match their selected background/border/height; all4 desktop brand centers are within0.016px of header center; no horizontal header overflow at either width. Actual React-integrated scroll-up hides/reveals on Core, Journal and Aster desktop and Core/Journal/Depot mobile with matching offsets. Depot homepage fits900px height, so its unchanged desktop scroll readback is NOT counted as scrolling evidence; its335x600 page actually scrolled and passed. Aster mobile rendering was checked but its public mobile scroll path was not repeated after desktop and controlled-mobile acceptance.

Evidence:`four-pack-public-proof.json`, `public-core-scroll.json`, `core-published-snapshot.json`, `four-pack-published-snapshot.json`, native screenshots and public captures under `output/header-scroll-20261006/`. Core's initial separate observation used the browser default viewport before the explicit1440override; retained accepted proof uses the explicit dimensions.

## Preservation and closure

Before restoration, snapshot equality proves only the4 expected header.layout groups and native active-pack changes occurred. Pages, menu locations, general, reading and drafts match the saved baseline. Restored the original appearance values exactly using the registered publish mutation and expected revision; normal audit/revision metadata advances. Rechecked all unrelated baselines afterward (`restoration.json`).

Native environment restored to its original Live scope, native sign-out observed, scoped API session revoked with refresh401, owned native49550/Website49644 stopped and private profile removed.7protected processes remain alive. Controlled static server4394 and owned tabs closed; viewport override reset (`cleanup.json`). No backend deployment, no push, no block-status advancement.

E84 is repaired and verified for the header layout controls and scroll behavior described here. Remaining Task5 work concerns navigation/search/mobile-menu field behavior and the outstanding full Customizer matrix. This evidence does not claim all long-menu/action combinations or entire template delivery complete.
