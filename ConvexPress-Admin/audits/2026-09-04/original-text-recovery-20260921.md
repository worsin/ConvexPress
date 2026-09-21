# Original text editing and B07 recovery acceptance — September 21

**B07 is accepted against its original September 4 requirement.** Six original audit rows are accepted and eighteen remain open. Legacy migration/removal, complete block/template quality, and the overall production goal remain unfinished.

## Repair

Opening a rich-text-only original document previously ran a lossy TipTap-to-legacy-block conversion. The post and page routes now retain the source document and expose text editing without flattening lists, marks, links, media or unfamiliar metadata. Structural/format changes still use the explicit canonical conversion review. This is a compatibility text editor, not a new WYSIWYG or the final canonical authoring experience.

Original article saves omit block fields. Original text beneath legacy block mode with an empty block tree also remains editable, preserves that mode, and does not invent block/version/revision fields. Plain text, including a numeric or quoted sentence, stays plain. Malformed structured documents stay intact and require conversion review. Controls use stable labels; long documents expose text in batches of fifty.

## B07 requirement evidence

| Original requirement | Evidence |
|---|---|
| Version complete authoring data, blocks, version metadata and mode | Existing registered lifecycle/restore tests; current focused document/composed suites:100 passed. Earlier rich-text/article recovery compared nineteen authoring fields. |
| Restore atomically; reject stale or wrong-document revisions | Registered-handler cases plus actual refusal/readback in [revision acceptance](revision-acceptance-20260921.md). |
| Change only block text/image/layout; restore stored and rendered output | Earlier native full-tree restore and safety undo compared nested marks, image identity/alt/caption, spacing/tone/width and page chrome; anonymous desktop/mobile rendering verified. See the same revision acceptance. Recovery service, revision modules and revision schema match the current deployed checkpoint. |
| Include editor-mode changes | Earlier structured-article round trip and editable recovered sections in [article editor acceptance](original-article-editor-20260921.md). This increment adds native rich-text conversion → block save/restore → original-editor recovery → edit/update/reopen with exact tree preservation. |
| Revision restoration refreshes search | Earlier live title-update/restore indexing plus this increment's actual published block-body edit and native restore. Search finds the new term after save, then finds the original term and excludes the replaced term after restore. No manual reindex. |

## Current native and rendered checks

Two disposable post/page records preserve nested lists, bold/italic/link marks, code and separators through native editing, explicit save and reopen. Stored comparisons prove only the intended text changes; block fields remain unchanged. Explicit conversion of the nested multi-block list item refuses with its exact unsupported-content path; the source remains editable and unchanged. A second page check preserves explicit legacy block mode with no block tree through editing and reopening.

A third owned page uses a supported marked paragraph. Native conversion and publication, block-text edit, revision2 restoration and original-editor restoration passed. Thirteen authoring fields match the original source exactly. Recovery intentionally normalizes an absent legacy blocksVersion to1 and increments revision/update metadata; current publication and URL stay intact. The recovered editor saves another text edit without losing bold/link marks. Actual public Website checks at1440/390 verify those marks, link destination and no horizontal overflow; final mobile screenshot reviewed. The embedded real Website also rendered the restored canonical bold text and link.

Harness corrections are not product defects: an early save readback preceded completion; navigation initially acted on the departing post before the destination page loaded, so its extra owned-field edit was restored and both exact trees rechecked. Later checks wait for the destination heading and authoritative persistence. The Update button's accessible name is Update post, even on a page. An API verification token expired after the native write; a fresh login read back the completed save without replaying it. The original-editor recovery normalizes version1 by design, rather than preserving an absent metadata property.

## Validation, source and cleanup

- Final Admin frontend:485 tests passed. Current document/composed backend suites:100 passed. Admin type checks and production web build pass; chunk-size warning remains.
- New-file lint and whitespace checks pass. Shared-file lint retains seven inherited errors: the older role=main wrapper and six redundant transition dependencies. No broad lint-clean claim.
- No backend deployment or saved-schema change. Six recovery-related source files match the deployed search-scale-r2 checkpoint. A broader comparison found existing differences in three unrelated generated foundation files: leadMagnetContracts, localeContracts and socialFeedContracts. Full source/deployment parity is not claimed; see recovery-source-parity.json.
- All three owned records trashed. Exact original42 pages,2 posts,4 images, settings and155 listeners preserved. Both owned sessions signed out; owned Electron91928 and Website preview stopped. Original39198/69634/8172/68390 processes preserved.

Artifacts: worktree-root `output/original-text-editor-20260921/` contains edit-acceptance.json, fallback-acceptance.json, conversion-refusal.json, roundtrip.json, public-acceptance.json, recovery-source-parity.json, screenshots, tests/build/type/lint logs, cleanup.json and native-signout.json. MagicTables feature Notes receive the scoped recovery evidence without marking the whole library complete.

The prior user-requested status-report turn changed no product state. This continuation repairs and verifies the remaining original-text editing path and closes B07 using the original acceptance criteria, without reclassifying incomplete migration or design work as finished.
