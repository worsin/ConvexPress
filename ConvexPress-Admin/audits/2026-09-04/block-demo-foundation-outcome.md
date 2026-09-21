# BlockDemo primitive foundation outcome

Implemented an isolated internal warm-paper/cobalt composition gallery at `ConvexPress-Website/apps/web/block-demo`, using all 25 real SDK primitives. The normal storefront/router/build graph and current surfaces remain unchanged. No backend, native, browser or provider operations were performed by this agent.

The theme selector discovers the four actual manifests and their palettes/defaults through `settingsCss`. Journal has four opt-in typed parts (editorial Heading, Eyebrow, Card, Quote); Depot has four (bold Heading, square Card, stamp Badge, ruled Stat). Core and Aster House explicitly use real manifest tokens plus the SDK baseline. The new primitive parts are not wired into the current storefront registry. Shared contract validation and recursion/pack-isolation boundaries remain intact.

The supplied ceramic-workshop image is unchanged, with existing root provenance. A clearly labeled local four-second still-image WebM/VTT fixture exercises video transport, controls and captions without representing generated footage as real.

Checks performed:

- Dedicated Vite production build succeeds, without launching a listener. Output is ignored `block-demo/.dist`; main JS approximately 319kB uncompressed /96kB gzip, CSS19kB /5kB gzip, supplied PNG2.34MB.
- Primitive plus gallery tests: **12 pass, 241 assertions**, with isolated DOM/hydration checks. Gallery SSR renders every named primitive under all four packs, verifies exact manifest palette projection, actual opt-in override ownership and recursive fallback termination.
- Scoped harness lint passes. Integrated Website typecheck initially exposed root's separate Bun test fixture declaration issue after the harness font import was corrected; root converted that fixture to JS.
- No dependencies or lockfiles changed.

Parent browser command is documented in `block-demo/README.md`: isolated loopback Vite config at4318, then optional `playwright.block-demo.config.ts` using the existing Playwright package. No automatic server startup; single browser worker; screenshot matrix1440/390px, all packs/presets, keyboard tabs, console/overflow checks, reduced motion and120-frame RAF/long-task JSON attachments. Output root `output/block-demo/browser-results`.

## Parent browser evidence and follow-up

Root ran the actual browser harness: **3/3 pass**, screenshots for all four packs at1440px and390px, no console errors or horizontal overflow. Root visually reviewed Journal as a strong editorial foundation and identified plain native motion-button chrome. That control now uses explicit pack-token colors, border, radius and typography, a44px minimum target, Play/Pause icons, pressed/hover treatment and focus ring. Existing12tests/241assertions still pass after the change.

Root also found list-reporter in-memory attachments did not leave a persistent timing file. The harness now writes `motion-frame-timing.json` to `testInfo.outputPath` before attaching its path. The browser test now checks minimum target size, appearance reset and focus outline. Root reran after the small follow-up: **3/3 pass in6.3s**, with durable timing JSON verified.

Root subsequently captured visible Chrome147 on AppleM5 atDPR2: active accelerated transform layer,240frames, median6.9ms/p957.6ms/max7.8ms, no frame above33ms, no long tasks, and marked trace0Layout/0Paint/240DrawFrame (UpdateLayoutTree240). Evidence is `output/block-demo/motion-acceptance.json` and `motion-trace.json`. This is scoped Journal desktop proof for the primitive gallery, not universal hardware/mobile performance acceptance.

The staged real-block gallery was added later; its separate26-renderer matrix remains pending parent acceptance. Actual compositor/paint tracing remains separate from RAF sampling. **RAF diagnostics do not certify GPU behavior or smoothness; full136-block acceptance remains pending.** This is the primitive foundation and internal harness, not full block coverage or live integration.
