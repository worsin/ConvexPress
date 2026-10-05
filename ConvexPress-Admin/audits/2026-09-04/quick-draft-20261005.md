# Canonical Quick Draft — 2026-10-05

## Delivered behavior

The live Dashboard Quick Draft widget now creates canonical revision 1 through the existing canonical creation transaction. It preserves create authority, the 200-character title limit, empty-body drafts, and the dashboard/post creation event pair. Shared unique-slug handling replaces the former collision-prone slug construction. Canonical validation and installed presentation resolution fail atomically; the endpoint cannot leave a partial legacy post behind.

Plain textarea content becomes a canonical Paragraph. HTML and Markdown characters stay literal. Single and blank-line breaks become explicit rich-text hardBreak nodes. The signed-in author's bounded recent-draft list reads current paragraph prose without restoring a legacy body field or following references/dynamic data. Explicit excerpts and retained legacy records keep their existing fallback behavior.

## Verification and correction

- Regression tests first reproduced legacy body creation and creation without installed presentation. A subsequent excerpt assertion reproduced the widget's dependency on the legacy body field.
- Source/working focused document, authoring-fence and consumer-index suites: **145 tests, 1,524 assertions passed**. Independently preserved target: **115 tests, 1,026 assertions passed**.
- Explicit backend and Admin types passed; both final deployments passed backend type/schema checks. Generated API contracts stayed unchanged: 2,302 functions, 3,067 DTOs and 374 existing unknown boundaries. Media writer checks passed.
- The target lacks the source site's newer search module. That attempted excerpt dependency failed in target tests before deployment. The final bounded paragraph reader requires no search backport.
- The initial source Electron run exposed collapsed textarea newlines in the actual Website. That provisional fixture was removed. Explicit hardBreak conversion was deployed and both native flows were repeated; the initial run is not final layout acceptance.
- Final **source and target actual Electron** flow: Dashboard Quick Draft → recent-draft link → canonical editor → edit last text segment → Save → immediate reload → actual Website at **335 px**. Exact literal text, all three line breaks (including the blank line), and edited text survive. Zero console/page errors; preview scrollWidth equals width. Each owned document reaches revision 2 with one canonical revision-1 snapshot and no legacy initialization history. No publication.
- Screenshots were inspected. The narrow Admin chrome still has its existing horizontal scroll; the no-overflow claim applies to the Website preview.

## Installation and preservation

Both deployments were built from their own preceding preserved snapshots and backed up with file storage before each deployment. Initial signature change: only the explicit Quick Draft return validator; source 2,412 other signatures and target 2,377 remain unchanged. The layout correction changes no function signatures.

Final preservation bases (snapshot-root-relative hashes):

- `output/quick-draft-layout-20261005/source-source-installed.json` → `ConvexPress-Admin/output/production-checkpoints/source-quick-draft-layout-20261005`: **1,627 hashes**, **108 extension files including tests** unchanged.
- `output/quick-draft-layout-20261005/target-source-installed.json` → `ConvexPress-Admin/output/production-checkpoints/target-quick-draft-layout-20261005`: **1,621 hashes**, **86 extension files including tests** unchanged.

Each installation's catalog and four packs are unchanged. Consumer indexes rebuilt with 243 source / 68 target acknowledged operations per rollout; both consumer and media indexes are ready. Use these final layout snapshots for the next backend change, not the superseded canonical-create or initial quick-draft snapshots.

Three owned test documents and their histories/private drafts were removed (one provisional source, then two final flows). Exact original rows remain: source **116 posts / 434 revisions**, target **29 posts / 88 revisions**. Both appearance snapshots, mail queues/templates and other private drafts are unchanged. Native/API sessions revoked; owned Electron 67742, Websites 68323/68322 and isolated profile cleaned. Owner processes 39198/62672/65092 and the existing RSVP fixture remain untouched. No push.

## Remaining delivery work

This closes the demonstrated Quick Draft writer, not E07 or the full delivery goal. Generic legacy create/HTTP/import entry points still need caller-by-caller retirement. The independently demonstrated private-autosave cleanup race remains open under E19: an older autosave can reappear after immediate reload because accepted Save finishes before its 1,500 ms cleanup. Do not erase a newer generation from another window while fixing it.

Audit 35 remains the latest observed. Its existing dispositions stand; the upcoming deep audit is advisory and does not pause implementation. Tasks 4–8 remain incomplete; block tracker stays 117 Verified / 20 In progress.

Evidence: `output/quick-draft-20261005/` (native fixtures, screenshots, readback, preservation, cleanup, tests) and `output/quick-draft-layout-20261005/` (final deployments, independent snapshot hashes, backup receipts and test logs).
