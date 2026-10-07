# Canonical Quick Edit — October 5, 2026

Native post/page Quick Edit now saves canonical title and metadata through one revision-checked transaction. Page-parent movement no longer commits separately before a rejected title write. This closes this caller boundary in Task4/E07; bulk post edit, other generic consumers and final schema retirement remain open.

## Failure and repair

Owned native Electron reproduction: post title update refused `CANONICAL_AUTHORING_REQUIRED`. On a page, parent changed but title failed and canonical revision stayed2. Evidence: `output/quick-edit-canonical-20261005/native-before.json`, `post-before.png`, `page-before.png`.

`canonicalDocuments.updateMetadata` uses current native session authority, including broker site capabilities, and the existing canonical transaction for title/body validation, revision/history, routing, publication scheduling, media references and events. HTTP and WordPress callers retain their own actor policy. The new public boundary accepts metadata, not a body replacement. Author reassignment and sticky changes retain Editor+ policy; management identities cannot become public authors. Unchanged root parent requires no move permission. Explicitly retaining future status preserves the existing deadline.

Quick Edit retains the revision from form opening. Concurrent changes refuse the entire operation and retain typed input; the toast explains cancellation/reopening. Unsupported pending-review status is not offered for canonical documents. Existing noncanonical fallback remains until its separate retirement; no claim that generic mutation/schema retirement is complete. Accessible names were added to the actual Quick Edit fields and checkboxes after native lookup exposed missing names.

## Verification

- Registered tests: root/source167 pass,1642 assertions; target137 pass,1144 assertions. Includes four new transaction/authority cases: stale/denied/no-op, invalid parent rollback, schedule retention, current broker authority/revocation, invalid author and trash refusal. The initial new mutation tests failed before implementation; root-parent permission test also failed before correction.
- Native Electron: post title/slug/comments/sticky save and reload, page root move/title/order save, concurrent canonical save while Quick Edit open, stale refusal without parent/title overwrite, cancel/reopen and accepted parent/title/template/order. Original rich-text body exact after every step. Post2→3, unchanged native resubmit remains3; child2→3, concurrent saves4/5, accepted reopened metadata6. Historical authoring title/body revisions retained; no assertion that unrelated route metadata became revision-restorable.
- Screenshots inspected: post-after, page-after, page-stale-refused. Native payload/readback evidence: native-post-reopened.json, native-stale.json, native-saved.json, stale-final.json, final-readback.json. Source live create/update/stale rejection/normal cleanup also passed (`source-fixture.json`).
- Admin4 type-check tasks pass; backend scoped `tsc -p convex/tsconfig.json --noEmit` passes; both deployment typechecks pass. Initial unscoped tsc inherited an ancestor project and exhausted its default heap; it was replaced with the correct scoped check, not treated as a product error. Site contracts2284 functions/3057 DTOs/374 existing unknown boundaries and39 compiler fixtures per consumer pass. Writer coverage passes; `git diff --check` passes. This is focused verification, not a repository-wide health claim.

## Installed state and cleanup

Both site-specific snapshots were cloned from the prior verified source manifests and patched only for this transaction/tests/generated consumer-index version. Source adds one public function,2394→2395; target2359→2360; no other signature additions/removals/changes. Source108 and target86 extension files plus catalogs/packs remain exact. Rebuilt consumer indexes are ready; media indexes remain ready. No authored-content writes from index rebuilding.

Next deployment bases: `output/quick-edit-canonical-20261005/{source,target}-source-installed.json`. Snapshots: `ConvexPress-Admin/output/production-checkpoints/{source,target}-quick-edit-canonical-20261005`. Private full-storage backups and pre-fixture target snapshot retained outside Git.

All four owned documents and their owned history deleted through normal lifecycle. Original source116documents/434revisions and target29/88 exact; appearance/email queue/templates exact on both sites. Target private draft and metadata exact. Readback sessions revoked; native signed out; owned Electron PIDs83789/83849 exited and owned profile removed. User PIDs39198/62672/65092 preserved. No Git push. Latest Claude audit remains37; advisory notes updated. Goal remains active,117Verified/20In progress.
