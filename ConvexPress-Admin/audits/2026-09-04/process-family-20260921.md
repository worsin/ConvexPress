# Process family — September 21

**Process Steps, Roadmap Timeline and Countdown are verified for their current canonical contracts. 52/137 blocks verified;85 pending. Steps with Media remains In progress for the initial slow motion sample described below.** Original production audit:8 accepted/16 open. Complete template websites, remaining blocks, provider/fleet/installer and production acceptance remain open.

## Delivered

Process Steps now has the tracked optional structured media field, preserving existing v2 steps without adding values or changing their version. Site media, alternative text and focal position use the existing resource contract. The renderer uses a semantic ordered list and available-width card layout. Process and Roadmap prose fields explicitly expose multiline controls. Roadmap columns and Countdown columns/number sizing now follow their actual allotted width instead of the desktop viewport.

Steps with Media now implements the promised sticky shared media stage. A bounded IntersectionObserver reading band follows the source-ordered steps in either direction; ResizeObserver and viewport/motion changes restore ordinary inline reading on narrow or short screens, with reduced motion, or without observer support. Inline images and alternative text remain in semantic reading order while the duplicate visual stage is hidden from assistive technology. An image-free step shows its own title and number instead of retaining another step's image. Only opacity transitions; no continuous animation or dependency added.

Reverse-scroll testing caught an implementation error: IntersectionObserver entries contain changes, not the entire intersecting set. Tracking the complete set fixes the active step when scrolling backward. Actual built Website inspection also caught the primitive's image height rule overriding the new stage rule, leaving empty stage space despite a correct demo. The final selector covers the actual primitive image and the browser regression compares image and stage heights.

Required media-step titles now use the existing write-only visible-text rule. New saves/previews reject blank/invisible headings; historical values remain readable. No stored-content migration is necessary.

## Native, deployed and public evidence

Owned Electron40897 used a private profile against the isolated promotion-source4860 database, through the existing controller. Authored all four blocks through real native controls: three process rows, original media with25%75% focal point, three media steps with rich italic prose/two site-owned images/one no-image row, all three roadmap statuses and a UTC countdown with an authored anchor link.

Revision3 persisted all fields; reload retained them. Full-width page settings became revision4. Three repeater moves and an expired target saved revision5, compared exactly against the expected changed tree. Native reviewed restore of revision4 recovered the original complete block tree, then revision7 published it. Published blocks equal the original authored tree; no copy, media, rich mark, identity or anchor loss.

Actual built Website at1440/390px shows3/1 process columns,2/1 roadmap columns and4/2 countdown columns without horizontal overflow. Original1448px process image loads with authored alt/focal values. Sticky media follows0→1→2→1→0 with the correct images and image-free state; final image fills the576px stage. Mobile falls back to readable inline media. The countdown preserves the authored UTC instant and keyboard activation follows the process anchor.

After final strict backend deployment, six malformed inputs through both save and draft preview were refused: blank/invisible media-step title, out-of-range focal point, invalid roadmap status, impossible date and unsafe countdown link. All12 refusals leave the published document unchanged. Native blank heading keeps Save disabled; restoring the original text makes it valid without a write.

## Checks, limitations and performance

- Six final browser cases pass, including all four packs, narrow layouts, forward/reverse sticky behavior, short/reduced-motion/no-observer fallbacks, future→expired countdown and changed UTC target. Existing unchanged example/SSR/shared layout and audience/lock evidence is reused.
-302 renderer cases/5,238 assertions and13 pure contract cases/11,047 assertions pass. Admin/Website/demo types, Website client/SSR builds, generated freshness, kit parity, focused lint and all548 thumbnails pass.16 thumbnails refreshed.
- The initial before run overlapped source edits and is not clean failing-before evidence. The reverse-scroll failure in browser-current is a genuine intermediate implementation regression; browser-complete is the final six-case result. Earlier countdown harness attempts used unsupported offset syntax or froze the demo's mounting timers; the final test retains normal mounting and advances the installed clock across a UTC deadline.
- **Motion remains unaccepted:** actual Core desktop Website reports hardware GPU compositing and ActiveOpacityAnimation. The initial80-frame sample has a304.5ms interval (p95 8.2ms), with no observed long tasks. Four further actual transitions/320 intervals have worst8.7ms and no long tasks. The initial cause is unknown; do not call it fixed, attribute it to window activation without proof, or use repeats to erase it. Next is a cold/first-transition reproduction with trace evidence. Other-pack/mobile behavior is covered, not their hardware timing.

## Preservation and source receipts

Both strict deployments retain1601 snapshot files and22 installed Events source files. **Final source checkpoint is `ConvexPress-Admin/output/production-checkpoints/process-family-r2-20260921`; authoritative manifest/receipt are `output/process-family-20260921/r2/deployment-source-final.json` and `deployment-final.json`.** Future snapshots must derive from that checkpoint.

Native withdrew publication, recovered the original editor and signed out. Owned page/revisions were permanently removed; API session logged out; owned Electron/profile/browser/preview/tunnel closed. Original42 pages and appearance values are unchanged. Post-cleanup exports compare all six Events tables and media/mediaSizes/mediaMeta exactly against the pre-change backup. Existing user processes39198/69634/8172/68390 are preserved. The final public not-found text probe did not retain an HTTP status; do not cite it as a separate404 acceptance result.

MagicTables updates the three completed rows' Status/Tests/Screenshots and appends scoped Notes to all four rows. Steps with Media retains incomplete flags. Dry-run and full137-row readback comparisons are required before integration. Artifacts are under `output/process-family-20260921`.
