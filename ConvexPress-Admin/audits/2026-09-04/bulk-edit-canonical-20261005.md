# Canonical Bulk Edit — October 5, 2026

Bulk post metadata now uses each document's captured canonical revision. A stale member is refused independently; successful members and uncertain acknowledgements remain visible without automatic replay. This closes the Bulk Edit caller boundary within Task 4/E07, not the entire delivery goal.

## Reproduced failure and repair

In actual native Electron, two selected canonical posts began at revision 2. A concurrent canonical save advanced the first to revision 3. Old Bulk Edit nevertheless changed comments on both documents through generic update, without advancing either revision. See output/bulk-edit-canonical-20261005/before-readback.json and bulk-before.png.

Selection now captures immutable IDs/titles/revisions across pages; the batch calls canonicalDocuments.updateMetadata once per selected document. Each document is atomic; the batch deliberately reports partial results. Stale or unsupported documents require review. An unknown acknowledgement instructs verification before retrying. Successful saves close and clear selection; partial results stay visible and prevent replay until explicitly closed and reselected. Sticky has explicit no-change, make-sticky and remove-sticky values. Selection remounts on verified runtime generation change; unmount stops unsent requests after an already-issued request settles. Noncanonical rows require deliberate editor migration.

## Verification

- Failing-first helper tests followed by 3 passing tests/9 assertions cover captured revision conflicts, partial outcomes, legacy refusal, uncertain acknowledgement without retry, and stopping unsent requests on scope closure. Initial root-level Bun file-descriptor failure was corrected by using the web workspace and raised descriptor limit; the subsequent red test was the missing implementation.
- Actual native Electron stale batch: first document refused at revision 4, second accepted to revision 3. Panel retained per-document results, 1 updated/1 needing review, Update disabled. Screenshot bulk-partial.png visually inspected; native-partial.json and partial-readback.json agree.
- Actual pagination: nine extra owned posts made a second page. Selection across both pages updated two intended documents; revisions 4→5 and 1→2. Explicit remove-sticky then advanced the first 5→6 while preserving comments. Body readbacks remained exact. Evidence native-cross-page.json, cross-page-readback.json, final-readback.json.
- Settled environment switch confirmed the source Staging dashboard, then Posts had zero selected rows and no bulk panel; native-scope.json reports zero page errors. An earlier switch during hot reload did not confirm scope and was not counted. In-flight network switching was not tested natively; stopping remaining writes is covered by the helper test.
- All four Admin type-check tasks pass (three cached, web rerun), git diff --check passes. Focused verification only; no repository-wide test-health claim.

## Preservation and cleanup

Frontend-only change; no backend deployment. Installed metadata service and next deployment bases remain output/quick-edit-canonical-20261005/{source,target}-source-installed.json.

All eleven owned documents/history removed through normal lifecycle. Original source 116 documents/434 revisions and target 29/88 exact; appearance/mail exact on both sites, target private draft and metadata exact. Consumer and media indexes remain ready. API sessions revoked, native signed out, owned Electron PID 86279 exited and owned profile removed. User runtimes 39198/62672/65092 preserved. Evidence preservation.json, target-cleanup.json, cleanup-journal.json, final-indexes.json, api-cleanup.json, runtime-cleanup.json in the batch output directory.

Audit 38 arrived during this batch. Its demo-site replacement and native metadata parity questions are accepted as open delivery checks; see shared CODEX-RESPONSE-38.md. E07 and the full goal remain active/incomplete, 117 Verified/20 In progress. No push.
