# September 21 current-source search matching

Fixed an information-disclosure path in ordinary public search, autocomplete and the canonical Search Results block. This is a security prerequisite for canonical body indexing, not completion of body indexing or B07. The original audit remains five accepted and nineteen open.

## Defect and repair

The search index selected candidate identities; the response replaced cached text with current public text but never checked whether that text still matched the query. A stale index could therefore disclose a current page's association with removed words or words absent from its public projection, even when those words were absent from the response snippet.

All three visitor surfaces now require the current public source to match. Ordinary search and the block check current title/body; autocomplete checks title alone. Private cache metadata and non-indexed excerpts do not establish a match. The shared matcher uses lowercase alphanumeric terms, an OR match and a prefix on the last query term, consistent with the documented [Convex search behavior](https://docs.convex.dev/search/text-search) and [search API](https://docs.convex.dev/api/interfaces/server.SearchFilterBuilder). The existing current-source access rules still run first. Index ranking/candidate discovery is unchanged.

Three new production-handler regressions failed before repair and pass after it: removed title/body associations, canonical hidden legacy-body associations, and filling Search Results pages after stale candidates are excluded. A fourth test covers Unicode/case/punctuation, whole terms, final-term prefix, empty queries and overlength terms. The event-search test now correctly rejects an old query after the event's matching text is removed, then proves its new term works after ordinary indexing.

## Live proof

Created one owned canonical page in Promotion Lab staging4860. The first attempted fixture did not reproduce staleness: canonical conversion correctly clears its legacy content and the listener built a fresh index. That assertion failure is not product evidence and the fixture was not recreated.

A temporary internal function, restricted in source to that exact owned page ID/title/version/status, then placed a synthetic stale marker into that page's existing search-index title/body. It changed no content, policies, listeners or other index rows. On the preceding deployed application code, anonymous search and suggestions returned one association; the actual Search Results block did too. The Website browser reproduced the incorrect result.

Deployed the repair with the temporary function removed. Against the same unchanged stale row, all three surfaces returned zero associations. Current-title prefix search still returned the page. Actual Website desktop1440px and mobile390px checks passed; the mobile screenshot was inspected, with no horizontal overflow. A read-only CLI query confirmed the stale marker still existed in the cache, so reindexing did not manufacture the passing result. Deployed function-spec inspection confirmed the temporary fixture function was absent.

Final immutable staging source: `ConvexPress-Admin/output/production-checkpoints/search-source-final-20260921`, preserving the generated SDK plugin graph from the revision-events-r2 checkpoint. Across1402 source records, only canonicalDocuments/search.ts, search/queries.ts and the new search/currentMatch.ts differ from r2. Strict deploy/typecheck and media-writer preflight pass. Storage-inclusive backups are private. No cloud or production deployment occurred.

## Verification and cleanup

Full backend suite:3447 passed,0 failed,23820 assertions across333 files. The named Convex TypeScript project passes. An initial unqualified typecheck selected the parent workspace config and exhausted its default4GiB heap; it is superseded by the explicit Convex-project run with8GiB. New-file lint and whitespace checks pass; no claim of clean repository-wide lint is made.

Cleanup trashed the owned page, verified42 original pages and2 posts, exact template/identity and4 media records, and all155 existing listeners. No media attachments changed. The owned API session signed out, owned browser/server closed and original processes39198/69634/8172/68390 remain. MagicTables Standalone Roadmap: one Notes-only update for core/search-results, zero creates, all137 rows compared before/after; completion flags unchanged.

Evidence: `output/search-source-match-20260921/` contains before/after regression logs, full backend/type logs, deployment manifests/receipts, `live-before.json`, `live-after.json`, `stale-index-after.json`, `probe-removal.json`, browser screenshots/acceptance, cleanup and MagicTables readback receipts.

Next: add explicit visitor-visible authored-text projection for canonical bodies, including signed-in/out visibility, block membership, disabled plugins/blocks, composed definitions and synced occurrences. Share projection between indexing and current-source reads without resolving nested search blocks recursively. Raw JSON/string-field harvesting is not acceptable. Canonical body search remains absent; this security fix must not be used to claim it is implemented.
