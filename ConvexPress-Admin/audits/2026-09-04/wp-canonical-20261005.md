# WordPress canonical import acceptance — October 5, 2026

Task 4/E07 now routes WordPress posts and pages through canonical document creation/update instead of writing raw HTML to the active body. Both isolated installed sites passed import, native editing, actual Website preview and exact cleanup. The full editor/template goal remains active and incomplete: 117 Verified / 20 In progress is unchanged.

## Change and acceptance boundary

The existing internal phase writers resolve current job-owner authority, current job/site/phase, import settings and mapping identity inside the document transaction. Updates compare revision and timestamp and preserve local edits. Canonical content, history, publication, metadata, taxonomy relationships and the accepted mapping receipt succeed together. Failed conversion cannot advance the source hash. Metadata-only changes enter the source hash; each accepted source document and metadata payload has a retained archive, separate from the latest source view.

Supported WordPress lifecycle states are draft, publish, future and private. Pending, auto-draft and trash require explicit review; unsupported HTML/Elementor-only content is refused without flattening or silently publishing it. Imported owners must have current local site authority; a management identity is not fabricated into native author authority. Pages fetch page metadata and propagate fetch failures. A job with failed records ends failed and does not advance the site's successful-sync timestamp.

Tests exercise actual phase batch actions with mocked WordPress HTTP responses, including metadata changes, retry and transactional refusal. Live acceptance exercised the installed writers using owned synthetic connections and jobs; no external WordPress server was contacted. This is not acceptance of arbitrary Elementor layouts or every WordPress plugin.

## Deployed and native evidence

Evidence directory: `output/wp-canonical-20261005/`.

- Final focused working suite: 178 tests, 1,669 assertions, no failures (`final-tests.txt`). Original import suites passed source 176 / target 146; the subsequent page-cleanup suite passes 15 tests / 64 assertions in each preserved snapshot. Backend types, deployment typechecks and all four Admin typecheck tasks pass. Generated contracts verify 2,301 functions / 3,072 DTOs with 377 unchanged unknown boundaries; 39 compiler fixtures pass for each consumer.
- Two installed imported posts and two imported child pages accepted canonical revision 1, import update revision 2, native Electron title/body Save and reload at revision 3. Two parent pages verified nested routing. Failed unsupported imports left rows and accepted mapping hashes exact. See `source-import.json`, `target-import.json`, `roundtrip.json`.
- Actual Website preview at 388px showed the native-edited body with retained bold text and link, no horizontal overflow. Four screenshots and native feature-error captures are in that directory. An initial broker-exchange bootstrap error was recovered before feature verification; it is not presented as a zero-error entire bootstrap.
- Earlier sign-out attempts used visible text instead of the control's accessible aria-label. Correct accessible-name selection signed out normally (`native-signout.json`); these locator timeouts do not establish a product pointer bug.
- Both consumer and media indexes are ready (`final-indexes.json`).

## Cleanup failure and bounded repair

Source cleanup revealed that permanent page deletion left nine imported metadata rows, while post deletion cascaded correctly. The page cascade now deletes only that page's metadata through the attachment guard, within a 1,000-row atomic bound. Larger cascades refuse. An internal repair accepts only an already deleted document ID and removes at most 100 orphan metadata rows per call; it refuses live documents and is repeatable. Tests cover own-row deletion, unrelated-row preservation, live-row refusal and the 100+1 boundary.

The repair removed only the nine rows belonging to the two already-deleted source fixture pages. Target cleanup then used normal permanent page deletion, proving the fixed cascade live. All six owned documents, histories, private drafts, connections, jobs and mappings are removed. Original WordPress tables and metadata match their baselines exactly. Temporary encryption keys were removed, restoring original absence. API refresh sessions were revoked; native sign-out, owned process termination and profile removal completed. User processes were preserved.

`fixture-cleanup.json`, `preservation.json`, `temporary-key-remove.json`, `api-cleanup.json`, `runtime-cleanup.json` record the result. Original source 116 documents / 434 revisions and target 29 / 88, appearance and email queue/templates are exact; no Git push.

## Next deployment bases and remaining work

Use **`output/wp-canonical-cleanup-20261005/{source,target}-source-installed.json`** as the next deployment bases. These follow the initial WordPress deployment manifests and preserve each site's extension/catalog/template files: 108 source / 86 target extension files exact. Initial import deployment changed exactly the two existing import-writer signatures; cleanup added exactly `pages/internals:deleteOrphanedMetadata`. Final inventories are 2,412 source / 2,377 target functions. Private storage-inclusive backups precede each deployment.

E07 stays open for remaining legacy seed and stored-schema consumers. The next caller pass found `packages/backend/scripts/seed-demo-site.mjs` invokes the old destructive `seedMarketingSite`; the earlier app/desktop-only caller search missed this CLI. Preserve the separate shop/media workflow, inspect installed wrappers and retire the old content seed deliberately without running it. Four default authored template websites remain governed by Tasks 5–6; this seed is not their acceptance.
