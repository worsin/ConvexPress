# Four-pack desktop review and bounded layout repairs — October 6, 2026

## Accepted scope

All 137 last canonical examples in each of Aster House, Core, Depot and Journal were captured at 1440×1000 and visually reviewed. The authoritative `output/final-evidence-20261006/viewport-manifest.json` contains 548 identities and 699 overlapping viewport segments: Aster182, Core176, Depot166, Journal175. `review-integrity.json` verifies image hashes, unique pack/block identities, caption alignment, viewport size, no horizontal page overflow, continuous scrolling and final-bottom coverage. This closes selected-example desktop review only. It does not establish every state, mobile, provider, motion, native editor or final installed-candidate acceptance.

## E104 — Business Menu width

The Depot visual review showed descriptions in approximately160px columns despite a1281px container. The same renderer shrank in all four packs. Root and section vertical Stacks aligned children to start; the contained item Grid had no intrinsic inline size to stretch them. Replaced those two structural Stacks with single-column SDK Grids, preserving all content, item columns, schema and version.

`menu-red.json` preserves four-pack failures. `menu-green.json` records12 cases: four packs at1440/800/390, with two desktop columns, one narrower column and no page overflow. All four replacement desktop images and Depot/Journal phone images were inspected. An attempted Stack stretch value was rejected by the closed SDK and removed; no SDK schema expansion. Early zero-width/pre-paint geometry was rejected, not counted as success.

## E105 — Journal form and sidebar typography

Journal's one-third/two-thirds form split inherited the generic768px maximum, leaving its60px heading only242.66px and splitting words. The pack-owned form now fills its1056px parent, giving the heading338.66px. Journal's sticky sidebar similarly split Composition mid-word; its heading treatment now caps large headings using the actual heading container while retaining the original viewport cap. Core, Depot and Aster typography are unchanged. A shared sidebar rule was tried, observed to enlarge Depot headings, and rejected before final acceptance.

`form-red.json` and `sticky-red.json` retain baseline geometry. `form-sticky-green.json` has24 final responsive cases (two blocks, four packs, three widths), all without horizontal overflow. Corrected Journal desktop and phone captures were visually inspected; form fields, step controls and text remain intact. No form submission or provider call was made. The two rejected Journal originals and three rejected menu originals are copied under `journal-rejected-originals/` and `menu-rejected-originals/`, with their original metadata.

## Checks and provenance

322 renderer tests /5542 assertions and1148 actual pack/example cases pass;188 block/tooling tests /18140 assertions pass. Canonical contracts, generated drift and Website strict types pass. Website production build was rerun after the final CSS adjustment. Logs are `layout-final-{renderer,tooling,contracts,website}.log`; renderer evidence is `layout-final-renderer-evidence.json`. Synchronization changed zero generated files.

The manifest retains per-record capture commits plus exact hashes of the three final source changes under `finalLayoutDelta`. Unaffected earlier captures are reused; only the four menu and two Journal captures are replaced. Contact sheets retain original review ordering and may show rejected layouts; the current manifest and separately inspected replacements are authoritative. These are JPEGs, not PNG tracker evidence, and no tracker PNG gate has been relaxed. No claim of zero console errors across development/HMR attempts is made.

Audit58: ACCEPT its bounded scope/progress/count assessment against source and the133/4 checkpoint. ADAPT its E99 reminder into the existing intermittent final-native-integration watch: later successful restores are not a causal fix, and repeating identical passing checks is not a reason to stop independent work. No new audit-driven scope. Remaining dependencies include actual providers, public HTTPS editing and final installed artifact/native journey acceptance. No push, site-data mutation, backend deployment or protected-runtime restart. The user-owned untracked handoff is untouched.
