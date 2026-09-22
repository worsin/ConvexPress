# Six structural blocks — native acceptance, September 21

Section, Group, Columns, Grid, Split and Sticky Aside pass acceptance for their current canonical contracts. **36/137 blocks verified; 101 pending.** The original production audit remains eight accepted/sixteen open. This completes the native follow-up to [the shared layout repair](structural-layout-20260921.md), not whole-template or production release acceptance.

## Native authoring and exact recovery

An owned Electron process connected to the isolated control plane and Promotion Lab staging database. The disposable page `structural-native-20260921` was initialized through the native block editor. All content was then authored through its real controls: 17 blocks, including Section → Group → Heading/Paragraph, two Columns children, three Grid children, two Split children, and a long main story plus supporting note in Sticky Aside. Five outer layouts used full width/compact spacing; all six containers had distinct anchors.

After Save and actual Electron reload, each container's anchor/width/spacing was read back. Native Move up then Save reordered children in all five multi-child containers. The stored tree matched the exact expected sibling swaps; every other field and branch was unchanged. The native revision review restored the complete earlier tree, which was compared against the saved snapshot before publication. A temporary nested child was added, removed, restored with Undo and removed with Redo; the editor returned to its saved state with Save disabled.

Published through the native review/confirmation controls. The built Website rendered all 17 blocks and their restored order. The default reading area measured 896px; the native Full width page setting produced a 1008px inner area. Native preview showed the same authored layout with appropriate stacking in its narrower panel.

## Additional defect found and fixed

Sticky Aside's new 64rem content threshold exceeded the template's 1008px full-width area, leaving the sidebar static even on a 1440px screen. The before receipt records one column and static positioning; the new 1104px outer-width browser case also failed. The threshold is now 56rem, retaining usable main/sidebar widths, narrow-placement stacking and the existing minimum viewport-height guard.

All six current structural browser cases pass across four packs, now including 420/900/1104/1280 authored widths and short viewports. On the rebuilt published Website, real wheel scrolling pinned the note at 89px, below the measured 65px site header plus its 24px gap; a second scroll retained that position while the main story moved. At 390px all five grids/splits used one 286px column without horizontal overflow. At 1440×480 the aside returned to static flow without a maximum-height constraint. Settled native outline/preview, desktop sticky and mobile screenshots were reviewed.

The Website build and focused lint pass. Prior unchanged renderer/type/contract/kit, 32-pattern and post/product/form consumer evidence from the preceding commit is reused; the code change here is the sticky CSS threshold. No new backend deployment, persistent schema change, continuous-animation claim or provider operation is involved.

## Preservation and evidence

Withdrew publication and observed actual HTTP404. Native original-editor recovery restored the original content, block payload, content mode and title. Signed out through the native menu, permanently removed only the owned page and its revisions, and logged out the owned API session. Exact comparisons prove all 42 prior pages and appearance identity/values unchanged. No media was created or changed. Owned browser/Electron/profile/preview/tunnel were removed; the original four application processes remain running.

The first publication attempt followed revision restore before its refreshed state had settled; the authoritative read still showed Draft with the correct restored tree. Reviewed publication after that state settled succeeded. Rebuilding the owned preview's files invalidated its cached asset manifest; the observed missing-module error was resolved by restarting that owned preview against the completed build. Initial sticky measurements preceded header-offset settlement; final scroll assertions and screenshots use the measured current offset. These harness transitions are disclosed rather than counted as successful checks or separate product repairs.

Artifacts: `output/structural-native-20260921/` contains native readback, before/reordered/published documents (without private display leases), exact tree comparisons, removal/Undo/Redo, failing/final browser logs, scrolling/layout receipts, reviewed screenshots, withdrawal and cleanup. Six existing MagicTables rows advance to Verified after a matching dry run and full 137-row comparison. No unrelated cell changes are permitted. Remaining: 101 blocks' full acceptance and all open production/template/SDK requirements.
