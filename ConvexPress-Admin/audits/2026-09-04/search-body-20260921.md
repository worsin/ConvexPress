# September 21 canonical editorial body search

Canonical paragraph and other declared editorial text can now be found through public search and the Search Results block. This is an implemented and live-tested increment, not complete coverage of all137 block types or closure of B07. The original audit remains five accepted and nineteen open.

## Implementation

Canonical specs now support explicit `searchText` paths terminating at plain editorial text or richtext. Compilation rejects unknown paths, duplicate paths, reference/media/link fields, structural containers, formatted IDs and DOM IDs. Richtext extraction preserves adjacent marked word runs and paragraph/break boundaries without harvesting link destinations or markup. The explicit prose format follows the SDK inline parser, removing only rendered bold/emphasis syntax and link destinations while preserving unsupported/literal syntax. Nested object/repeater paths are supported. The new block scaffold declares its heading/body paths, and generated portable/deployed mirrors share the implementation.

51 existing specs have reviewed declarations:42 text-bearing block types and9 structural blocks. Their stored field contracts, versions, defaults, examples and renderer sources are unchanged; the complete before/after JSON comparison is recorded in declaration-inventory.json. Other specs remain opt-in and contribute no text. No new block types were created.

Incremental and explicit reindexing use the canonical body instead of the cleared legacy fallback. The index is an internal candidate corpus, including restricted editorial text so entitled visitors can find it. It is never a public authority or response payload. Current search reads first authorize the page and then project its blocks under current membership, ancestor, enabled-plugin/block, template-hiding and supported-treatment rules. A hidden ancestor removes its subtree. Restricted text is removed before matching/snippets, even if the old candidate row remains. No dynamic resolver executes during extraction, so nested Search Results cannot recursively call search.

Custom-composition subtrees currently contribute no text. They require an approved-definition/composition projection rather than guessing from their attrs. Published reusable sources can supply candidate text and reuse the existing occurrence authorization path, but complete search acceptance and publication-driven consumer reindex remain open. Signed-in/out block flags are currently refused by the canonical validator; this batch preserves that restriction and tests invalid persisted flags fail closed. It does not activate a visibility feature.

## Evidence

- Full backend suite:3453 passed,0 failed,23840 assertions across334 files. Six new registered-handler/current-source cases exercise body-only lookup, stale removed terms, nested ancestor rules, authenticated access, revocation, disabled blocks, protected pages, malformed visibility and read limits.
- Root block/SDK suite:140 passed,0 failed,17491 assertions across43 files. Five new contract/extraction cases cover declared paths, richtext runs, nested repeaters and exclusion of private settings/URLs. The scaffold suite was rerun after its declaration change.
- Explicit Convex TypeScript, strict isolated deployment, media-writer preflight, generated-contract freshness, block/kit checks and548-thumbnail integrity pass. Focused lint has zero errors and two compatibility warnings recommending Object.hasOwn, which this Convex TypeScript target does not expose. No repository-wide lint or all-device performance claim.
- The same owned published page at staging4860 returned zero matches for its visible unique paragraph word before deployment. Normal authorized reindex after deployment returned one result through both ordinary search and the actual Search Results block. Autocomplete remains title-only.
- A normal canonical save changed the word and automatically indexed its replacement through existing listeners. The old word stopped matching immediately. A private/public transition removed/restored access, and restoring the original body made its word searchable again.
- Actual Website1440px/390px checks show the body snippet and correct link, successful result navigation and empty-query-result state, no horizontal overflow and no captured page errors. The settled mobile screenshot was inspected. An initial capture caught the entrance animation; the replacement waits for full opacity. This is public Website acceptance, not a new native-editor signoff.

Initial harness errors are retained: a pricing fixture used the wrong link storage shape, a group fixture used the wrong version and unsupported visibility, and the first live settings call omitted required layout fields. The rejected live request performed zero database reads/writes; its state was inspected before a corrected continuation. These are not claimed as product defects. The first snapshot verification also detected the prior deployment's regenerated api.d.ts; all executable source matched, and that generated-only drift was recorded before cloning.

Deployed source checkpoint: `ConvexPress-Admin/output/production-checkpoints/search-body-r2-20260921`;1413 recorded source files preserving the prior generated SDK plugin graph. Storage-inclusive pre-deploy backup is private. No production/cloud deployment occurred.

## Prose follow-up before integration

Review found that the first extractor indexed hidden Markdown destinations in fields rendered by the SDK Prose adapter. A failing-before contract regression now passes with explicit prose declarations; richtext and literal strings retain their separate semantics. A second owned live page reproduced a hidden-URL match before the repair. After the r2 strict deployment, ordinary search and the Search Results block both reject that term while finding the visible label. A read-only query confirms the exact stale candidate still contains the hidden URL; no reindex manufactured the passing result. The actual390px Website also passed visible-label and hidden-destination search checks. Evidence is under `output/search-body-prose-20260921/`. The final full block run passes140 cases and the14 focused backend search cases pass; the full3453 backend run preceded this pure extraction follow-up.

## Preservation and remaining work

Trashed both owned test pages and signed out both API sessions. Verified all42 original pages,2 posts,4 media records, template/identity snapshot and all155 listeners unchanged. No media attachment restoration was needed. Owned browser/Website closed; original processes retained. MagicTables: Notes-only updates for core/search-results, zero creates, all137 rows compared before/after, completion flags unchanged.

Remaining: remaining block declarations and conditional/dynamic authored-copy policies; approved custom-composition text; full reusable occurrence/search-refresh acceptance; existing-site backfill rollout; larger shared-read-budget search acceptance; broader original content/revision, block/template and production requirements. Search bodies are not yet fully complete across the library.

Evidence: `output/search-body-20260921/` contains declaration-inventory.json, blocks-tests.log, backend-tests.log, backend-types.log, scaffold-tests.log, lint.log, deployment source/receipt/backup metadata, live-before.json, live-after.json, live-summary.json, browser-summary.json, mobile-settled.png, cleanup.json, process-cleanup.json and MagicTables dry-run/readback receipts.
