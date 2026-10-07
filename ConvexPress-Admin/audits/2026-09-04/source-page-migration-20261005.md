# Source published-page migration — 2026-10-05

Five installed source pages were migrated through the existing draft-only review API and republished. Task 4/E07 remains open. No backend deployment or product-code change was needed for this batch.

## Installed result

Source 4860 now has 116 authoring records: 79 canonical and 37 legacy. Only two legacy records are active (published raw-text archive posts); the other 35 are trash. Target 4870 remains 29 canonical records and 88 revisions, unchanged by this batch.

| Page | ID | Final revision |
|---|---|---|
| Legacy renderer compatibility | g18aar4yrqr91ambn21a957ad18e7n69 | 3 |
| Related content acceptance | g18f48f6q94z55trvpk4cp605x8edwrp | 2 |
| A place to begin | g18b6tkyt00afffjyh57yr1q1n8eca24 | 2 |
| Small rituals | g180ewf0d5pf0ymx01zc5zweh18ed3zc | 2 |
| Room for an idea | g184zcpy5sz6vax7099z1v8y5n8edkb7 | 2 |

Each record was compared with its captured baseline, explicitly withdrawn to draft, prepared against the reviewed conversion, migrated with revision/source/candidate/presentation guards, and republished before proceeding. All 15 writes have acknowledged journal receipts. URLs, original publication timestamps, parent/child structure and all non-authoring fields are exact. Do not replay the journal.

## Preservation and runtime evidence

- Storage-inclusive pre-write backup: 5,132,510 bytes; SHA256 `0a873dc1abae7d071d0e481308e5787082e2b43af7664148c8313682c1af5dfa`. Private data remains outside the repository.
- All 385 prior revisions and 111 unrelated source records are exact. Five original-authoring snapshots and five canonical publication snapshots bring source history to 395 revisions.
- Target records/history, appearance, notification queue and templates are exact. This page batch generated no additional queued mail.
- Before/after actual public pages preserve normalized text, headings, links, images and disclosure counts. Parent/child navigation remains intact. At 390px, the compatibility accordion retains its initial open state, mouse collapse and keyboard expansion without overflow or runtime errors.
- Actual owned Electron review/conversion and Website preview at 530/388px passed on a copy; exact legacy recovery passed. The actual migrated compatibility page reopened in native canonical editing with saved/published status and correct preview content.
- Canonical blocks use current Core template typography and spacing. This is semantic preservation, not pixel-identical legacy styling.
- Both owned copies were deleted through normal page trash/permanent-delete APIs. Native session signed out, API session revoked, owned Electron/Website processes exited and owned profile removed. Actual migrated records and original snapshots remain. Owner processes and the separate pending RSVP fixture were preserved.

Evidence directory: `output/source-page-migration-20261005/`. Key receipts: `migration-journal.json`, `installed-proof.json`, `render-comparison.json`, `native-original.json`, `copy-recovery.json`, `backup.json`, `cleanup.json`. Public before/after desktop captures were visually reviewed. These runtime/preservation checks concern existing migration behavior; no new repository suite was needed for a content-only batch.

## Advisory audit 33

Accepted its E07 status-parity correction and Task 8 deployment ordering requirement: a compatible Website build must precede or accompany backend acceptance of nested list children. Current `core/list` permits children; older Website validation fails the entire document with CHILDREN_FORBIDDEN. A direct converter probe also verifies HTML `_blank` preservation and refusal of an unsupported target (`link-target-proof.json`). D3 recovery guidance remains advisory pending bounded reproduction; no automatic authoring reload or unrelated audit campaign is scheduled.

## Remaining / checkpoint

Next: review the two published raw-text posts whose old bodies were hidden; deliberately choose displayed content, preserve originals, then reconcile the 35 trash records, retained history/references and restore paths before retiring live legacy dispatch. Full Tasks 3–8 and 20 block rows remain open; 117 Verified/20 In progress is not overall delivery completion.

This batch advanced five installed records and preserved their publication workflows. Current goal counter: 13,977,303 tokens / 89,451 seconds; since previous recorded checkpoint: +140,776 tokens / +895 seconds (goal accounting, including runtime/context overhead). Remaining full-delivery duration is not yet defensibly bounded because provider acceptance, four example sites and SDK workflows remain unverified; confidence in any overall estimate is low. Next bounded unit is the two active raw-text posts, followed by a fresh preservation receipt.
