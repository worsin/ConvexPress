# Native block layout and Spacer repair — September 21

## Result

The native canonical editor now exposes each block's declared width, tone, spacing and alignment controls, plus a supported instance anchor. Options come from the canonical generated layout contract and the block's own metadata, including runtime custom definitions. Template default removes the saved override; it does not write a guessed default. Controls use the existing draft, live-preview, undo/redo, recovery and revision-guarded save flow. Pending saves, conflicts, content locks and lost authority prevent edits. Invalid or duplicate anchors fail full-document validation before saving; an invalid draft remains editable.

Spacer previously nested a fixed compact Section inside its canonical wrapper: spacing=none still occupied64px, and screen readers encountered an empty labelled region. The renderer now lets the canonical wrapper own template spacing. Existing canonical values and versions are unchanged. Empty-field blocks show no invented content or business data. No backend deployment or database schema change was needed.

## Evidence

- Before repair: direct browser measurement found height64/padding0 with an empty labelled landmark. A renderer regression and both desktop/mobile browser cases failed against the original renderer. Initial harness errors (wrong Section version and a collapsed study after template changes) were corrected before recording these failures.
- After repair:291 renderer tests/5027 assertions pass. Both browser cases cover Core, Journal, Depot, Aster House at1440/390, top-level/nested spacing none/compact/default/spacious, heading semantics/anchor, paragraph copy, divider semantics and no horizontal overflow. All eight local-study screenshots were inspected.
- Six editor/adapter/composition wrapper tests pass/266 assertions, including isolated DOM cases for preview, undo/redo, explicit CAS save, default reset, invalid anchor retention, locked input and authority removal. All canonical layout options for these four blocks survive checked serialization and pack changes without modifying content. Unsupported fields/values, malformed anchors and duplicate anchors are refused.
- Actual worktree Electron12955 used an owned profile and the existing renderer4105, visibly selected Promotion Lab staging4860. Native creation/insertion authored Heading, Paragraph, Spacer and Divider; title/text/heading anchor, block layout and instance anchor saved/reopened. Native zero-spacing preview measured0px, tone Undo/Redo and reset Undo passed. Invalid anchor disabled save and preview; correction saved and reopened as breathing-room.
- Native publication and four native template activations were followed by actual built Website4322 at1440/390. The same stored tree rendered under all four templates; Spacer height equals its template padding (Core/Journal/Aster64px, Depot32px), no inner landmark/overflow, authored heading and divider intact. All four public mobile screenshots were inspected; desktop screenshots and geometric checks are retained. Journal includes another separator in its chrome, so the assertion was correctly scoped to the authored Divider.
- Admin and Website types/production builds, BlockDemo types/build, generated-source/block/thumbnail/kit checks, focused lint and whitespace checks pass. Existing large-bundle warnings remain. Four Spacer thumbnail receipts refreshed (Depot pixels unchanged).
- Complete saved tree readback verifies template switching preserved content; the newly authored instance anchor is the only later content change. Original42 pages and complete appearance values match baseline. Fixture trashed, native/API sessions signed out, profile removed; owned Electron/browser/Website/BlockDemo/tunnel stopped. Original processes39198/69634/8172/68390 remain.

Artifacts: `output/core-text-layout-20260921/`; prior Paragraph closeout is integrated in e9e71cec. Test results are scoped evidence, not a release claim.

## Remaining acceptance for this batch

| Block | Newly accepted workflow | Still required before full block signoff |
|---|---|---|
| Heading | Native authored H2/text/heading anchor, common layout controls, four-pack published render | Remaining heading levels and inline-editor states as an authored native page; empty/maximum input visual review |
| Paragraph | Native text, common layout controls, four-pack published render; prior long-copy/migration evidence retained | Complete inline mark/paragraph editing combinations and remaining legacy structural cases |
| Divider | Native insertion/save/reopen, spacing controls, four-pack semantic public rule | Legacy variant migration/treatment acceptance and exhaustive saved layout/style combinations |
| Spacer | Fixed nested spacing, all spacing choices in four-pack browser study, native none/compact/reset, instance anchor | Legacy size migration/treatment acceptance and exhaustive saved layout/style combinations |

Conditional block visibility and active locks are still refused by the shared canonical contract; this work does not claim to implement them. Template/SDK/fleet retirement and all other original production requirements remain intact. Original audit stays8accepted/16open. Full block Status stays In progress; Tests/Screenshots indicate evidence exists, not release completion.

## Tracker closeout

Standalone MagicTables four-row dry-run/apply/readback passed against all137rows. Only the four named blocks’ Notes and applicable Tests/Screenshots flags changed; Status and every other cell remained unchanged.
