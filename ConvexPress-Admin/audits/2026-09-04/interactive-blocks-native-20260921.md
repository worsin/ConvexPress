# September 21 matrix editor repair and six-block authored page

## Result

Column moves previously reordered only the headings, silently leaving row values under the wrong heading. Three real form regressions failed before the repair, and an unsaved Electron comparison table independently reproduced the incorrect association. Regular Table, Comparison Table and Pricing Table now apply column add/remove/move to their row values in one immutable editor update. Comparison row labels stay in the first column. Added rows contain one editable cell per current data column; malformed existing rows are preserved and must be corrected before column changes. The implementation reads generated matrix constraints rather than branching on block names. No saved contract, schema, version, backend deployment or content migration changed.

## Evidence

- Three actual form regressions failed before and passed after. The isolated form harness now has 11 cases / 2,830 assertions, including the existing 285-example round trip. Focused outer editor suite: 12 tests / 69 assertions. Full Admin frontend: 480 passed, zero failed across 89 files.
- Admin TypeScript and production build passed. Build retains its chunk-size warning. Canonical checks/freshness and eight-kit freshness passed. New matrix source and affected test lint passes. Full SchemaBlockForm lint retains seven existing diagnostics (implicit content variable type, three hook dependencies, three array index keys); each affected expression predates this patch. No broad lint-clean claim.
- Real owned Electron created `BlockDemo — Workshop guide` on isolated staging 4860, instance `promotion-source-20260911`. Its six blocks are Comparison Table, Table, Pricing Table, Accordion, Tabs and FAQ. Native editing exercised table associations, comparison column add/remove/undo, new rows, nested accordion reorder, and invalid tab label save prevention. Unsaved preview left revision 1 with zero persisted blocks. Native save/reopen and reviewed publication produced revision 4 with exactly the expected authored values.
- Native activation of Core, Journal, Depot and Aster House succeeded. The actual Website preview inside Electron rendered the guide after switching. Public production Website checks at 1440 and 390 pixels under all four packs verified table headings/cells, accordion default-open and Enter/Space, tab ArrowRight/End focus and displayed panel, FAQ opening and no document overflow. Core mobile comparison scrolling also passed keyboard ArrowRight. Horizontal table scrolling is intentional.
- Selected final screenshots inspected: Journal desktop comparison and mobile FAQ; Depot mobile comparison and desktop pricing; Aster House desktop accordion, mobile table/tabs and native mobile preview; Core mobile tabs. These establish this authored specimen, not an all-example aesthetic or animation certification.
- A premature Depot keyboard attempt occurred before client mounting; the action passed once mounted. The final browser helper waits for page network idle before interaction. Early Core/Journal captures showed pre-mount or unstyled content; final settled runs replaced them. This does not establish a slow-network startup performance budget. An initial preview assertion expected a public surface marker absent from the embedded preview; corrected to its actual visible content, without claiming marker evidence.

## Tracking and preservation

Exactly six existing Blocks Notes fields updated in the standalone MagicTables base. Dry run showed six updates and zero creates; all 137 records were compared after the write and every other cell/flag stayed unchanged.

Core restored through Electron; exact original template values and environment identity match the baseline. Owned page trashed, and all original 42 pages, two posts, four images, plugin settings and 155 listeners compare unchanged. The fixture API session was logged out. Native cleanup initially used the visible Sign out text instead of its explicit accessible label and closed the first owned process before logout. Reopened the same isolated profile, used `Sign out of ConvexPress control plane`, observed the operator login form, then closed it. Owned public browser and 4322 preview stopped. Original Electron, renderer, BlockDemo and SSH tunnel preserved.

Artifacts: `output/interactive-blocks-native-20260921/` includes before/after regression logs, expected content, native publication and exact backend readbacks, template activation journal, final browser checks/screenshots, cleanup receipt, native sign-out proof and MagicTables dry-run/readback.

## Remaining scope

The preceding user progress-report turn changed no product state. This continuation completes the matrix repair and this six-block/four-pack authored workflow. It does not finish all 137 blocks, all template surfaces, hardware motion profiling, live data/payment behavior or the original production goal. Five original audit rows remain accepted and nineteen open. Next block work should close the remaining authored/live-data and visual gaps in the inventory, without repeating this accepted specimen or substituting render counts for completion.
