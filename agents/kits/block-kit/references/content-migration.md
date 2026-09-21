# Content migration and retirement boundaries

There are two separate surfaces: a pure captured-record conversion/preflight
pipeline and a deployed, authorized document migration API. Do not treat a pure
candidate as proof that the deployed API can commit it.

## Captured-record preflight

From the root containing `blocks/`:

```sh
bun scripts/blocks/preflight-content.ts INPUT.json OUTPUT.json
```

Input contains `capturedAt`, `sourceScope: {websiteKey, instanceKey}`, `packId` and
`records` (at most 100 captured document records within eight MiB). Use distinct
input/output paths in a private acceptance directory when records are private.
The CLI writes a report, never application content. `activationAllowed` stays
false. `requires-render-acceptance` identifies a candidate; `requires-conversion`
is a blocking source/converter issue and produces a nonzero exit.

Read `scripts/blocks/content-migration.mjs` for visible-source precedence and
`staged-migration.mjs` for versioned attrs/treatment/reference conversion.
`originalRevision` retains the source while the candidate and legacy render
projection are compared. Unknown fields and unresolved IDs are not disposable.
No cross-site/customer identity mapping is inferred.

## Deployed migration

Authoritative source:
`ConvexPress-Admin/packages/backend/convex/canonicalDocuments/service.ts`,
`prepareAuthoredMigration`, `prepareMigrationDocument`, `migrateDocument`.

The current write path supports eligible draft legacy rich-text documents,
legacy block trees, page sections, and bounded structured articles, following the
Website's visible-source precedence. Structured conversion preserves visible hero,
manual table-of-contents links, topic anchors, summary, sources, media references
and consent-gated video. Hidden sources stay in the original revision. It refuses
unsupported structured fields, duplicate anchors, capacity overflow, distinct unsaved autosaves,
unknown authoring versions, and saved inactive layout/lock intent that would
silently become active. Do not bypass those refusals.

September 20 acceptance on disposable target 4870 proved a heading page's native
review, conversion, reload, actual Website rendering, and recovery to the original
editor with all returned page fields preserved except revision/update metadata.
This is one live block case, not acceptance of all legacy schemas or sections.
See `output/legacy-migration-service-20260920/acceptance-review.md`.

A separate Core article fixture completed native review, conversion to 22 blocks,
Website desktop/mobile rendering, and original-editor recovery at revision 2.
Every original returned field matched except the expected version/revision/update
metadata. This proves the bounded fixture's content recovery, not pixel-identical
legacy styling or complete structured-article migration. See
`output/structured-migration-20260920/acceptance-review.md`.

1. `canonicalDocuments:prepareMigration({postId})` returns source `revision` and
   `authoringDigest` plus a projected canonical candidate.
2. Review the candidate in its actual pack and retain before/after evidence.
3. `canonicalDocuments:migrate` takes `postId`, `expectedRevision`,
   `expectedAuthoringDigest`, `expectedCandidateDigest` and
   `expectedPresentationRevision`. Use the exact values from that reviewed result.
4. Read `canonicalDocuments:get` and `canonicalDocuments:pageRevisions` to verify
   the committed revision and original recovery source. Test
   `canonicalDocuments:recoverLegacy` in a disposable target using its selected
   `revisionId` and current `expectedRevision`; recovery is a new checked write.

Do not replay an uncertain mutation blindly. Compare the current revision, digest
and revision history with the reviewed operation. Never delete retained legacy
source simply because the newer renderer can render a freshly created example.

Local conversion checks, from repository root:

```sh
bun test ./scripts/blocks/content-migration.test.ts ./scripts/blocks/staged-migration.test.ts ./scripts/blocks/legacy-block-migration.test.ts ./scripts/blocks/legacy-section-migration.test.ts
bun run check:blocks-migration
```

Local checks cannot substitute for complete installed-data preflight, native
authoring recovery and rendered acceptance in every environment to be migrated.

`check:blocks-migration` is also a retirement gate: it exits nonzero while staged conversions or old/new schema differences remain, even when every schema is representable. Inspect `pendingRenderAcceptance`, schema/default differences and conversion issues; do not remove the gate to make a docs check green.
