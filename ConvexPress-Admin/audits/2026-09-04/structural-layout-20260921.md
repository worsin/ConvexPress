# Structural layout repair — September 21

Fixed shared layout behavior affecting Section, Group, Columns, Grid, Split and Sticky Aside. **Full block acceptance remains 30/137 verified, 107 pending; original audit eight accepted/sixteen open.** This checkpoint repairs the shared rendering foundation; native nested insertion/reordering, save/reopen, publication and recovery for this six-block family remain the next acceptance task.

## Reproduced problems and repairs

At a 1440px viewport with a 420px authored placement, Grid retained three approximately 81px tracks; Columns and Split retained two approximately 142px tracks; Sticky Aside retained a roughly 95px sidebar with sticky positioning. The generic breakpoints used viewport width rather than the layout's available content width. Four failing browser cases and a separate live measurement captured the defects before repair. The failing run was deliberately interrupted after these failures; its fifth Section case did not execute. Teardown also reported 30-second timeouts. The Section defect has independent before measurements: its child was 228px wide inside an available 324px area because it applied another 96px of gutters.

Grid and Split now own a named inline-size query wrapper; Columns inherits Grid's responsive behavior. Medium/large column counts and Split ratios/reverse placement use that wrapper's width. The wrapper has an explicit width so flex parents do not shrink it to the contained child's intrinsic width. Grid children and their order are unchanged.

Sticky Aside owns an independent width container. Its two-column sticky treatment requires both sufficient content width and the existing minimum viewport height. Narrow placements and short viewports stay in normal document flow. Its accessible aside and scroll limits remain intact.

The canonical renderer already provides each Section's page gutter. The Library Section no longer nests a second Container; Journal and Depot preserve their owned Stack gaps without adding another page gutter. Saved content, canonical versions, primitive props and data contracts are unchanged.

The extra Grid/Split wrapper required updating direct-child selectors in Journal/Depot owned story/form treatments and the shared latest-posts, post-grid and featured-products renderers. Their existing named treatments and responsive thresholds are preserved. No backend code, deployed data or provider configuration changed.

## Verification

- Eight initial browser cases passed: four structural width cases across all four packs at 420/900/1280 authored widths, Section gutter parity, all 32 starter patterns at both 1440/390, and Depot embedded form layout.
- Thirteen consumer browser cases passed: composed pages at desktop/mobile, invalid links and rapid pack switching, Journal/Depot latest-post states, Post Grid pagination/history/reduced motion, product layouts, availability/cart failures, source modes and carousel recovery.
- One additional four-pack case verifies that Sticky Aside stays static, single-column and without a maximum-height constraint in a 480px-tall viewport.
- All 297 renderer cases (5,143 assertions), Website and demo types, Website production build, canonical contracts/freshness, all 77 kit files, focused Oxlint and whitespace checks pass.

Reviewed the corrected Core narrow Grid, Depot wide Grid and Journal stacked Sticky Aside screenshots. These structural specimens use the existing composition headings. The larger pattern/composed-page cases retain their real sample content and actions. This is not a new full-library visual or hardware motion signoff. Existing full Website lint debt remains separate.

Artifacts: `output/structural-layout-20260921/` includes the QA plan, before measurements/failures, final browser captures/logs, renderer/type/build checks and MagicTables before/plan/dry-run/apply/readback. Six existing block Notes cells receive this scoped evidence; Status/Tests/Screenshots stay unchanged. Complete 137-row comparison guards against unrelated tracker changes.

No site fixture or authenticated session was created for this checkpoint. Only the owned browser was closed. Existing Electron, renderer, BlockDemo and SOCKS processes were preserved. Next: complete the six blocks' native nested authoring and recovery using an owned staging page, then update acceptance only for blocks whose remaining cases pass.
