# Nested-list migration acceptance — 2026-10-05

Nested-list semantic conversion and owned native recovery accepted. Full migration/legacy retirement remains open; converted article spacing needs a separate focused repair.

## E07 bounded repair

1. Required workflow: migrate/recover the retained TipTap list item containing an italic paragraph and nested list without flattening its hierarchy.
2. Evidence: retained source snapshot g18enhe1p2ts5gvantmrzc2t7d8evk4j and five historical revisions fail the previous one-paragraph-only converter; regression reproduces the exact refusal.
3. Dependency: core/list had no child-block representation. Its existing flat items are insufficient for multiple block nodes within one item.
4. Repair boundary: add child items to the existing List renderer/contract, each child one item after flat text items. Group represents a multi-block item. Preserve existing version-2 attrs and flat rendering; no persisted version change or rewrite of existing content. Complex task-list migration remains explicitly refused because completion states need a separate representation. Ordered starts other than 1 and unrepresented HTML/raw text remain refused. Recursive conversion enforces existing depth/node/byte limits and retains source paths as stable identities.
5. Exit check: registered prepare/commit/reopen/exact original recovery/canonical undo; actual Electron conversion on an owned corpus copy, actual Website hierarchy and marks, source and unrelated-data preservation and cleanup.

## Local evidence

- 110 registered document lifecycle/foundation tests, 1136 assertions, pass.
- Actual Website renderer suite passes, including semantic nested LI/OL structure and retained flat task states; backend and Website TypeScript pass.
- Immutable corpus replay: source39/42 supported documents (was38/42),112/119 supported legacy revisions (was107/119); target2/2 documents and21/21 revisions unchanged. Remaining failures are explicit raw-text/HTML adapters. No database mutation by these checks.
- Source snapshots remain byte-identical. Output: output/migration-nested-list-20261005/.

## Installed/native/public evidence

- Source4860 deployed from verified forms-authority checkpoint with only13 affected converter/generated files,1624 hashes exact,2410 exported signatures exact and22 installed Community Events files preserved. Storage-inclusive backup retained privately. Target4870 untouched.
- Actual Electron26753, owned profile, Admin4105; selected staging source4860. Owned copy g18634ee3wz6036hx0sd3a4e3h8fqcm2 reproduced retained content byte-for-byte.
- Native review showed5 top-level/8 total blocks. Conversion, reload and actual Website preview preserved nestedUL and italic text plus literal code. Native publication confirmed; headed public1440/390 captures inspected, list markers disc, scrollWidth1429/379, zero page errors.
- Before conversion, the legacy Website itself omitted the nested child and code despite retaining them in storage. Acceptance compares exact stored structure and semantic output; it does not preserve that omission.
- Native original-editor recovery matched the original source bytes at revision4, then native canonical restore returned the exact accepted block tree at revision5. Revision monotonicity and current draft publication state preserved.
- Owned post deleted; original source post,43pages, original post listing, full appearance and templates exact. Original99queue entries exact. Two publication notifications addressed to the synthetic example.invalid author failed because no Resend key exists; no external mail sent. Their failed audit rows are retained (no pending work), recorded in cleanup-proof.json.
- Native logout/API logout completed, browser and owned Electron/Website PIDs closed, private profile removed. The older RSVP fixture is unrelated and remains explicitly pending.

## Visual limitation

Public screenshots show excessive inter-block article spacing. This is caused by migrated headings/lists/code/divider inheriting standalone Section padding, whereas the source is one prose document. Semantic preservation is accepted; full visual/layout acceptance is not. Address the document-flow representation through existing canonical layout/SDK contracts and rerun the actual native/public comparison before E07 closure. No pixel-parity or whole-delivery claim.
