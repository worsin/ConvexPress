# Canonical media renderer slice

Added eight convention-discovered views: `core/video`, `core/audio`, `core/file-download`, `core/code`, `core/before-after`, `core/gallery`, `core/social-links`, `core/logo-cloud`. Source now has42 renderers among136 canonical specs;94 treatments remain pending. The previous34-renderer browser gate is independently verified (six tests in30s,272 captures at1440px/390px), including the live watcher add/remove34→35→34 probe. That proof does not automatically cover this new slice.

The staged dispatcher accepts only an allowlisted public media DTO extended with MIME type, filename, byte size and optional caption-track metadata. It rejects credential-bearing URLs, malformed filenames and unknown keys; per-block maps still contain only declared target-resolved IDs. Existing images receive the same explicit image-only primitive projection. Video/audio enforce supported MIME types and native controls without autoplay; audio uses preload=none. Direct video URLs require HTTPS and a known video-file extension. Provider URLs fail with an actionable adapter requirement. Downloads reject active HTML and unknown content types instead of guessing.

Gallery uses a native dialog, real previous/next/close controls and trigger focus restoration. The closed modal is not exposed in the initial accessible tree. Before/after uses a labelled native range with bounded percentages and keyboard control; it has no automatic animation. Social links retain human-readable labels rather than invented platform icon mappings. Logo treatments preserve target image identity and accessible destinations. Code preserves literal escaped content, filename/language labels and keyboard scrolling; syntax colorization remains unimplemented.

Canonical filled examples come from generated discovery, authored by the schema owner. The isolated demo binds explicitly synthetic media IDs to local fixtures: existing still-image WebM plus captions, a verified one-second all-zero WAV, and a labelled text download. Comparison deliberately uses the same photograph twice, with a visible no-transformation disclaimer. No actual customer content or provider media is fabricated.

Also removed the duplicate native disclosure marker (`summary` list-style:none and WebKit marker display:none), retaining native details semantics, custom indicator and reduced-motion behavior. The browser interaction gate now asserts computed marker styles.

Local checks:15 renderer/security/component tests pass with155 assertions, including every canonical example across all42 views. Primitive/DOM/renderer wrappers pass11 tests91 assertions. Dedicated staged typecheck, offline harness build, owned lint and scoped diff checks pass. The native-dialog jsdom fixture explicitly stubs only showModal/close; it verifies component state and focus restoration, not real top-layer focus trapping or Escape behavior. Two narrowly documented accessibility lint exceptions preserve keyboard focus for the code scroll region and optional authored audio transcript/caption rendering.

Parent browser gate is prepared, not run by this agent: eight tests,42×4packs×2widths=336 canonical screenshots. New interaction tests cover native media non-autoplay controls and caption track, real transcript response, download filename, comparison Home/End/ArrowLeft, gallery focus containment/next/Escape/return focus, and code scroll focus. Independent source inventory must match browser names and versions before matrix capture.

Parent command from Website/apps/web, preserving earlier evidence:

```sh
bun x playwright test --config playwright.block-demo.config.ts --output ../../../output/block-demo/browser-results-media42
```

Remaining: parent42-renderer browser/visual acceptance, image/video delivery policies and adapters, optional content transcription and code syntax colorization, the remaining94 treatments, and any legacy activation/migration proof. This foundation does not certify all136 blocks or alter shipped storefront routes.

First parent media42 browser run: canonical336 matrix passed with matching source/runtime inventory; four tests passed and four failed. Both structural failures were the test's unsupported `::-webkit-details-marker` computed-style assumption (standard list-style:none already passed). Both media failures occurred in the modal Tab focus-containment loop; transcript response passed. These are not a42-renderer interaction pass.

Repair: summary now uses standard display:block, list-style:none and empty ::marker content, retaining the WebKit fallback. The browser gate checks these supported styles, one custom indicator and unchanged native keyboard disclosure. Gallery now explicitly cycles Tab/Shift+Tab across enabled modal controls and restores focus when navigation disables the current control; native Escape and trigger return remain. A real React/jsdom key-event regression failed first (Tab defaultPrevented false) then passed with six added assertions. Renderer suite now15tests161assertions; native top-layer/browser rerun remains parent-owned. The existing browser focus-containment loop is retained and reverse wrapping is added.

Verified parent rerun: media42 passed all eight browser tests in36.9s, with independently matched42×4×2=336 screenshots. Forward/reverse modal keyboard wrapping, Escape/return focus, native media controls, transcript/download, comparison keyboard and standard single-marker disclosure assertions all passed. Parent visually inspected mobile Depot accordion (one marker) and desktop Journal gallery. This is the verified42-renderer scope, not all136-block coverage. Repeated gallery imagery remains fixture-only proof; varied original media is a separate parent task.
