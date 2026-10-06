# Remaining legacy authoring consumers — October 5, 2026

Bounded continuation of Task 4/E07 after canonical import and legacy seed retirement. This inventory is not a new broad audit or permission to erase archived recovery fields.

| Consumer | Current evidence | Next decision |
| --- | --- | --- |
| Native `EditorLayout` and `useEditorForm` | Retired in cddfab37 with its38-file private closure; canonical route/recovery tests and shared source preserved. | Completed for the proven private UI closure; see legacy-editor-retirement-20261005.md. |
| Generic posts/pages `update` validators and handlers | Still accept contentMode, old body/structured fields and v1 blocks. They retain metadata/lifecycle callers. The attachment guard provides canonical write authority; field acceptance alone is not evidence of a working bypass. | Classify actual callers and remove obsolete authoring branches without removing valid metadata/hierarchy operations. Reproduce any bypass before claiming one. |
| `blocks/queries`, `blocks/mutations`, `blocks/ai` | Old block read/write and AI path still registered. `PageGenerationPrompt` and `BlockOutline` reference replaceBlocks. AI actions call internal legacy document read/write. | Trace whether controls are reachable; preserve canonical AI composition required by Task 7, then retire or coordinate actual remaining callers. Do not delete action endpoints only because a UI parent is obsolete. |
| Canonical foundation and service | contentMode currently participates in canonical identity, history conversion/import and promotion envelopes. | Migrate dependent contracts deliberately; do not remove the schema discriminator ahead of installed readers/writers. |
| Revision schema, authoring snapshots and import converters | Old content, sections and structured values retained for recovery/import, distinct from current canonical body. | Retain recoverable source or replace with a proven lossless archive before deleting fields. |
| Website route DTOs and Aster home presentation | Route DTOs carry contentMode; Aster uses it for wrapper/opening presentation while shared Blocks handles canonical rendering. | Remove obsolete presentation assumptions with existing four-pack native/public evidence and focused rendered checks. |

Original corpus: source116 documents/434revisions and target29/88; all current documents canonical, retained source/history preserved. The block117/20 count is unchanged and is not a delivery percentage. See the delivery status file for the complete remaining tasks.


## Next concrete caller: Quick Edit

`PostListTable` and `PageListTable` still expose Quick Edit. `PostQuickEdit` sends changed title/slug/status through `usePostMutations.updatePost`; `PageQuickEdit` first calls setParent separately, then sends title/slug/status/template/order through generic update. The canonical document regression already proves those generic title writes refuse `CANONICAL_AUTHORING_REQUIRED`. Consequently the metadata/title path must be coordinated with canonical authoring before its generic fields can be removed. Page parent movement currently occurs before the later write, making this a partial-application risk. Reproduce on an owned canonical fixture in native UI, then provide one revision-checked canonical metadata/title transaction including parent movement. Preserve body, history, publication and current authority; do not remove Quick Edit to make retirement pass. Bulk post edit also calls generic update and requires field-by-field classification.
