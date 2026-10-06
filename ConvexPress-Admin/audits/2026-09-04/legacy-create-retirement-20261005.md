# Generic legacy creation retired — October 5, 2026

Removed the unused public `posts/mutations:create` and `pages/mutations:create` endpoints and their legacy input validators. Current native routes and HTTP creation already use canonical transactions. Repository-wide current-source searches found no application callers; migrated route tests and updated the site-authoring workflow and historical expert guides. Canonical creation, Save, settings and publication remain the supported authoring contracts.

The route-test migration reproduced an HTTP reserved-route bug: an existing legacy `/products` row caused a requested `/products` page to be silently renamed. Creation now validates the requested path before accepting a uniqueness suffix. Existing reserved-route, hierarchy, descendant, deletion and taxonomy assertions remain; the tests create through the canonical HTTP internal boundary.

## Scope and validation

Working/source168 tests1666 assertions pass, including13 route/lifecycle tests. Target initially failed five cases: four source depth corrections were absent; permanent page deletion omitted its topic-relationship cascade; category deletion attempted to reassign orphan documents and created unnecessary default categories. Reviewed exact source/target diffs and backported only these established source fixes. Final target138 tests1168 assertions pass. These are focused suites, not whole-repository health claims.

Backend/Admin types, generated site contracts and writer checks pass. Deployed function inventories prove exactly two removals per site and zero added or changed signatures: source2413→2411, target2378→2376. Storage-inclusive private exports preceded deployment. Source1630/target1624 source hashes preserved;108/86 installed extension files including tests exact. Canonical and renderer catalogs, all packs and unrelated snapshot files remain intact.

Latest deployment bases are `output/legacy-create-retirement-20261005/{source,target}-source-installed.json`, each derived from its own preceding HTTP installed snapshot. Consumer rebuilds use acknowledged journals, source243operations/238documents and target68/63, with no authored-content writes.

Live acceptance calls the same canonical creation/query and page lifecycle mutations used by current native workflows: post plus root/branch/leaf pages, revision1 canonical reads, nested reparenting and descendant paths, moving back to root, drag-reorder mutation and deletion reparenting. No frontend code changed; prior native Save/reload/actual Website evidence from the HTTP batch remains applicable. This batch does not claim new browser interaction.

Live results and cleanup are recorded in `output/legacy-create-retirement-20261005/{source,target}-lifecycle.json`, with preservation and final-index receipts beside them. Eight owned documents/history are removed; other private drafts unchanged. Original source116documents/434revisions and target29/88, appearance and mail values match their baselines exactly. Owned API sessions are revoked after checks; both consumer and media indexes are ready. No user runtime is launched or stopped and no push is made.

## Remaining scope

E07 stays open: WordPress phase `postsCreate`/`pagesCreate` still write raw imported HTML; their callers are the corresponding phase actions. Demo `seedMarketingSite` still writes old page/post shapes and invokes `clearExistingContent`; root current-source search found no caller for this internal seed, so inspect preserved installed wrapper functions before deciding its retirement. Do not run this seed against retained content. Deliberate historical import and archived source recovery remain supported. Remaining stored-schema consumers, Tasks3–8 and20 unfinished blocks still require their own acceptance.
