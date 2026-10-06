# Remaining legacy authoring consumers — October 5, 2026

Bounded continuation of Task 4/E07 after canonical import and legacy seed retirement. This inventory is not a new broad audit or permission to erase archived recovery fields.

| Consumer | Current evidence | Next decision |
| --- | --- | --- |
| Native `EditorLayout` and `useEditorForm` | Retired in cddfab37 with its38-file private closure; canonical route/recovery tests and shared source preserved. | Completed for the proven private UI closure; see legacy-editor-retirement-20261005.md. |
| Generic posts/pages `update` validators and handlers | Still accept contentMode, old body/structured fields and v1 blocks. They retain metadata/lifecycle callers. The attachment guard provides canonical write authority; field acceptance alone is not evidence of a working bypass. | Classify actual callers and remove obsolete authoring branches without removing valid metadata/hierarchy operations. Reproduce any bypass before claiming one. |
| `blocks/queries`, `blocks/mutations`, `blocks/ai` | Retired16 obsolete functions in11338bbf; canonical AI and usage queries retained. | Completed for this isolated API boundary; see legacy-block-api-retirement-20261005.md. |
| Canonical foundation and service | contentMode currently participates in canonical identity, history conversion/import and promotion envelopes. | Migrate dependent contracts deliberately; do not remove the schema discriminator ahead of installed readers/writers. |
| Revision schema, authoring snapshots and import converters | Old content, sections and structured values retained for recovery/import, distinct from current canonical body. | Retain recoverable source or replace with a proven lossless archive before deleting fields. |
| Website route DTOs and Aster home presentation | Route DTOs carry contentMode; Aster uses it for wrapper/opening presentation while shared Blocks handles canonical rendering. | Remove obsolete presentation assumptions with existing four-pack native/public evidence and focused rendered checks. |

Original corpus: source116 documents/434revisions and target29/88; all current documents canonical, retained source/history preserved. The block117/20 count is unchanged and is not a delivery percentage. See the delivery status file for the complete remaining tasks.


## Next concrete caller: Quick Edit

`PostListTable` and `PageListTable` still expose Quick Edit. `PostQuickEdit` sends changed title/slug/status through `usePostMutations.updatePost`; `PageQuickEdit` first calls setParent separately, then sends title/slug/status/template/order through generic update. The canonical document regression already proves those generic title writes refuse `CANONICAL_AUTHORING_REQUIRED`. Consequently the metadata/title path must be coordinated with canonical authoring before its generic fields can be removed. Page parent movement currently occurs before the later write, making this a partial-application risk. Reproduce on an owned canonical fixture in native UI, then provide one revision-checked canonical metadata/title transaction including parent movement. Preserve body, history, publication and current authority; do not remove Quick Edit to make retirement pass. Bulk post edit also calls generic update and requires field-by-field classification.


## Quick Edit closure

The failure above was reproduced in native Electron, including partial parent application. Canonical Quick Edit now uses one expected-revision transaction; stale forms retain input and refuse all changes. Post/page save, parent removal/reassignment, template/order and native reopen pass. Body/history, original145documents/522revisions, appearance/mail and target private draft exact after cleanup. See quick-edit-canonical-20261005.md. Next is PostBulkEdit and other actual generic metadata consumers; noncanonical fallback and generic validators remain deliberately inventoried.

## Bulk Edit closure and audit 38 parity gap

Bulk Edit canonical revisions, stale/partial results and cross-page selection verified in native Electron; see bulk-edit-canonical-20261005.md. Generic metadata retirement remains open. Current post edit route mounts NativeCanonicalEditor without a metadata sidebar; CanonicalEditor/NativeCanonicalEditor have no excerpt/featured-image/discussion controls. Quick Edit supports comments and author but renders categories/tags read-only. Audit38 correctly identifies a parity gap requiring native reproduction and canonical metadata repair before removing further generic consumers. The old destructive marketing seed's replacement belongs to open E10 safe canonical example-site provisioning; restored legacy deletion is not the repair.

## Metadata parity closure

Audit38 excerpt/image/discussion/category/tag gap is repaired and accepted within document-settings-20261005.md. Native save/reopen/stale refusal and exact cleanup pass. Settings compare the opened digest because generic metadata/taxonomy callers can still change values without a canonical revision. Current web search finds only post/page Quick Edit noncanonical fallbacks through usePostMutations/usePageMutations invoking generic update; no current web taxonomy assign/unassign caller. Review external/backend consumers before retirement. Latest installed bases are document-settings-events-20261005. E07 is not yet closed.
