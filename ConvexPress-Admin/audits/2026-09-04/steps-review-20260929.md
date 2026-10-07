# Steps with Media — bounded motion acceptance, September 29

The remaining E11 requirement is satisfied by controlled current evidence. The historical304.5ms interval is retained and its cause remains unknown. This is not a claim that the old event was fixed or that every device will be smooth. Evidence: `output/steps-review-20260929/`.

## Current motion evidence

The final headed matrix covers Core, Journal, Depot and Aster House at1440×1000, DPR1/2, with fresh cache-disabled and genuinely warmed-cache cases:16 cases,64 forward/reverse transitions,7680 measured animation frames. AppleM5, ANGLE Metal26.6, Chrome147.0.7727.15 and enabled GPU compositing are recorded. Every measured frame reports actual visible/focused state. The final worst transition interval is8.8ms, maximum p95 is8.7ms, with no observed long tasks. Each transition contains at least50 partially interpolated opacity frames and reports ActiveOpacityAnimation for the exact stage layer. Each layer painted once initially, with no repeated paint during that transition. Both real images decode; the image-free step retains its title; the pinned stage stays in the viewport.

Startup is recorded separately and is not hidden by that8.8ms figure: ten cold-start intervals exceed16.7ms, with a28.3ms maximum and no long tasks. The complete preceding physical-focus matrix remains under `before-critical-styles/`: worst transition14.2ms, no long tasks. It was followed by a fresh matrix because a demonstrated CSS delivery defect changed the final artifact, not to select a better timing sample.

Cold cases report zero cache hits; warm measurements record16 real storage-image cache hits. A separate cache control confirms memory reuse with zero encoded response bytes, despite CDP's fromDiskCache remaining false. Reused browser cache is therefore explicitly described as memory cache.

The original harness falsely reported focus/visibility while its window was minimized. Installed Playwright1.59.1 initializes focus emulation on its own CDP session. Disabling it from a second session did not clear that setting. A bounded test-process loader adapter changes only that original initialization to false in memory; installed dependencies and product code are untouched. With the adapter, the owned-window control emits blur/hidden and restore/visible events and records a1069.5ms intentional background gap. This validates the instrument; it does not explain the historical304.5ms event. Original emulated matrices and failed controls are preserved with that limitation.

## E50 — styles arrived after server-rendered content

1. **Failed workflow:** fallback screenshot review showed the visual stage repeated beneath the readable steps during initial load; JavaScript-disabled actual Website acceptance reproduced stage display:block and missing grid/gap styling.
2. **Causal connection:** the server emitted complete lazy-renderer markup, but Steps CSS was absent from the initial stylesheet links. Its dynamic JavaScript import delivered CSS later.
3. **Repair boundary:** the Website root imports a CSS-only discovery module for canonical, shared SDK and pack-owned block styles. Vite includes them in the initial route asset graph and deduplicates renderer imports. Views and their code remain lazy; no backend, contract, content or dependency change.
4. **Proof:** the same unhydrated test now has stage display:none, three ordered steps, grid layout and32px gap. All four packs at1440/390 pass with JavaScript disabled; sixteen additional narrow/short/reduced-motion/no-observer cases pass with images, authored alternatives, no overflow and no page errors. Final motion is verified against the rebuilt artifact.
5. **Cost/limits:** main CSS rises from197.31kB/28.19kB gzip to389.80kB/57.85kB gzip. This deliberately ships initial block presentation before behavior. All137 Library renderer chunks remain outside the main entry's static JavaScript closure. The independent main-JavaScript budget and final integrated delivery remain open under Task8.

Earlier fallback assertions were valid, but their screenshot helper navigated again without waiting for readiness. Those captures are retained under `pre-ready-captures/`; final screenshots capture the asserted document. This harness defect exposed E50 rather than excusing the visible product issue.

## Reuse, verification and closure

Steps block.json/render.tsx/stage-media.tsx/steps.css are byte-exact from40d1143a. Their accepted native authoring, rich marks, picker/reorder, save/reopen/exact history recovery, blank-title refusal, delayed/failed image and source-replacement proof remains applicable. References/hashes are in `source-provenance.json`; no fresh native session is claimed for this batch.

Website types/build pass;316 renderer tests/5491 assertions and8 lazy registry/hydration tests/29 assertions pass. The actual built Website covers final motion and24 fallback/initial-paint cases; representative desktop/mobile captures are visually reviewed. No backend deployment or thumbnail refresh is needed for unchanged block appearance.

Cleanup and exact one-row tracker receipts accompany this report. Only core/steps-with-media may advance Status/Tests/Screenshots; every Note and unrelated cell must remain exact. Tasks4–8, remaining blocks and E18/E22/E28 stay open. No push or subagents.

Final closure: exact tracker readback94 Verified/43 In progress/137. One row changed only Status/Tests/Screenshots; all137 Notes and other cells unchanged. Owned page hard-deleted404;42 original pages,11 media and appearance values exact; consumer index ready; API session revoked. No new residual fixtures or native session. Owner39198/62672/65092/68390 preserved; owned built Website54551 serves4322.
