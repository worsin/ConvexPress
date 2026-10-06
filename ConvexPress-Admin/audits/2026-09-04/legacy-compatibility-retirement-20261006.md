# Legacy autosave and structured-AI endpoint retirement — October 6

The unused legacy autosave mutation, legacy preview query and structured-content AI generation closure still exposed an obsolete authoring path. Current editor callers use canonical documents, private drafts and canonical AI proposals. Removed the unused native autosave hook/method and Legacy structured content model control, plus seven backend functions: posts/mutations:autosave, posts/queries:preview, ai/actions:generateAll/generateSection and ai/helpers:getAiSettings/getPostForAi/saveGeneratedContent. Removed their prompts/validators/helpers modules. Provider and Tavily connection checks, canonical AI and historical import/archive fields remain.

Evidence directory: `output/legacy-compatibility-retirement-20261006/`.

## Validation

- Focused registered backend: 194 tests / 1,927 assertions. Native draft/recovery/AI-proposal boundaries: 12 tests / 59 assertions. Admin and backend strict TypeScript pass. Generated API contract checks: 39 compiler fixtures per consumer pass. Consumer contracts now describe 2,284 functions / 3,054 terminal DTOs with the same 372 existing unknown boundaries. Generated DTO numbering accounts for the large declaration diff.
- Canonical authoring guard regression now directly attempts guarded legacy autosave-field writes rather than invoking the retired endpoint. It verifies rejection and unchanged canonical document/history; retained legacy history restore guards remain covered.
- Preserved installed source and target snapshots each remove exactly the seven functions above, add none and change no remaining signature. Source 2,402→2,395 functions / 1,631 files; target 2,363→2,356 / 1,620 files. Both passed strict deploy after full storage-inclusive private backups. Controller unchanged. Installed manifests: `{source,target}-source-installed.json`; exact evidence: `installed-source-proof.json`.
- Both actual sites: canonical create/save, private draft exact readback without accepted document/history writes, stale-generation refusal, canonical draft preview and published canonical body pass. Target discard passes; source API draft is separately discarded during cleanup.
- Actual source native Electron: edit title/body; observe private Website autosave and its persisted row; leave via the unsaved-change confirmation; reopen and observe exact recovered text; save revision 4. Stored title/body exactly match. The actual Website iframe renders recovered input automatically before and after save. Native AI settings retain Block editing routing and no longer show Legacy structured content. No AI settings were saved or provider generation invoked.
- Screenshot `native-recovered.png` visually inspected. Existing Website artifact 6fc1e5fa reused because renderer source is unchanged. This is current native recovery/iframe proof, not new external-provider or four-pack acceptance.

## TypeScript exception decision

The preserved pre-change backend passes strict checking. API surface removal shifts the existing recursive Convex generated-API depth diagnostics: four previous suppressions became unused and three TS2589 diagnostics moved. Trace confirmed recursive Validator/PropertyValidators and ApiFromModules/FilterApi instantiation. Explicit generic arguments, hoisted validators and registered-action annotations did not repair it; those experiments were reverted. Three existing suppression comments were relocated to the actual diagnostic lines (gallery, kb, recipes) and one unused authTracking suppression removed. Total existing suppressions decrease 49→48. No validator behavior, compiler limits or compiler settings changed. This is maintenance of the existing exception policy, not a claim to fix the underlying inference limitation. Final workspace and both installed strict checks pass.

Target offline discovery separately rejected its pre-existing single-dot synced-block test helper files. Their installed source was preserved; only the three removed module entries were deleted from that target's original generated API. Actual deployment/codegen/strict checking subsequently passed. No broad source overlay or unrelated helper removal.

## Preservation and cleanup

Original source 127 posts / 479 revisions / 5 private drafts / 2 postMeta and target 31 / 95 / 1 / 0 compare exactly, including trashed content and archives. Both appearance values/identity, general/reading/AI settings and menu locations compare exactly. Two owned pages recoverably trashed; their histories retained, all owned private drafts cleared. Two API refreshes return 401 after logout. Native original Live selection restored and control plane signed out. Owned Electron 99593 and Website 99695 exited, private profile removed; seven protected processes remain alive. No browser tab created. No push.

## Remaining scope

132 Verified / 5 In progress remains unchanged. E07/Task 4 remains open for final corpus/reachable compatibility reconciliation, including reusable-source accounting. Retained schema/archive fields and stored legacy model settings were not erased. The shared AI model-routing compatibility branch remains for separate caller classification. E99 remains an intermittent integrated-preview watch; this recovery rendered successfully and does not establish a causal fix. Full editor/template delivery is not complete.
