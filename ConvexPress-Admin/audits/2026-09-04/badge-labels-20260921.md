# Trust Badges labels and media — September 21

**Trust Badges is verified for its current canonical contract.49/137 blocks verified;88 pending.** This completes the label/media gates left in trust-badges-20260921.md. The original production audit remains eight accepted/sixteen open; complete default-template websites, remaining motion and release acceptance remain open.

## Repairs

The label field now declares `authoringNonblank: true`. New saves, previews and publication reject whitespace-only or Unicode default-ignorable-only labels. Valid text, including intentional surrounding spaces and non-Latin scripts, remains unchanged. Historical blank strings remain readable and recoverable. Existing required/optional/nullability rules still determine whether a value must be supplied.

The pure compiler produces shared write-time field rules for both icon choices and nonblank text. Canonical and custom-composed writes enforce these independently of editor controls. Nested objects, scalar/object repeaters, defaults and examples are covered. No stored-content migration or version increment is needed.

Actual built-Website review found an additional defect: Trust Badges' local CSS requested contained images while the Image primitive still declared its default `cover`. Equal-specificity stylesheet ordering made the real Website crop marks even though the demo contained them. The renderer now passes `fit="contain"` through ResolvedImage into the primitive. Removed the competing local object-fit override. Other callers retain the primitive's existing default. A renderer regression checks explicit fit, authored alt text and focal position; actual final public rendering confirms containment.

## Native and backend proof

The old isolated backend accepted a blank-label fixture before deployment. The new native form opened the exact blank value with Save disabled. The operator corrected the label and added a fourth image-backed badge through the actual media picker, using the existing Community ceramics image with authored alternative text and25%75% focal position. Other rows exercised icons and deliberately absent icons/media.

Revision4 saved all four rows. Reload retained labels, alternative text and focal values. Moving the fourth row up saved revision5 exactly equal to the expected tree. Reviewed recovery produced revision6 exactly equal to revision4; publication retained that complete tree as revision7.

The built Website loaded the original1448px image with `object-fit: contain` and the authored25%75% position at1440px and390px. All four labels and rows rendered without horizontal page overflow. Final screenshots were reviewed.

After withdrawal, native recovery restored the original blank-label revision3 as revision9, preserving its exact tree. With the editor idle, six deployed save/preview requests using spaces, zero-width space and bidi-isolate-only text were refused; publication was also refused. The stored document remained unchanged. Original-editor recovery restored the initial empty page, then native/API signout and owned page/revision cleanup completed.

An earlier refusal probe overlapped the intentional native repair save and therefore failed its unchanged-document assertion. It is not acceptance evidence. The final sequential run above retains the assertion and passes. Final deployment/source receipts supersede the initial deployment after adding the owned-mark example to BlockDemo.

## Checks and preservation

- 302 renderer cases/5,234 assertions pass, including explicit contained-image intent.
- 11 pure contract cases,15 generated-form cases through the isolated wrapper, three composed snapshot/authoring cases and nine generator/scaffold cases pass.
- A four-pack browser case checks all13 icons, icon removal, image loading/containment, blank/invisible label refusal, maximum-length labels and desktop/mobile widths. Prior unchanged icon, shared layout, protection and visibility evidence is reused.
- Admin/Website/demo types, client/SSR build, generated contracts, block-kit freshness, focused lint and whitespace checks pass. Four badge thumbnails were refreshed; all548 entries validate. This static block adds no continuous animation or new hardware-performance claim.

Strict final deployment preserves the1601-file snapshot and22 installed Events source files. Final exports compare all six Events tables plus media, mediaSizes and mediaMeta against the backup. All42 pre-existing pages, appearance values and11 media records remain unchanged. Owned Electron21788, its profile, browser, preview4322, SSH14860/14861 and API/native sessions were closed; original user processes remain running.

MagicTables updates only the existing Trust Badges row after exact dry-run comparison; all137 rows were compared afterward. Artifacts: `output/badge-labels-20260921`, including final source/deployment receipts, historical/corrected/reordered/recovered/published documents without display leases, final refusal results, public image checks, screenshots, preservation, cleanup and tracking readback.
