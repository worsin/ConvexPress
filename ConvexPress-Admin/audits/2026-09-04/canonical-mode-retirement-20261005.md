# Canonical identity without legacy contentMode — October 5

Current canonical save, restore, publication, private drafts and AI context required both blocksVersion2 and contentMode=blocks. Removing the obsolete flag therefore made a valid canonical document unusable. Promotion also required/wrote the flag, and revision restoration synthesized article mode for a canonical snapshot without it.

## Repair

Canonical identity now uses blocksVersion2 plus the existing validated tree, revision CAS, status, resource and authority checks. Current canonical writes clear contentMode; creation, duplication, migration, recovery and promotion no longer populate it. Canonical promotion export omits the obsolete field, while the transport still accepts historical optional mode metadata. Canonical snapshot restoration preserves its actual absence rather than inventing article mode. Legacy initialization/import discrimination and exact archived snapshots/digests remain intact. Schema retains the optional historical field; original installed records are not destructively swept.

## Verification and installed evidence

Evidence: output/canonical-mode-retirement-20261005/.

- Red: removing mode from canonical fixtures exposed17failures across current state/private drafts/AI context; the guard failures matched the intended cause.
- Working tree:307tests/2669assertions across canonical state, documents, drafts, AI, promotion and version/snapshot boundaries pass. Installed source snapshot:288tests/2539assertions; target:257tests/2033assertions. Their differing pre-existing tests/contracts were preserved.
- Backend TypeScript, generated foundation drift, API generation/check and39compiler fixtures per consumer pass. Writer coverage:1480classified writes/30tables, no bypasses.
- Both deployments succeeded after full backups. Public/internal function signatures unchanged: source2394/2394,target2359/2359. Installed hashes1630/1622;108/86extension files and block catalogs/packs exact. Source receipt now additionally tracks its existing shared promotion contract and added draft test; target foundation manifest changes only the affected file hash rather than replacing its catalog.
- Actual source and target owned pages: create/save without a mode, private draft save/discard without accepted-body mutation, publish/read exact public canonical body, return to draft, restore canonical history without mode, and refuse stale writes. Both finish API revision5. The internal AI context endpoint is covered by deployed-source tests; direct public HTTP access correctly refuses. No provider-generation acceptance claim.
- Actual target native Electron: edit title and paragraph, save, reload, verify exact fields and revision6 with mode absent.0page errors, final Save changes disabled. Screenshot inspected. The Website iframe was unconfirmed in this run; this is native authoring/reopen acceptance, not a new live iframe preview claim. Integrated Website/native acceptance remains open.

## Execution corrections and cleanup

First source fixture creation collided with the active consumer-index rebuild (OCC). No blind replay: waited for the same rebuild handle to finish, read the exact original116post corpus, proved the owned title absent and journaled confirmed-not-applied before creating once. A later public call to the internal AI context endpoint refused; resumed the same acknowledged revision2 fixture after exact body/private-draft readback, without repeating its mutations.

Two owned pages and all their revisions/private drafts deleted. Original source116posts/434revisions and target29/88 exact; appearance/mail exact. Backup-based recursive comparison proves all original private drafts and postMeta exact on both sites. API sessions revoked. Owned native96270 signed out/exited/profile removed; user39198/62672/65092preserved. Both consumer/media indexes ready.

Next authoritative bases: output/canonical-mode-retirement-20261005/{source,target}-source-installed.json. Snapshots: ConvexPress-Admin/output/production-checkpoints/{source,target}-canonical-mode-retirement-20261005.

E07 still requires a final retained-field/schema classification and explicit preservation decision; current live mode dispatch is removed. E10 four authored example sites/safe provisioning and the rest of the full goal remain open. No push,117Verified/20In progress unchanged.
