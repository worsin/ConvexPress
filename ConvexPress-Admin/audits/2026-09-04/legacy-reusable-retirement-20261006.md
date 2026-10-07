# Reusable API retirement and Task 4 corpus closure — October 6

The last inventoried obsolete reusable authoring APIs still allowed creation of the old TipTap source format. Current native/Website consumers use canonical synced content and explicit legacy import review. Retired editor create/update/delete/duplicate reusable mutations, list/get reusable queries and internal incrementUsageCount: seven registrations per site. Removed their private validators, creator/self-reference helpers and obsolete imported-writer guard. Existing edit-lock operations and cleanup cron remain byte-equivalent to each installation's previous implementation. Original reusable storage, immutable original snapshots and media ownership remain.

Evidence: `output/legacy-reusable-retirement-20261006/`.

## Current verification

- 194 focused backend tests / 1,850 assertions passed. The updated seven-test legacy suite passes 51 assertions, including a new 41-source boundary case: review and apply explicitly refuse incomplete import, write no canonical heads/revisions, preserve all originals, and paginated inventory returns all 41 sources as 20/20/1 with no duplicates. Existing conflict/authority/cycle/missing-dependency/locked-publication/idempotence tests remain.
- Backend and Admin strict types pass; no new type exceptions. Generated contracts: 2,277 functions / 3,048 DTOs with the same 372 unknown boundaries; 39 compiler fixtures per consumer pass. Numbered DTO changes explain the larger generated diff. Writer and consumer coverage gates pass.
- Both storage-inclusive backups retained privately. Preserved source snapshot: 1,631 files, 2,395→2,388 functions. Target: 1,620 files, 2,356→2,349 functions. Exactly the seven named registrations removed, none added, no surviving function signature changed. Strict deployment passed on both; controller unchanged. Installed manifests: `{source,target}-source-installed.json` and `installed-source-proof.json`.
- Actual authorized canonical library queries enumerate 15 source and 6 target heads. Every latest revision body/digest exactly matches storage; all three source legacy reviews resolve to existing canonical identities. No content mutation was required. The source consumer fingerprint changed after deleting its guard, so its normal resumable index rebuilt through 270 acknowledged operations to ready; target consumer and both media indexes remain ready.
- Unchanged native import/edit/promotion/Website behavior reuses `synced-legacy-20261006.md`, `synced-promotion-final-20261006.md`, `field-guide-legacy-final-20261006.md` and the immediately preceding `legacy-compatibility-retirement-20261006.md`. This batch does not claim a fresh native/public interaction or provider acceptance.

## Complete named corpus reconciliation

Scans paginate to authoritative completion, reject repeated cursors/duplicate IDs, and explicitly fail at their bounded limit rather than treating a partial page as success. Raw records/candidates remain private with mode 0600.

| Corpus | Source | Target | Current conclusion |
| --- | ---: | ---: | --- |
| All documents, including Trash | 128 | 32 | Every stored tree is canonical and validates with its own installed contracts |
| All document revisions | 482 | 97 | Every parent exists and legacy parent types agree; original rows retained |
| Canonical document revisions | 319 | 74 | All trees validate with installed contracts |
| Legacy saved/autosave sources | 175 | 23 | All 198 convert; zero unsupported actual source shapes |
| Retained old reusable sources | 3 | 0 | All three mapped; immutable first revisions retain exact original JSON |
| Canonical reusable heads/revisions | 15 / 38 | 6 / 34 | All 72 revision trees validate; all 21 latest bodies/digests read exactly through current APIs |
| Private draft rows | 7 | 2 | Exact original rows preserved |

625 stored canonical document/revision/reusable trees pass installed contract parsing. Historical preparation is ready for 68 sources; 130 deliberately refuse because their parent is in Trash. They convert offline but are not silently restored or published. Representative native restore/import/download acceptance remains the historical evidence linked below, not a claim that every archived record was opened in the UI.

The first offline harness accidentally imported the old separate canonical-blocks-foundation copy, yielding one false reusable adapter failure. Its error is retained in history-review-before-correction.json. The actual installed convex/canonicalDocuments/foundation converter exactly matches the already-recovered parent body. The final offline pass reran every source using each installation's actual converter, while reusing unchanged authorized API observations. Authoritative result: history-final.json (175/175 and 23/23). No product workaround or data rewrite.

Media reverse edges reconcile exactly with current owner discovery across all posts, revisions, old reusable sources, canonical reusable revisions and private drafts: 129 references total, zero mismatches. First-generation original JSON remains part of the opaque media ownership contract. See reference-reconciliation.json.

## Task 4 requirements and acceptance boundaries

1. **Inventory and converter coverage:** current corpus.json, canonical-corpus.json, history-final.json and reference-reconciliation.json cover the complete named installed tables. Earlier source inventory and migration receipts remain traceable through E07's evidence list. No actual installed document remains on the old authoring model.
2. **Preservation, limits and exact values:** retained source/target migrations, nested-list/prose-flow/plain-text/HTML, autosave and history-import reports establish supported conversion and refusal behavior. Current registered tests cover graph limits, incomplete inventory, stale review and zero partial writes. This is acceptance for known retained content, not a promise that arbitrary unknown or oversized future inputs can be auto-converted; those receive explicit refusal and review requirements.
3. **Native conversion/reopen/publication/recovery and rendering:** reuse source-page-migration, source-text-migration, target-draft-migration, history-retirement, synced-legacy and field-guide-legacy-final reports. Those workflows exercised the unchanged converters, exact archive recovery and actual Website output. The last compatibility retirement additionally verified canonical private autosave/reopen/save and live iframe continuity.
4. **Installed/demo migration and rollback:** all current 160 documents and three reusable originals are accounted for; old marketing seed was retired in demo-seed-retirement-20261005. Canonical example provisioning is recorded separately in example-site-authoring-20261005. Full backups, retained original revisions and identity mappings remain; this batch changes no authored data.
5. **One active authoring/renderer path:** prior generic create/update, v1 block APIs, legacy editor/Website closure, contentMode dispatch, downgrade, autosave and structured-AI endpoint retirements plus this reusable API retirement remove the inventoried obsolete live path. Keep historical schema fields, explicit converters, archive downloads and stored legacy model settings. Shared AI transport remains used by canonical/LMS/provider connection workflows; its unused legacy task enum is not a body writer or alternate editor and does not warrant removing active transport.

Task 4/E07 is accepted for the specified migration and single-authoring-model deliverable. This does not close Task 3/5/6/7/8, the remaining five block acceptance rows, hosted editing, actual AI generation, motion review or final integrated artifact parity.

## Preservation and cleanup

Exact before/after comparison: all 160 posts, 579 document revisions, 3 original reusable sources, 21 canonical heads, 72 canonical reusable revisions, 9 private drafts and 2 postMeta rows. Both appearance values/identity, general/reading/AI settings and menu locations match the previous verified baseline. No new fixture or authored-content mutation. Two API sessions revoked; refresh returns 401. No native runtime or browser tab started; seven protected processes remain alive. No push.
