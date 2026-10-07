# Footer row controls — October 6, 2026

E93 repaired and verified at the actual footer consumer boundary. Task5/E09 remains open for native row editing/publication and remaining footer section/cell fields.

## Reproduction and repair

The Website footer editor exposes five row backgrounds, four padding choices, four container widths, four top-border choices and three alignments. Journal and Aster ignored background, padding and container values, and collapsed all non-none borders into the same subtle border. Core and Depot already consumed these values. Actual component comparisons reproduced eight failing pack/field groups; authored content remained constant.

FooterRowFrame now owns the common background, border, width and spacing mappings, reused by Core/Depot's existing renderer and Journal/Aster's pack-owned cells. Journal/Aster authored rows sit outside the masthead's bounded container, allowing Full to mean the available footer width. Their masthead, column/cell typography, section fallback and copyright remain pack-owned. Outer background and copyright spacing are retained. No stored content or schema changes.

## Verification

- Four focused tests pass: the new isolated component fixture checks all80 pack/value combinations and content retention; existing Core footer, four-pack copyright conversion and12pack/layout menu-descendant regressions also pass.
- Website TypeScript, production build, changed-file lint and diff whitespace checks pass. Build retains existing tool deprecation/Browserslist advisories.
- Actual SSR footer components, controlled source hooks, current production CSS, local server4333: all4packs at1440/390 pass8browser cases. Computed style/geometry checks prove compact padding is smaller than spacious, narrow desktop width is smaller than full, background and border colors differ, right/center alignment applies, all links have geometry and no horizontal overflow occurs.
- Desktop geometry: narrow768px versus full1440px; compact16px versus spacious56px padding. Mobile remains inside390px. Journal desktop and Aster mobile screenshots visually inspected; all8captures saved.
- One evidence extraction attempted parseFloat inside the browser's restricted read scope; moving numeric parsing outside that scope allowed the read to complete. No product repair arose from that tooling error.

This is consumer/layout proof using real components and built CSS. It is not fresh native row-authoring, save/reopen/publication, newsletter submission, uploaded-image or all-footer-field acceptance. Pack token palettes were not changed. No database, API session, credentials, content or user settings were touched.

## Remaining footer map

| Boundary | Current evidence | Next acceptance |
| --- | --- | --- |
| Row background/padding/container/border/alignment | E93 actual4pack/80value and8browser cases | Native row edit, save/reopen, publish and restore |
| Footer nested menus and copyright substitution | E81 and chrome-retirement reports; regressions retained | Reuse; no repeat required |
| Contextual picker protocol and native collapsed footer focus | E90/E91 | Specific row/cell target coverage still needs reconciliation |
| Global section layout columns/background/image/border/padding | Core reads columns; source inspection shows differing pack consumers | Reproduce exposed-value mismatches across all4packs before changing them |
| Section branding/navigation/newsletter/contact/bottom bar | Prior partial rendering and menu evidence | Full exposed-field behavior, including legal-link choices, remains unaccepted |
| Cell formatting/media/social/divider/payment fields | Existing basic rendering | Compare each exposed value with actual cell output; do not infer acceptance from the12cell-type switch |

Goal remains active117Verified/20In progress. No push. Evidence directory: output/footer-row-controls-20261006/ (red.log,green.log,types.log,build.log,lint.log,rendered.json,browser-receipts.json and screenshots).

Cleanup: owned local evidence server61185 stopped, tab30 closed and viewport reset; all seven protected processes remain alive. First server60979 was intentionally replaced after the final build so captures use fresh markup/CSS. No user runtime was restarted.


Native follow-up: footer-native-20261006.md now records actual4pack row creation/reviewed publication, Core saved-draft recovery and Depot Minimal preset undo/redo, eight live Website checks and restoration. The earlier consumer-only boundary remains accurate for that original batch; native row lifecycle is no longer pending. Global section/cell controls remain open.
