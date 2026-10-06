# Appearance promotion with media — October 6, 2026

Task5/E82 remains open. Current Customizer staging promotion copies a raw appearance snapshot with `settings/templateDrafts:publish`. A selected footer image uses a source-local media ID. A registered-handler test with two independent Convex test databases proves this shortcut rejects the promotion with MEDIA_UNAVAILABLE and leaves the live snapshot unchanged. The earlier Journal/Depot native receipts used settings without such references and do not prove media-bearing appearance promotion.

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

## Next implementation, without scope reset

1. Reuse PromotionReviewPanel from Customize under the control-plane Convex client. Initialize an appearance-only selection and bind the currently selected staging environment; retain explicit destination, access checks, receipt recovery, separate media consent and live apply confirmation.
2. Remove the direct snapshot-copy implementation after replacement. The template snapshot/section types remain useful to local publishing and activation.
3. Preserve dirty/conflict handling when opening the review. Scope changes must dispose the embedded review; source and target edits after review must require a fresh review through the broker's existing checks.
4. Verify native media-bearing promotion, target-owned attachment/readback, current Website image rendering, source/target preservation and cleanup on disposable independent databases. Deploy controller only through a reviewed snapshot preserving all installed functions.

Claude audit45 remains latest observed/already adjudicated. This is a demonstrated delivery dependency, not a broader infrastructure audit. No push; goal remains active.
