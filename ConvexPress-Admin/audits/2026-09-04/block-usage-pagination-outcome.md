# Bounded block usage and document counts

The Blocks management page now consumes `blocks/queries:usageDocuments`, a single reactive paginated stream. Each response projects document identity/title/status and a sorted unique block-name list; it never returns authored attributes or body prose. Nested repeated instances count once per document. Cards and the detail drawer derive their totals from the same current loaded pages, deduplicate document IDs and replace changed contributions rather than accumulating old counts.

The query requires `manage_options` on every page. Page size must be an integer from 1 to 25. Server-owned read limits cap each request at 25 rows and 2MiB regardless of caller-provided budgets; the existing creation index supplies ordering. Attachments are omitted after the bounded read, so an empty projected page can still have a continuation cursor. All Convex pagination split metadata survives projection and has an explicit return validator. Corrupt/over-budget legacy block trees fail explicitly instead of producing incomplete counts.

UI states distinguish first load, partial zero, partial positive, loading more and exhausted/complete totals. Manual **Load more documents** is available above the cards and inside the drawer. The drawer says matching loaded documents rather than implying complete recent results. Partial usage also stays explicit in the existing disable confirmation. The drawer body scrolls for long loaded lists.

Compatibility: public `usageSummary({})` and `usageByBlockName({name,limit?})` remain exported with their prior successful response shapes. They read one bounded page and return an exact result only if the table is exhausted. Otherwise they raise `PAGINATION_REQUIRED`, directing callers to the new endpoint. Their counts now mean distinct documents, matching the UI terminology. This deliberate compatibility boundary prevents an old caller receiving a deceptively capped total. The only current application callsite has migrated to the new typed query. No writer-maintained aggregate or backfill was added.

The protected `getForDocument` and `getEditableDocumentForAi` handlers and return validators are unchanged. No other block mutation was edited. Offline backend API and both terminal consumer declaration files were regenerated from source.

Validation: 12 actual-handler/helper tests passed with 140 assertions, including 63 documents across four pages, nested repeats, no unbounded post reads, page-size/RBAC refusal before reading posts, legacy export refusal on large datasets, exact legacy small-site counts, empty projected continuation pages, split metadata, malformed tree refusal, reactive duplicate/replacement merging and partial/loading copy. Root's six existing content-access tests remain green. Backend and full Admin TypeScript checks passed. No deployment, browser/native or provider action was performed.

## Root native modal repair

Actual Electron checks reproduced that opening the old custom drawer left focus on View usage, Tab moved to the covered Disable control, and Escape did not close the drawer. Replacing the custom overlay with the existing Base UI Dialog supplies modal focus handling and Escape dismissal. The title receives initial focus, the selected View usage button is captured as the explicit return target, and the existing right-side full-height presentation remains. No new motion framework or bespoke focus trap was added.

The repaired native drawer passed twelve forward/reverse Tab transitions with settled focus inside, Escape dismissal and return to the same View usage button, and Close-button return focus. Base UI briefly uses a focus sentinel during wrapping; acceptance awaits the settled focus state, rather than misclassifying that internal sentinel as a background control. No captured page errors; full Admin TypeScript passes. Evidence: `output/aster-house/block-usage-focus-red.json`, `block-usage-focus-acceptance.json`, and `block-usage-accessible-dialog.png`.


Root deployment and actual native acceptance: both Aster cloud backends were updated, then Blocks showed a complete scan of eight content documents and three Field Guide matches without errors. Evidence: output/aster-house/block-usage-acceptance.json and block-usage-native.png. This live eight-document acceptance is separate from the local 63-document pagination regression.
