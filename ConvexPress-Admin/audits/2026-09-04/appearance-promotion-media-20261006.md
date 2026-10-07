# Appearance promotion with media — October 6, 2026

Task5/E82 is repaired and verified by the native acceptance below. The former Customizer staging promotion copied a raw appearance snapshot with `settings/templateDrafts:publish`. A selected footer image uses a source-local media ID. A registered-handler test with two independent Convex test databases proves this shortcut rejects the promotion with MEDIA_UNAVAILABLE and leaves the live snapshot unchanged. The earlier Journal/Depot native receipts used settings without such references and do not prove media-bearing appearance promotion.

## Dependency boundary and first implementation

- Failed workflow: publish an appearance with an uploaded image on staging, then promote that snapshot into another live database.
- Cause: `prepareTemplatePromotion` copies settings directly; it does not use the existing verified media transfer, reference remapping and reviewed content apply protocol.
- Repair boundary: reuse that protocol for appearance settings and their resource closure, preserving unrelated live general/reading settings, menu assignments, content and identity. Keep reviewed transfers, live confirmation, source/target conflict checks and recovery.
- First implementation: additive optional `includeAppearance` selection in the shared contract, site export and broker review API. It exports only appearance.template plus its references when full `includePresentation` is false. Existing full-presentation behavior remains unchanged and includes appearance once. The broker refuses omitted appearance or unrequested general/reading settings.
- Exit check still required: replace the raw Customizer shortcut with the established review/media-transfer/apply UI, deploy matched site/controller contracts, and pass actual native staging image → review/transfer → live rendering, drift/refusal/retry and preservation checks. E82 is not closed by the backend work below.

A source route policy does not force an appearance-and-media-only promotion to replace access rules. Adding an authored page or other route-sensitive dependency still requires policy selection; the regression proves the page case remains refused. Target policies and menu assignments are untouched by this mode.

## Current evidence

The new two-database regression first failed on the unsupported selection flag. It now exports exactly media + appearance, transforms the footer ID into a portable reference, verifies transferred bytes with the existing protocol, applies a target-owned media ID/storage binding and preserves source snapshot plus unrelated target state. Full-presentation selection still includes general/reading/appearance exactly once. A source policy was added to reproduce and repair the unnecessarily coupled route-policy requirement; adding a page retains the original refusal.

Backend promotion/draft suites:119tests/765assertions. Broker review/apply/media-transfer suites:64tests/429assertions, including failing-before omission and unrelated-settings cases. Backend, controller and shared-contract TypeScript pass. Scoped lint has the same5warnings as HEAD (two unused imports and three existing string-regex preferences); no new lint warning, no all-green lint claim.

Ignored evidence: output/appearance-promotion-20261006. Strict deployment succeeded on the isolated4922 trial after repair below;2,394function signatures retained, no additions/removals, only exportManifest arguments changed. Receipts: extension-deployment.json, deploy.log and function-delta.json. The controller API change is locally typechecked/tested but not yet deployed; source4860, target4870 and controller4720 are untouched. The owned trial container was restored to exited, with its volume retained; no API session was created. The first isolated deployment attempt failed because the copied snapshot's package symlink still resolved the prior contract. That owned symlink was corrected to the copied current contract and the attempt log retained. No shared runtime or source/target database was changed by that failed attempt.

## Implementation checklist from the first backend commit (completed below)

1. Reuse PromotionReviewPanel from Customize under the control-plane Convex client. Initialize an appearance-only selection and bind the currently selected staging environment; retain explicit destination, access checks, receipt recovery, separate media consent and live apply confirmation.
2. Remove the direct snapshot-copy implementation after replacement. The template snapshot/section types remain useful to local publishing and activation.
3. Preserve dirty/conflict handling when opening the review. Scope changes must dispose the embedded review; source and target edits after review must require a fresh review through the broker's existing checks.
4. Verify native media-bearing promotion, target-owned attachment/readback, current Website image rendering, source/target preservation and cleanup on disposable independent databases. Deploy controller only through a reviewed snapshot preserving all installed functions.

Claude audit45 remains latest observed/already adjudicated. This is a demonstrated delivery dependency, not a broader infrastructure audit. No push; goal remains active.


## Native completion and final implementation

The Customizer now embeds the existing PromotionReviewPanel under the controller Convex provider. It opens with appearance-only selected and the current staging environment; general Sites promotion keeps its prior empty selection and closed state. Scope changes unmount the embedded review. Opening remains disabled for dirty/conflicting local drafts. The panel states that only published staging appearance is included. Existing capability checks, durable receipts, explicit media consent, final live confirmation and recovery remain shared. The raw ConvexHttpClient snapshot-copy helper and its obsolete tests were removed; local snapshot/section types remain.

The new mounted component regression first failed because the appearance control was absent. It now verifies controller client routing from a site-provider parent, current staging selection among multiple options, appearance-only action arguments, reset/environment change behavior, denied access, live-scope removal and unchanged general promotion defaults. Focused UI suites pass:37tests/168expect assertions, plus Node assertions inside the isolated mounted fixture. Admin types and production build pass; four changed production UI files have zero lint warnings/errors. Website production build passes. Existing backend/broker proof above is reused.

Matched source4860, target4870 and controller4720 snapshots deployed with strict type checking after storage-inclusive private backups. Every baseline hash was verified before copying; the overlays change only the appearance flag/export/policy and generated writer fingerprints. Sealed inventories retain2,394/2,359/210functions respectively, no additions/removals. Only the site exportManifest and controller preview selection signatures changed. Both media and reusable-consumer indexes finish ready; rebuilding them writes no authored content.

Native acceptance used a separate Electron profile and the actual Customizer:

1. Published a fixture footer image in source appearance. Initial native review contains exactly two authored records, media and appearance; application is blocked until the bytes have a verified target copy.
2. Explicitly confirmed the single-file transfer, then created an updated review. Transfer alone did not apply appearance.
3. Changed live appearance after review. Native final confirmation was rejected with “Production content or dependencies changed after review.” Readback proves the concurrent live snapshot stayed exact.
4. Started a fresh native review and reused the existing verified copy without another upload. Explicit final confirmation succeeded: receipt p9774xpgm4fjvfxb7meh79e9g58fsdy6, one dispatch, two target items.
5. Authenticated readback proves the target uses its own media ID/storage, source and target image bytes have equal SHA-256, and target appearance equals source after exactly that ID remap. Staging snapshot remains exact. Both sites' complete page lists, menu assignments, general and reading settings remain exact.
6. Current production Website build renders the target-owned image from4870: natural240×80, visible width240, complete=true. Native receipt and Website captures are retained.

Cleanup restored both original appearance values through normal revision-checked publication; settings revision/audit metadata changed normally. Fixture media in both sites was moved to recoverable trash. All temporary API sessions were revoked (refresh401), the synthetic controller sessions signed out normally, original Live scope restored, owned Electron/Website processes stopped and private native profile removed. Seven protected processes remained alive. Durable review/transfer receipts and storage backups remain for diagnosis; no push.

Preflight caught stale generated media/consumer fingerprints before deployment; regeneration was limited to those owned snapshots and the matching worktree files. Acceptance harness corrections (menuLocations is a menu query, applyState is the receipt field, media status is trashed, and the external Website output needs its dependency symlink) are not product failures. The target's stale media index was rebuilt before fixture cleanup. Initial setup output is not accepted workflow evidence.

Evidence: output/appearance-promotion-20261006/{installed-source-proof.json,native-drift-refusal.txt,drift-preserved.json,native-applied-receipt.json,applied-proof.json,live-footer-image.png,native-applied.png,restoration.json,cleanup-fleet.json,runtime-cleanup.json}. Latest Claude audit46 reports no new findings; accept its E82 exit criterion, now met by this evidence. Overall delivery remains active at117Verified/20In progress; this closes E82 only, not the rest of Task5 or final integration.
