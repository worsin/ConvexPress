# Installed target draft migration — 2026-10-05

E07 has committed, backed-up migration receipts for both retained legacy drafts on disposable target4870. Target authoring inventory is now **29 canonical / 0 legacy**. Source4860 remains **74 canonical / 42 legacy** (seven published,35 trash). This closes the target active-authoring conversion batch, not history/import coverage, legacy retirement or the full delivery goal.

## Preservation and installed writes

A storage-inclusive850,093-byte backup preceded both writes (SHA256 `5ec45d352a03b3e3907b8d5e26fb79e679e4699bfe414a3b83f4c669574261c2`). Authorized prepareMigration candidates matched current converter output exactly, including dependency/presentation checks. The write journal recorded acknowledged CAS-bound migrations and exact canonical readback:

| Draft | Accepted revision | Retained original revision |
| --- | --- | --- |
| Legacy migration acceptance, `g184z6f6gsgqkpta4mqzvzrtnx8ery6v` |3→4|`hd8cdjzaxjh09grxtynsgjnv098fpd3y`|
| Structured article migration acceptance, `g18fb63kt7czdf56mta27a1c9d8es2pe` |2→3|`hd8ex2ewy4jjknp0jv3b2v6k558fqgwv`|

Both remain drafts. The original86 revisions,27 unrelated target records, appearance, email queue/templates and all116 source records/385 source revisions compare exactly. Each new original snapshot reconstructs its previous authored content exactly. URL, access, ownership and other non-authoring fields are unchanged. The target now has88 revisions; its23 legacy original revisions are retained recovery data, not failed active migrations. No publication or mail.

## Demonstrated target dependency repairs

Current Electron exposed two older target-backend gaps. Repairs were bounded backports of existing reviewed features into a clone of the target's own installed source; the source backend and target plugins were preserved.

1. Settings returned neither `visibility` nor `hasPassword`, and setSettings rejected visibility arguments. Three registered regressions reproduced the missing fields/validator failure. Backported `f3555274` (contracts, transport and service);87 registered tests/792 assertions and TypeScript passed. The target deploy changed only the two settings signatures;2,369 other signatures were exact. Both actual documents accepted no-op settings writes without revision changes. Electron then rendered settings normally.
2. Private autosave had no installed `canonicalDocuments/drafts` handlers. Backported `f1ac9624`, including the private table, per-author/scope/generation checks, recovery decoder, media ownership and bounded permanent-delete cleanup.93 registered tests/830 assertions and TypeScript passed. The deployment preserved all2,371 previous function signatures and added exactly three public draft handlers plus one internal cleanup handler. No index deletion. The generated API gained only the four expected module registrations/imports.

Each deployment had its own fresh storage-inclusive backup. Settings consumer-index reconciliation completed68 acknowledged operations/63 documents. Autosave reconciliation completed68 consumer operations and6 media operations; both indexes ready,30 media owners. No authoring content writes by reconciliation.

Latest target preservation base: `output/target-autosave-parity-20261005/target-source-installed.json` (1,615 hashed files), snapshot `ConvexPress-Admin/output/production-checkpoints/target-autosave-parity-20261005`. **Use this base for future target deployments.** Source base remains `output/html-import-20261005/deployment-source-final.json`. Do not replace either deployment with the other's full snapshot.

## Native evidence and limitations

Actual owned Electron33.4.11 uses Admin4105, isolated target4870 and owned Website preview4321. The heading and22-node structured article reopen in the canonical editor. Desktop530px and phone388px previews have no horizontal overflow or browser errors; structured text, literal Markdown characters, rich links, table-of-contents anchors and consent-gated YouTube remain intact. The preview bundle is the existing migration-prose-flow build; this is bounded content rendering evidence, not four-pack/full-site visual acceptance.

Private autosave was also exercised in Electron: an unsaved test title reached private generation1/base accepted revision4, with accepted content/history unchanged. Reopening the owned profile offered device and Website drafts; the device choice correctly gated Website recovery. Explicitly discarding the owned device copy and restoring the Website copy reproduced the title. Returning to the original title cleared the private row to generation2 with `draft:null`, without an accepted save or revision. Both documents finished saved, settings available, no autosave warning and no page errors. The test tombstone is deliberately retained to prevent delayed first-write resurrection.

Harness corrections: review comparisons exclude only time-varying display leases while checking fresh validity and exact source/candidate bindings; this first mismatch caused no writes. A structured title is paragraph content, so the initial heading locator was corrected. Unchanged settings buttons are intentionally disabled; API no-op receipt verification was used. A reload dialog handler rejected after the dialog disappeared and exited the first owned process; the server draft survived. Native recovery outcome and cleanup receipts are recorded alongside the batch evidence.

Receipts: `output/target-draft-migration-20261005/{prepared,migration-journal,installed-proof}.json`, paired heading/structured desktop-mobile captures, and `output/target-{settings,autosave}-parity-20261005/` deployment, tests, index and API receipts. Raw backups/baselines and credentials remain private. Native/API sessions signed out/revoked; owned Electron42634/44863 and Website42661 stopped, owned profile removed. Actual migrated drafts, originals and the private-draft tombstone retained. No push.

Next: migrate the remaining source corpus with deliberate treatment of previously hidden raw text, preserve trash/history/recovery, then retire live legacy dispatch only after full coverage.117 Verified /20 In progress unchanged; Task4 and the full goal remain active.
