# Explicit plain-text import — 2026-10-05

Accepted for this bounded E07 import path. Full migration and legacy retirement remain open.

Three retained source records contain literal text that the old structured renderer may not have displayed. Treating this as ordinary migration would silently make hidden content visible. `prepareMigration` now returns `importedContent: "plain-text"`; the editor requires a separate acknowledgement and the mutation enforces `acknowledgeTextImport: true`. Refreshing the review clears acknowledgement. Existing source/candidate/presentation bindings remain enforced, and inactive-settings acknowledgement remains independent.

The import retains literal words, Markdown characters and line breaks without guessing formatting; CRLF/CR become canonical line breaks. Exact original bytes remain in revision history. Valid structured JSON follows the existing converter. HTML, ambiguous malformed JSON, oversized text and unsupported structure still refuse; no truncation, HTML stripping or automatic bulk migration.

## Verification

- Red/green foundation and registered lifecycle regressions:112 tests,1,152 assertions. Mounted editor wrapper passes12 cases, including no acknowledgement, text-only, inactive-only and both acknowledgements, plus refresh reset.
- Admin, backend and Website TypeScript pass; generated backend/deployed/portable foundation,22 transport shapes and media-writer coverage checks pass. UI scoped lint passes. Backend lint retains the pre-existing unused `ComposedDataContext` import in service.ts; no new warning. Diff check passes.
- Captured-corpus review proves exact normalized literal text for all three previously unsupported raw-text records. These are candidates, not three installed migrations. Seven HTML historical sources still require a lossless adapter.
- Source4860 storage-inclusive private backup and immutable scoped deployment:1,624 hashes checked,22 CommunityEvents files retained. Of2,410 installed function signatures,2,408 unchanged; only migration acknowledgement argument and review import flag differ. Consumer index rebuilt from stale to ready:245 acknowledged operations,240 documents, no authored-content writes.
- Actual Electron35258 converted an owned article-mode copy of a retained published post's raw body. Original source remains blocks-mode and untouched. Unchecked acknowledgement disabled conversion; checking enabled it; refreshing cleared it. Saved canonical blocks exactly match the reviewed converter candidate.
- Actual Website preview in native Electron renders the literal text at530px desktop mode and388px phone mode with no overflow or runtime errors. Screenshots inspected. The reused isolated prose-flow Website bundle tests unchanged canonical rendering; it does not claim to contain later breadcrumb/bootstrap fixes or prove a published route.
- Native original-editor restore returned the original content and mode exactly while keeping the fixture draft. A fresh actual API import without acknowledgement refused with MIGRATION_INTENT_REVIEW_REQUIRED and left the post unchanged.
- Owned copy deleted, original source/full appearance/43pages/post listing/email templates/all101queue records exactly preserved. No publication or external mail. API and native sessions revoked; owned Electron and Website processes closed and private profile removed. Separately pending RSVP fixtures are outside this batch and preserved.

Receipts, scripts and desktop/phone screenshots: `output/plain-text-import-20261005/`. Latest scoped deployment manifest: `deployment-source-final.json` there; immutable checkpoint `ConvexPress-Admin/output/production-checkpoints/plain-text-import-20261005-v3`. Failed earlier preflight refused before deployment; final checkpoint includes transport and consumer-index generation. No push.
