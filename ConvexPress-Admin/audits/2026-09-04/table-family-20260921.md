# Tables and footnotes — September 21

**40/137 blocks verified; 97 pending.** Table, Comparison Table, Pricing Table and Footnotes pass their canonical authoring/rendering acceptance. Original production audit: eight accepted, sixteen open. This does not close commerce transactions, whole-template design review or release readiness.

## Repairs against the actual requirements

The original inventory describes Pricing Table as a dense comparison with toggles. Its previous renderer deliberately omitted toggles, so the existing static-table tests did not satisfy that requirement. Added optional authored price periods: two labels and an alternate price on each plan. Native radio controls provide keyboard selection and independent groups for multiple instances. Selecting a period changes display copy; it does not calculate prices, discounts or payment authority. Missing alternate prices explicitly remain unspecified. Existing v1 documents retain their attrs and static treatment: the new fields are optional, no version conversion or stored-data rewrite occurs. Plan movement carries both prices and associated comparison cells together.

Actual built-Website review found short period labels wrapping and the Website reset removing footnote numbering. Corrected the control sizing and explicitly retained decimal note markers. Mobile review also found sticky first columns consuming most of the visible table area (165.5px of a 228px pricing viewport). Pricing/comparison first columns now scroll normally in narrow containers and remain sticky above 30rem. An initial container-query repair collapsed the comparison region under its flex parent; the final explicit width fixes it, and the browser regression asserts usable width as well as scroll behavior.

## Native and public acceptance

An owned Electron session authored five blocks on the isolated Promotion Lab staging database: two-plan Pricing Table, linked Paragraph, two Footnotes, Table, and Comparison Table. Both price periods, a comparison row, note bodies/links and table headers/cells were entered through the generated native controls. Duplicate footnote keys disabled Save with a field error; correcting the key restored authoring. Save/reload retained the fields. Moving the second plan first and saving produced exactly the expected plan/cell swaps without other tree changes. Native revision restore returned the entire five-block tree to revision 4's content; final publication used that restored tree.

The built Website showed the saved table headers, rows, prices and note text. Real keyboard price switching displayed the authored alternate values. Reference-link navigation targeted the exact note below the fixed header; Tab proceeded to its authored return link. At 390px, real horizontal wheel input scrolled pricing, comparison and data tables without page overflow, with their header scopes intact. At 1440px, pricing/comparison headers remained sticky. Final desktop/mobile and native screenshots were inspected, plus Journal desktop and Aster mobile views. Period selection has no continuous animation; no hardware animation-performance claim is made.

Previous native matrix add/remove/reorder, unsaved preview and four-pack publication evidence in [interactive-blocks-native-20260921.md](interactive-blocks-native-20260921.md) is reused for unchanged table behaviors. Current gallery checks and new price-period, numbering and narrow-container tests cover all four installed packs.

## Verification and preservation

- Contract regression failed before the new fields; final seven contract cases pass, including unchanged old attrs and rejected malformed periods.
- 298 renderer cases / 5,152 assertions; seven matrix-editor cases / 31 assertions; six final browser cases pass. Counts cover different boundaries and are not an overall readiness percentage.
- Admin, Website and demo types; Website production build; canonical checks/freshness; 77-file kit freshness; focused lint and whitespace checks pass. Twelve thumbnails refreshed; all 548 validate.
- Strict deployment to source4860 preserved the installed Community Events extension: 1,601-file snapshot, all 22 plugin files retained, all six plugin tables unchanged after export comparison. No controller, live-target or provider deployment was performed.
- Native withdrawal produced public HTTP404. Original-editor recovery restored the original title/content/blocks/mode. Only the owned page and its revisions were permanently removed. All 42 prior pages and appearance values remain unchanged. Owned native/API sessions signed out; owned profile/browser/preview/tunnel removed; original application processes preserved.

Artifacts: `output/table-family-20260921/` contains source/deployment manifests, failure and final tests, saved/reordered/restored/published documents (without private display leases), native/public screenshots, exact comparisons and cleanup. One REPL timeout lost its handle; the still-running owned Electron process was reattached, not restarted. Initial browser harness failures were corrected for explicit required-field activation and preview remounts; only final passing runs support acceptance.

Four existing MagicTables block rows advance to Verified after dry run and complete 137-row comparison. Remaining work is the other 97 blocks and the original open production/template/SDK requirements.
