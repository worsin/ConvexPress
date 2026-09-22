# Trust Badges icon validation — September 21

The icon-contract mismatch is repaired and verified. **Trust Badges remains In progress;48/137 blocks are verified.** A separate deployed-preview check confirmed that whitespace-only badge labels are still accepted. Owned-media and complete presentation acceptance also remain open. The original production audit remains eight accepted/sixteen open.

## Change

Trust Badges now declares the13 names supplied by the Website icon primitive. For this existing open-name field, `optionsMode: "authoring"` constrains new edits without changing the historical stored-string schema. The generated editor shows unsupported saved values explicitly, disables saving, and lets the operator replace or remove them. A supported value never displays an unsupported-value option after correction.

The shared compiler validates examples/defaults and produces bounded write-time paths. Object fields, object repeaters, scalar repeaters, optional values and nullable values are covered. Canonical and custom-composed authoring enforce the same rules independently of the editor. Existing strict icon option lists retain their previous behavior. Reading and draft recovery preserve historical values; nothing silently sanitizes or rewrites stored content. No storage version was changed.

## Actual backend and native behavior

Before deployment, the old isolated staging backend accepted `old-provider-mark` on an owned draft, establishing the original defect. The updated native editor loaded that exact value and showed `Unsupported: old-provider-mark` with Save disabled. After strict deployment, save, preview and publication refused it and preserved the stored document.

The native selector replaced it with `book-open`, preserving the other two rows, including the intentionally icon-free row. Revision4 saved the correction. Reload retained it; a native item move saved revision5. Reviewed recovery produced revision6 exactly equal to revision4. The corrected page published and rendered under the actual built Website, with two decorative SVGs, three labels and no desktop/mobile overflow.

After withdrawal, native recovery restored historical revision3 as revision9, retaining the unsupported icon and its original label. Save remained disabled, and deployed save/preview/publication were refused again. Original-editor recovery then restored the initial empty document. Native/API logout, owned page/revision deletion and process/profile cleanup passed. All42 original pages and appearance values are unchanged; the six installed Events plugin tables match their backup. No media was created or modified in this batch.

## Verification and limits

- Nine pure contract cases/11,012 assertions, including stored-read/new-write separation, nested paths, scalar rows, defaults, examples and nonmutation.
- Fourteen generated-form DOM cases through the isolated wrapper, including an unsupported historical selection and explicit correction without stale unsupported text.
- Three custom-composed snapshot/authoring cases and nine generator/scaffold cases pass.
-301 unchanged renderer cases pass. A focused browser case exercises all13 choices in all four packs, icon removal, maximum-length labels and desktop/mobile width. Representative actual-public screenshot reviewed.
- Admin/Website/demo types, Website build, canonical/kit freshness, focused lint and whitespace checks pass. Typechecking caught a missing `EditorField.optionsMode` declaration; the generator was corrected and final types pass. This declaration-only correction followed the staging deployment and has no emitted runtime behavior change.

The initial new contract-test attempt failed because it imported the root generated schemas outside their dependency workspace; its corrected import uses the staged backend package. That initial harness error is not claimed as a product regression. The old deployed write above is the failing-before product evidence.

MagicTables receives one Notes-only update with all137 rows compared after dry run. Status, Tests and Screenshots flags remain unchanged. Artifacts: `output/trust-badges-20260921`, including deployment/source manifests, historical/corrected/recovered documents without display leases, refusal receipts, label finding, browser/native screenshots, tests, cleanup and tracking readback.

Next: reject whitespace-only badge labels without preventing recovery of old content, then finish owned-media and presentation acceptance before advancing the block's status. Full template websites, remaining blocks and production release gates remain part of the active goal.
