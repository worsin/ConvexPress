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
unknown authoring versions and unknown layout/lock fields. Do not bypass those refusals.

Known saved layout and lock settings that the old renderer/editor ignored are now
listed in `prepareMigration.inactiveSettings`. Review them in Electron and explicitly
acknowledge leaving them inactive before conversion. The write requires
`preserveInactiveSettings: true` when this list is nonempty; source/candidate/presentation
bindings still apply. The canonical candidate does not activate those settings; the
complete original revision retains them and supports exact original-editor recovery.
Refreshing a review clears the acknowledgement. This is not permission to drop unknown
fields or to activate old settings by copying them onto the canonical envelope.

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
   Include `preserveInactiveSettings: true` only after the explicit inactive-settings
   review described above; a pure conversion does not provide that acknowledgement.
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

September21 isolated source4860 acceptance completed native acknowledgement/reset,
conversion, edit/save/reopen, actual Website H2 rendering and original-editor recovery
for a legacy heading with unused layout and all three locks. Every original returned
field matched except expected revision/update metadata. The other42 pages were unchanged
and the fixture was trashed. See
`ConvexPress-Admin/audits/2026-09-04/inactive-migration-20260921.md`.
Broader structured/mixed-tree/render parity and installed-fleet retirement remain open.

Paragraph v2 now accepts up to20,000 authored text characters. Original TipTap
paragraphs and structured article paragraphs above the former2,000-character
limit retain their paragraph boundary, marks, hard breaks and links through the
existing migration API. Unknown fields, unsafe links and the document byte/node
limits still refuse conversion; no truncation or artificial paragraph splitting
is permitted. Native conversion/edit/save/publish/withdraw/original recovery on
isolated4860 is recorded in `ConvexPress-Admin/audits/2026-09-04/paragraph-migration-20260921.md`.

October5 plain-text import is an explicit review path, not ordinary migration.
`prepareMigration.importedContent: "plain-text"` warns that the original renderer
may not have displayed the stored text. Review the literal candidate and acknowledge
import into the draft; `migrate` requires `acknowledgeTextImport: true`. Refresh
clears the acknowledgement, independently of inactive-settings review. Words and
line breaks are retained without Markdown/HTML interpretation; CRLF/CR normalize
to canonical line breaks while the exact original remains recoverable in history.
Ambiguous malformed JSON still requires its own lossless adapter. The supported
HTML import subset and its independent acknowledgement are described below.
Source4860 native conversion/desktop-phone preview/exact original recovery and
installed refusal evidence: `ConvexPress-Admin/audits/2026-09-04/plain-text-import-20261005.md`.
This proves one owned draft copy, not bulk conversion or legacy retirement.

HTML review now returns `importedContent: "html"` for supported paragraphs,
headings, inline marks, line breaks and links. Review the editable candidate and
explicitly acknowledge `acknowledgeHtmlImport: true`; plain-text acknowledgement
does not authorize HTML. Refresh resets it. Unknown authored tags/attributes,
parser repairs, unsafe links and limits refuse the complete operation without
stripping content. The exact original remains in recovery history.

October5 captured corpus conversion reaches source42/42 legacy documents and
119/119 legacy revisions; target2/2 and21/21. These are candidates from the
September29 snapshot, not installed migration receipts or reference acceptance.
Native owned-copy HTML review/conversion/reload/desktop-phone semantic rendering
and exact original recovery: `ConvexPress-Admin/audits/2026-09-04/html-import-20261005.md`.
Refresh the installed inventory and prove dependencies/per-record migration before
retiring legacy dispatch; never silently activate hidden published bodies.
