# Shared template settings validation — 2026-10-05

Claude audit32 O2 accepted after reproducing the current promotion writer accepting an invalid `Core` pack key. Generic updates/imports also lacked the Customizer's nested pack/module checks and serialized-size limit. Shared `validateAppearanceTemplate` now applies those existing constraints to every writer; Customizer retains its complete-snapshot guard and uses the shared checks. Partial settings updates, camelCase module IDs, other packs and authored values remain valid. No schema change.

## Verification

- Registered promotion regression failed before the repair because dryRun resolved rather than rejecting the invalid pack key.
-129 focused tests/798 assertions pass across promotion operations, template drafts, settings validation and appearance migration. Invalid names, arrays and oversized values are refused without persisted target changes; valid partial updates retain both packs and camelCase modules.
- Backend TypeScript and diff checks pass. Scoped lint has one pre-existing unused `values` parameter in `validateLayoutAssignment` (confirmed at prior HEAD); no new warning. No unrelated cleanup was folded into this fix.
- Source4860 scoped deployment changed only `settings/validation.ts` and `settings/templateDrafts.ts` from the preceding nested-list immutable checkpoint. Storage-inclusive private backup captured first. All1,624 checkpoint hashes verified,2,410 deployed function signatures unchanged,22 CommunityEvents files preserved. Latest manifest: `output/template-validation-parity-20261005/deployment-source-final.json`.
- Actual installed API checks:25 refusals across settings update/import, Customizer publish/saveDraft and promotion dryRun. Promotion's existing manifest schema already rejects array shapes as INVALID_PROMOTION; the added pack/module-name and size constraints return PROMOTION_PRESENTATION_INVALID. This source-site dryRun test stops before target identity planning; it does not claim a live promotion apply.
- Current appearance/revision,43pages, post listing, existing private Core draft, email templates and101queue entries exactly preserved. No content/settings fixture created; owned API session revoked and credential removed. Target4870 untouched.

Full evidence: `output/template-validation-parity-20261005/`. This closes the bounded validation inconsistency, not the full Task5 per-field/promotion/Customizer acceptance matrix or whole delivery goal. No Git push.
