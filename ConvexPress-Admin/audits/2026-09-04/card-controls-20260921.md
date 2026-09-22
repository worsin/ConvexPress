# Feature Grid and Bento authored controls — September 21

**44/137 blocks verified ; 93 pending.** Feature Grid and Bento Grid now close the requirement gaps recorded in card-family-20260921.md. Original production audit: eight accepted/sixteen open. Full template sites, premium motion and release acceptance remain open.

## Delivered behavior and compatibility

Feature Grid items now accept optional icons and labeled links. All 13 symbols supported by the existing Website primitive are selectable. Canonical icon fields can declare bounded options, which the generated editor presents as a selector and both compilers validate. Existing icon fields without options retain their original open-name behavior. Decorative SVGs are hidden from assistive technology; adjacent titles supply meaning. Journal/Depot owned renderers and Core/Aster primitive treatments all render the new fields.

Optional Feature link objects carry a label, safe destination and optional new-tab choice. The existing shared authoring-action validator rejects blank/whitespace labels for destinations. The Website link primitive adds new-tab announcement and noopener/noreferrer. No raw SVG, HTML or arbitrary executable input is accepted.

Bento items now offer auto, standard and wide sizes. Omission/auto preserves the original first-tile and final-even-tile layout. Standard occupies one column and wide spans two in containers at least 44rem wide. Wide media uses the existing side-by-side treatment. All tiles stack below the threshold. Placement follows authored reading order, without dense-grid reordering; deliberately putting a wide tile after a standard tile can leave a half-row empty. Explicit sizes move with their content rather than following position.

All new fields are optional without defaults. Existing v2 documents retain absent fields and old layout; there is no storage-version bump, content rewrite or migration. Compiler parity and renderer cases cover old content plus explicit sizes, odd/even counts and all 13 icons. The kit contract documents bounded icon declarations.

## Actual acceptance

An owned Electron window authored Fieldwork — designed details on isolated Promotion Lab staging4860. One feature received a heart icon and a labeled new-tab link to the Bento section; another intentionally retained text-only content. Three Bento tiles received standard/wide/auto settings, with an existing real image on the wide tile. A whitespace link label disabled native Save until corrected.

Revision 3 saved the two-block page. Reload retained icon/link/new-tab settings and all three size values. Moving the second item first in each block and saving produced revision 4 exactly equal to the expected reordered tree. Native recovery produced revision 5 exactly equal to revision 3, including media and optional-field absence. Publication retained that exact tree as revision 6.

The built Website rendered the heart, a loaded 1448px image, 436px standard tiles and an 896px wide tile at desktop width. At 390px every tile was 286px wide, stayed in source order and caused no page overflow. Keyboard Enter opened the feature link in a new tab at the exact tile-details anchor; window.opener was null. Native, public desktop/mobile, Journal feature and Depot authored-size screenshots were inspected.

Eight deployed requests tested unsupported icons, blank link labels, unsafe destinations and unsupported sizes across save and preview. All were refused; a valid preview succeeded and the stored document stayed identical. Strict deployment retained all 1,601 snapshot files and 22 Community Events source files. All six plugin-table exports match the pre-deployment backup.

## Verification

- Contract regression failed before implementation; final six contract cases /10,992 assertions pass, including generated/runtime parity for every existing example.
- 300 renderer cases /5,223 assertions pass, including all supported symbols and old/explicit Bento arrangement.
- The existing 13 generated-form DOM cases pass in their isolated wrapper. Two new real-browser cases cover all four packs, native-style icon/link controls, blank-label correction, optional reset, new-tab attributes, authored size overrides and 1104/420px containers.
- Three scaffold cases /23 assertions, Admin/Website/demo types, Website production build, generated freshness, eight-skill/77-file kit freshness and focused lint pass. Eight thumbnails refreshed; all 548 validate.
- Unchanged layout/content/media/action/template-switch/visibility/locking evidence from card-family-20260921.md and its linked accepted checks is reused. This batch adds no continuous animation and does not claim hardware motion profiling.

## Preservation

Native withdrawal returned public HTTP 404. Original-editor recovery restored original content/mode/title. Only the owned page and revisions were removed; all 42 prior pages and appearance values remain unchanged. API/native sessions signed out. Owned Electron 83520, browser, profile, preview 4322 and forward 14860/14861 closed; original Electron 39198, renderer 69634, BlockDemo 8172 and SSH 68390 preserved.

The initial native launcher lost its handle after evaluation completed; the live owned process was identified by its exact profile and reattached through its debugger endpoint, without launching a replacement. An early revision snapshot observed the pre-completion state; authoritative reread confirmed revision 5 before publication. Neither intermediate observation supports the final acceptance claims.

Artifacts: output/card-controls-20260921 contains strict deployment/source manifests, failure/final tests, native/reorder/recovery/publication snapshots without display leases, public geometry/navigation/media receipts, screenshots, cleanup and MagicTables dry-run/readback. Two existing rows advance to Verified only after exact dry-run comparison and all 137-row readback. Local integration is recorded separately; no push or live/provider deployment occurred.
