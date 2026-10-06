# Responsive layout wrapper repair — October 6, 2026

Required workflow: Course Grid and Membership Plans use intentional responsive columns across all four packs; baseline Media Text stacks until its authored container breakpoint.

Failed workflow: During the complete Aster desktop selected-example review, six course cards and three membership cards each occupied one giant desktop column. Core Media Text split at783px despite its800px threshold.

Cause: SDK Grid/Split now render inside cp-layout-query. Three root stylesheets still used direct-child selectors that skipped this wrapper. The intended rules never matched; primitive defaults took over.

Repair boundary: Match the existing wrapper in exactly three canonical stylesheets. Preserve content, breakpoint values, SDK markup, pack treatments, backend and runtime processes.

Exit check: Actual browser red measurements for all three failures;27 post-repair responsive cases (two grids × four packs × three widths plus Core Media Text at1440/920/390), complete corrected Aster screenshots, actual783px Media Text stacking, renderer/contracts/drift/kit gates and an isolated Website build.

## Result and evidence

Root output directory: output/final-evidence-20261006/.

- responsive-red.json records both1281px single-column failures and Core783px two-column failure before editing.
- responsive-green.json records27 successful cases with no horizontal overflow. Both grids yield3/2/1columns at1440/800/390; Core Media Text yields2/1/1 at1440/920/390. One initial Depot read caught its asynchronous empty render; waited for the actual grid and replaced that null observation. Null was not counted as a pass.
- viewport-captures/aster-house/lms/course-grid/01.jpg and02.jpg show all six corrected cards; membership/plans/01.jpg and02.jpg show the three corrected plans and their footer. All four captures inspected at full size.
- media-text-920.jpg shows the corrected stacked Core media/text example.
- renderer-evidence.json:322tests/5542assertions and1148pack-example cases pass. contracts.log,kit.log,drift.log andbuild.log retain gate output. No generated files changed during synchronization.

## Visual matrix accounting

All137 Aster last-canonical-example desktop renders were captured without clipping, with stable scroll and continuous viewport coverage, then visually reviewed across192original segments/contact sheets. This exposed the two grid defects; replacement captures reduce current accepted manifest coverage to183segments for137identities. This is selected-example desktop review, not every state/mobile/provider acceptance. Other packs'411current-pass records remain to be captured/reconciled.

viewport-manifest.json carries current hashes, capture geometry, selected example, review scope and the three CSS hashes. The old cropped batch is rejected (rejected-crop-manifest.json). Its count never establishes acceptance. The pre-E103 manifest is historical metadata only: replacement first/second images reused paths, so its old hashes are not a preserved-original set. Current manifest hashes are authoritative; unused old segment files are not accepted evidence. Contact sheets predate the replacements; the four replacement originals were separately inspected.

The old468PNG/117block matrix is historical; it is not evidence of current137-block completion. The tracker PNG gate has not been relaxed and these JPEG captures have not been mislabeled or installed as PNG. Existing provider/human, final candidate/artifact parity, motion/state and integrated acceptance gates remain explicit.

No site data, credentials, backend deployment or protected runtime was changed. No push.

## Core follow-up at191c678c

Core137 selected desktop examples were captured after the repair and all177 segments visually reviewed in30 indexed contact sheets. No additional product layout defect was found in this scope. Together the current manifest has274records/360segments across Aster and Core; review-integrity.json confirms exact image hashes, caption alignment and complete final-bottom coverage for every record. Depot and Journal274records remain pending.

Sticky Aside exposed a capture-harness issue: wheel input over the inner content did not advance the outer page. A first retry still used the old closure-bound batch helper. Calling the corrected helper directly, targeting the outer margin and requiring scroll advancement completed the capture;16partial files are excluded. The capture helper is saved for continuation. This was not established as a product defect. Provider/motion/mobile and native integration are not inferred from these desktop images.
