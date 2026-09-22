# Card-family acceptance and requirement gaps — September 21

**42/137 blocks verified; 95 pending.** Pricing Cards and Feature list (alternating) advance to Verified. Feature Grid and Bento Grid retain In progress because the original requirements exceed their current contracts. The original production audit remains eight accepted/sixteen open.

## Concrete repairs

Feature Grid previously reserved a third track when only two cards existed. A shared typed column selector fills one/two-card rows and balances four cards into two rows, while Journal retains its two-column treatment. Pricing Cards now uses the same selector without changing its prior layout policy.

Alternating Features used viewport width to choose two columns even inside a narrow authored container. It now uses its own 44rem container threshold and container-relative spacing. Wide layouts still alternate media sides; narrow placements preserve source order and stack copy/media.

All four introductions and the prose-bearing feature/bento/alternating item fields expose textareas. Paragraph breaks survive editing and save/reload. Pricing Cards, Bento and Alternating now declare write-time action-label rules: a destination requires a visible nonblank label. Existing stored values remain readable for repair and revision recovery; no content conversion or storage-version bump occurs.

## Native and deployed evidence

An owned Electron session authored a four-block page, Fieldwork — the essentials, on isolated Promotion Lab staging4860. It included two feature cards, two pricing plans with nested features and one featured plan, three Bento tiles, and two alternating media rows. Three real image uses selected existing media without creating or modifying media records. Native entry of an unlabeled pricing action disabled Save until corrected.

Revision3 saved the authored tree. Reordering feature cards, Bento tiles and alternating rows produced the exact expected revision4 tree. Native restoration produced revision5 exactly equal to revision3; publication revision6 retained the identical tree. Actual Website media loaded at1448 natural pixels, alternating placement changed correctly between desktop/mobile, and keyboard/pointer action navigation reached the authored features anchor. No mobile page overflow occurred.

The deployed backend refused twelve invalid empty/whitespace-label save/preview requests across the three action-bearing blocks. Three corrected previews succeeded and the stored document stayed unchanged. Strict staging deployment retained all1,601 source files including22 Community Events files; export comparisons prove all six plugin tables unchanged.

Unchanged pricing controls, nested feature movement, long-copy limits, unsaved preview and real CTA behavior reuse output/pricing-native-20260920/acceptance-review.md. Unchanged native Depot/Journal/Core template switching reuses depot-defaults-20260921.md. Shared locking and audience visibility retain their separate accepted evidence. This does not prove provider payments, whole-template quality or hardware animation performance.

## Tests and visual review

- 298 renderer cases /5,152 assertions; five contract cases /10,974 assertions pass.
- Seven final browser cases pass: introduction paragraph controls, shrinking feature grids, alternating narrow/wide layouts, three pricing viewport cases, and the existing four-pack desktop/mobile card-typography/Bento-geometry case.
- The existing gallery case initially failed two stale style assertions. Source history confirms emergency wrapping changed in c809efb8 and Depot mixed-case headings in fd55232e. The test now judges actual word breaks and fitting bounds, retaining geometry/font/pack checks. The pricing case now measures its actual grid width instead of the outer viewport, matching the previously accepted shared container layout.
- Admin, Website and demo typechecks, production Website build, generated canonical freshness, eight-skill/77-file kit freshness and focused lint pass. Sixteen thumbnails refreshed; all548 assets validate. Renderer evidence precedes only the final multiline metadata change; final generated contract checks and browser textarea tests cover that change.
- Inspected real native/public desktop/mobile images, Journal narrow alternating layout, Depot desktop Bento and Aster mobile Bento. Cards have readable type, loaded media and usable actions. These blocks introduce no new continuous animation; full premium motion/hardware review remains a separate delivery gate.

## Requirement mismatches: do not mark these complete

**Feature Grid:** the handoff specification example and MagicTables Key Fields require per-item icon and link. Current fields only supply title/description. Add optional compatible icon/link fields, useful native selection and safe labeled links; render through template-owned primitives, then verify saved/reopened/reordered/restored values and all-pack public behavior. Current layout and text acceptance does not satisfy the missing features.

**Bento Grid:** MagicTables Key Fields requires per-tile size. The renderer currently derives wide tiles from first/last position; there is no authored size. Add a compatible automatic/default plus explicit size choice, preserve existing trees, and verify odd/even counts, mixed authored spans, narrow layouts, persistence and recovery. Do not substitute automatic arrangement for the authored control.

These gaps are recorded on the two existing roadmap rows, preserving their original requirements and full acceptance flags. Two other rows advance to Verified only after dry-run and complete137-row readback comparison.

## Preservation and integration

Native withdrawal returned the public URL to404. Native original-editor recovery restored the original title/content/blocks/mode. The owned page and its revisions were then removed. All42 pre-existing pages and appearance values remain unchanged. Native/API sessions signed out; owned Electron/browser/profile, preview4322 and forward14860/14861 closed. Original Electron39198, renderer69634, BlockDemo8172 and SSH68390 remain running.

Artifacts live in output/card-family-20260921, including final deployment receipt, source manifests, failed/final tests, document snapshots without display leases, public geometry/media/action checks, screenshots, plugin comparison, cleanup and MagicTables plan/readback. Integration receipt records the local commit and main fast-forward. No push or live/provider deployment is part of this batch.
