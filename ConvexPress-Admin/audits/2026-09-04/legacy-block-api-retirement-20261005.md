# Legacy block and AI API retired — October 5, 2026

Task 4/E07 removes the isolated v1 block-editor backend surface after the old native editor retirement. Both sites omit exactly **16** endpoints: six old block AI actions, eight old block mutations and two old document queries. Current canonical document read/save, AI generation/preview/apply and block usage diagnostics remain. This is not full SDK/AI or editor/template delivery acceptance.

Repository and both installed backend caller scans found no consumers outside the retired path. NativeCanonicalEditor directly calls `canonicalDocuments/ai:generateProposal` and `canonicalDocuments/aiContext:preview/apply`. The shared catalog, block validation helpers and usage queries remain. Empty module exports mark the old action/mutation modules retired while keeping generated module imports valid; no old operation is registered.

## Checks and preservation

Evidence directory: `output/legacy-block-api-retirement-20261005/`.

- Working/source **169 tests / 1,777 assertions**; target **139 / 1,279**, all pass. Tests cover canonical creation/import/history/locks, bounded usage, catalog contracts and canonical AI nested proposal generation, provider/review interval revocation, current resource/style validation and one-time apply/history.
- Retired endpoint-only access/AI tests were removed. Shared catalog and generic-update tests remain. A pre-existing test called the already-retired generic create function; its remaining update assertions now pass, while canonical creation coverage remains in documents.test.ts. Canonical lock readback replaces an assertion against the removed legacy reader.
- Source's older AI style test incorrectly expected an empty Core style map. The prior unchanged snapshot reproduces that failure. Its source-only expectation now matches the preserved installed Core Hero default/editorial/poster styles; catalog and runtime logic were not changed. Target/root expectations remain appropriate to their distinct catalog snapshots. See source-prior-ai-style-failure.txt.
- Root backend types, both deployment typechecks, all four Admin typechecks, writer gates and generated-contract checks pass. Contracts: 2,283 functions / 3,057 DTOs, 374 existing unknown boundaries (three retired boundaries removed); 39 compiler fixtures pass for each consumer.
- Function inventories: source2,410→2,394; target2,375→2,359. Exactly16 removed, no additions or changes to remaining signatures (`source-parity.json`, `target-parity.json`).
- Site-specific catalogs, packs and extensions remain exact. No provider call or legacy write ran for live acceptance. Current canonical AI code and native proposal controls are unchanged; their focused tests supply the regression evidence. This batch does not claim a new live-provider/native generation journey.

Final installed proof, original-data comparison, ready indexes and session cleanup are recorded in installed-preservation.json, preservation.json, final-indexes.json and api-cleanup.json. No content fixture or native runtime was created for this API removal. Original source116 documents/434revisions and target29/88, appearance and mail remain exact. No Git push.

Next deployment bases: **`output/legacy-block-api-retirement-20261005/{source,target}-source-installed.json`**, following separate storage-inclusive backups. Preserve each site's snapshot and catalog differences.

## Next required repair

Quick Edit remains a real caller of the generic update endpoints. Both native lists expose it; changing the title reaches the generic mutation that canonical regression coverage proves refuses `CANONICAL_AUTHORING_REQUIRED`. Page Quick Edit also changes parent in a separate mutation before the other update, risking partial application. Reproduce on an owned native canonical fixture, then coordinate a revision-checked canonical metadata/title transaction that preserves body, history, authority and publication. Keep Quick Edit functioning; do not delete it merely to retire legacy fields. Classify post bulk edit alongside it, then continue archival/schema retirement. E07 and the full goal remain active,117Verified/20In progress unchanged.
