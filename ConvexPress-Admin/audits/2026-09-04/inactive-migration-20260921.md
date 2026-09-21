# Explicit review for inactive legacy block settings — September21

Known layout/lock settings saved by the legacy editor no longer strand an otherwise supported draft. The migration review lists each affected block and its original values. Conversion remains disabled until the author acknowledges leaving those settings inactive; refreshing the review clears that acknowledgement. Unknown fields and unsupported values still refuse conversion. The original source revision retains all settings for recovery.

The server requires `preserveInactiveSettings: true` for a nonempty inactive-settings review, checks the complete source digest/revision, re-derives the candidate and checks its digest and current presentation. Direct writes without acknowledgement, stale settings and denied users are refused. Conversion never silently enables old locks/layout. The pure default converter still refuses inactive intent; `reviewLegacyBlocks` creates the explicit review candidate.

## Verification

- Before implementation, the registered-handler regression failed with LEGACY_CONVERSION_REQUIRED on saved layout. Afterward, all89 document-service tests pass (867 assertions), including no-write refusal, same-source review, stale settings, denied actor, conversion, retained original and recovery.
- All22 focused legacy/staged/content conversion tests pass (1175 assertions). Unknown layout/lock keys, invalid values and unsafe content remain rejected. Existing field-guide treatment/default coverage remains intact.
- All10 actual editor DOM cases pass (165 assertions), covering ordinary migration and acknowledgement-required migration, disabled submit, reset on refresh, exact mutation arguments and reopening. These are component tests, separate from the native proof below.
- Admin/Website and backend type checks pass. Final production Admin build,72 API compiler fixtures, generated contracts, block/kit parity and focused lint pass. Logs are in output/inactive-migration-20260921.

## Isolated native and deployed evidence

Only staging source4860 was deployed, with strict Convex type checking and a private pre-operation export including file storage. The checkpoint preserves its installed generated SDK/plugin graph. The initial writer-coverage gate correctly refused stale coverage fingerprints after the service edit; reviewed coverage was regenerated before the successful deploy.

Owned Electron86724 used the worktree desktop, an isolated private profile, existing renderer4105 and controller4720, visibly selected Promotion Lab staging4860. A single disposable legacy page contained a heading, hidden text, contrast/spacious/full layout and move/remove/edit locks. Native review displayed the settings, refused unchecked conversion and reset the checkbox on refresh. Native conversion completed at revision2. The heading remained editable; an actual edit/save/reload completed at revision3 and the actual Website4322 preview rendered its H2. Native original-editor recovery completed at revision4. Readback matched every original returned field except expected blocksVersion/blocksRevision/updatedAt metadata; unused settings and hidden text matched exactly.

Final review and Website screenshots were inspected. The first owned Electron runner86231 exited on stdin EOF before any migration; the persistent runner above completed the proof. One recovery locator expected a button after recovery, but the app had correctly navigated directly to the original editor; independent readback and the rendered original editor confirmed completion.

The fixture was trashed; all42 original pages compared equal before/after. Native and API sessions signed out, owned profile removed, owned Website/tunnel stopped. Original Electron39198, renderer69634, BlockDemo8172 and SOCKS68390 were preserved. No customer emails, external provider operations or unrelated content mutations occurred.

## Scope

This closes the known inactive-settings migration dead end and this native recovery specimen. It does not establish pixel-identical rendering for every legacy block, arbitrary structured content, mixed-tree capacity, all packs or fleet-wide retirement. Legacy storage/readers remain until those migrations have evidence. Original production audit remains8accepted/16open; full block/template/release acceptance remains open.

MagicTables: one existing Complete Template-Aware Block Library feature Notes cell updated after dry-run and fresh preapply comparison. All15 feature rows read back; no other cells or completion flags changed.
