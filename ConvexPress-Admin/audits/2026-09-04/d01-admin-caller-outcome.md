# D01 — Admin non-commerce caller corrections

This batch owns Admin callers outside commerce and Events. The commerce agent owns those callers, backend DTO corrections, and compact API generation. No browser, deployment, commit, push, or external writes were performed here.

## Behavior repaired

- KB template creation now always sends required content and an actual supported category. A category selector replaces arbitrary text that the API rejected. Empty content can also clear an existing starter template. Query results and selected template IDs keep inferred backend types.
- KB workflow creation/update now sends the required step type. New steps default to approval and expose approval/review/auto choices. Editing preserves each saved type and assignee role instead of silently dropping them, and update helpers preserve field-specific types.
- Ticket analytics reads nested rate-limit counts from the actual API return and labels the data Last Hour, matching the query window. The backend agent supplied the previously missing awaiting-first-response count.
- Category parent selection resolves the selected DOM value against real query options, retaining a terms ID from the query rather than asserting arbitrary strings into IDs.
- Page creation excludes trash, while update retains the handler's broader supported status contract. Optional scheduled dates are narrowed before construction. Custom-field null results, Analytics connection nulls, import job nulls and user role result variants are handled explicitly.
- LMS actions retain inferred course IDs from the actual list return. WordPress sync supplies the list query argument object and no longer claims a WordPress version that its connection action never returns. Webhook content type matches the two actual supported MIME values.
- Email template rows use the actual query return type. Removed the unsafe table row cast; backend agent restored its missing subject field and typed registry metadata.

## Verification

First compact-contract compile captured the failing caller sites. After the repairs and first backend regeneration, all remaining Admin errors were in commerce/Events owned by the coordinating agent. The coordinating commerce agent subsequently resolved the last commerce/Events issues and confirmed the integrated Admin typecheck passes. The D01 caller integration is complete.

Targeted existing custom-field/form calculation/template publishing suite: **176 pass, 0 fail, 374 assertions, 4 files**. `git diff --check` passes. Compiler checks validate all corrected query/mutation arguments against generated handler contracts; no new any or suppression was added to hide mismatches.

Browser acceptance remains with root: create/update a KB template, create a multi-type workflow then reopen/save it without losing type or role, select a parent category, and compare ticket analytics with seeded actions in the last hour. This source batch does not claim rendered acceptance.
