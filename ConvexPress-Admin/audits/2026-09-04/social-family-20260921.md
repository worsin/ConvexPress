# Statistics, testimonials and team blocks — September 21

Four current canonical block contracts now pass acceptance: Stats band, Testimonials, Team grid and Testimonial wall. The inventory advances from 44 to **48/137 verified; 89 pending**, subject to the attached MagicTables readback. The original production audit remains eight accepted/sixteen open. Complete template websites, remaining motion and release acceptance are still open.

## Delivered behavior

- Stats band supports optional per-statistic notes and fills available columns for small item counts.
- Testimonials supports optional structured portraits with authored alternative text and focal point. The shared presentation helper renders the portrait in all four packs; portrait absence does not invent a placeholder.
- Team grid supports up to eight labeled links per member, with safe destinations and optional new-tab behavior. Existing primary links remain supported. The generated editor exposes multiline biography and introduction fields.
- Testimonial wall uses CSS columns sized to available content width, preserves DOM reading order, and prevents quotations from splitting between columns. Narrow placements use one column.

New content fields are optional without defaults, preserving absent fields in existing v2 documents. No content migration or version increment is necessary. Canonical synchronization updates editor, backend and public-consumer contracts. The hand-written icon-field declaration now includes the options already supported by the runtime and generator.

BlockDemo includes an original generated portrait, explicitly identified as fictional. The original PNG and provenance are retained locally. Native upload produced the application's optimized WebP; this was verified as a loaded 1254px public image, rather than assumed to retain the upload MIME type.

## Native and deployed acceptance

An owned Electron window authored a disposable four-block page on isolated Promotion Lab staging4860. It entered two statistics, two testimonials including one portrait and one intentionally absent portrait, a member with multiline biography and two links, and three wall quotations. Whitespace-only link text disabled Save until corrected. The portrait was uploaded and selected through the actual media picker; authored alt text and focal point were retained.

Revision3 saved the document. Reload retained notes, optional absence, biography, links and portrait settings. Native row moves reordered statistics, testimonials, nested member links and wall quotations; revision4 exactly matched the expected reordered tree. Native recovery produced revision5 exactly equal to revision3. Publication preserved the same complete tree. Backend reads were checked after recovery completed; an earlier observation still showed revision4 and was not treated as successful recovery.

The built Website rendered the actual portrait at object-position50%35%, statistic note and team links. Keyboard Enter followed the in-page link; the new-tab link opened the intended anchor with a null opener. Desktop1440px and mobile390px had no horizontal page overflow. Public and representative four-pack screenshots were inspected.

Ten deployed save/preview calls refused overlong notes, out-of-range focal points, blank team labels, unsafe destinations and empty wall quotations. A valid preview succeeded, and all refusals left the stored document unchanged.

## Verification and preservation

Seven contract cases/10,999 assertions and301 renderer cases/5,231 assertions pass. Three browser cases cover all four packs, desktop/mobile notes/portraits/links, actual-width masonry and wall attribution. Admin/Website/demo types, Website client/SSR build, canonical/generated/kit freshness and focused lint pass. Sixteen thumbnails were refreshed; all548 entries validate. The new browser test initially lacked HTMLImageElement narrowing; that type error is fixed and the final demo typecheck passes.

Existing shared layout, visibility, protection, recovery and canonical consumer evidence is reused. This batch introduces no continuous animation and makes no new hardware-performance claim.

Strict backend deployment preserved the previous1601-file snapshot and22 installed Community Events source files. All six plugin-table exports are unchanged. Native withdrawal returned public404, and original-editor recovery restored the page's initial content/mode. Only the owned page/revisions and uploaded portrait were deleted. All42 pre-existing pages, appearance values and11 original media records are unchanged. Native/API sessions signed out; the owned Electron process274, profile, public browser, preview4322 and SSH14860/14861 were closed. Existing user application processes were preserved.

MagicTables updates only the four existing block rows, preserving prior Notes and comparing all137 rows after a dry run. Artifacts are in `output/social-family-20260921`, including source/deployment manifests, contract/browser/build logs, native document versions, public checks, media/plugin comparisons, cleanup and tracking readback.

## Next requirement gap

Trust badges remains In progress: its open icon-name field permits values that the renderer rejects. Repair must constrain new authoring while allowing historical values to be opened and corrected. It is not counted among these four accepted blocks.
