# Image, Gallery, Media + Text and Logo Cloud — September 21

These four blocks now pass acceptance for their current canonical contracts. Total after the tracker update: **26/137 verified; 111 pending.** The original production audit remains eight accepted and sixteen open. This does not establish whole-template, whole-app motion, legacy retirement or release readiness.

## Repairs

Media + Text, Gallery and Logo Cloud used viewport breakpoints inside narrower authored placements. Three failing browser regressions demonstrated squeezed columns even on a wide desktop. Each now uses its actual content container. Media + Text stacks under 50rem while preserving the Journal/Depot owned compositions and desktop ratios; Gallery changes from one to two columns at 37.5rem; Logo Cloud changes from two to four cells per row at 48rem. New wrappers do not change saved data, gallery selection, or resource authorization.

Media + Text now declares the shared action rule: a nonempty destination needs a visible label. A failing-before contract test preserves historical read compatibility while rejecting invalid new authoring. Generated root, backend and Website contracts are synchronized. No block version or stored value was changed.

## Native and deployed acceptance

The owned Electron process 91353 used renderer 4105, a private profile and the isolated Promotion Lab staging database 4860. Its disposable page was `/page/media-family-20260921/`.

- Image: selected existing site media through the actual picker; authored alternative text, caption and destination.
- Gallery: selected two items, authored independent alternatives/captions, set focal position to 0.35/0.65, reordered the items, added/removed a third row, and toggled lightbox. Both specimens intentionally reference the same existing image; independent alternatives, order and cropping distinguish them.
- Media + Text: authored eyebrow, heading, two paragraphs, image and alternative text. A destination with an empty label disabled Save and displayed the field error. Correcting the label restored Save.
- Logo Cloud: authored heading/eyebrow, a text mark and an image specimen, both with real destinations; reordered rows and added/removed a third. The image specimen is a studio photo, not a claim of finished brand identity; BlockDemo supplies the actual styled maker-mark specimen.
- Saved and reloaded the Electron window. All four blocks' values, gallery order/focal point and logo order survived. Reviewed and confirmed publication through native controls.
- Against the strict deployed backend, the original valid draft preview succeeds; removing only the action label refuses both preview and save; correcting it succeeds. The saved document is unchanged. The backend redacts these invalid requests to `Server Error`, so the receipt does not claim a structured field error from the server. Native validation supplies the actionable field message.
- The built Website on 4322 renders all five images with authored alternatives and the exact 35%/65% gallery object position. All four authored links actually navigated to `/products/` and rendered its Shop heading.
- Keyboard opened the real gallery modal; next/previous, Escape and trigger-focus restoration passed. Saving lightbox=false removed both preview buttons while retaining both images; saving true restored the buttons.
- Withdrew publication, reviewed and restored the original editor version, then signed out through the native account menu. The fixture was trashed; all 42 pre-existing page records and appearance values are unchanged. API logout, owned profile removal and owned process cleanup passed. Original Electron/renderer/BlockDemo/SOCKS processes remain running.

## Rendering, regression checks and evidence reuse

Ten focused browser cases passed: three new authored-width cases across all four packs at 420/760/1200 within a 1440px viewport, gallery controls and long captions at 1440/390/844, logo counts 0–5 at desktop/mobile, and actual image decode/identity/alternatives at desktop/mobile. Gallery coverage includes the shared Lightbox Grid consumer. The 297 renderer cases pass, as do four targeted authoring-contract tests, canonical checks/freshness, all 77 kit files and 548-thumbnail catalog checks. Admin, Website, backend and demo typechecks and the Website build pass.

Reviewed current native-authored mobile content, Journal narrow Media + Text, Depot wide Media + Text, Aster narrow Logo Cloud and Core mobile gallery modal screenshots. Layout/copy/control regions remain readable; the long caption scroll area keeps modal controls available. The four-pack browser captures supplement unchanged prior all-example/empty-state and owned-treatment evidence recorded in the tracker. Shared canonical layout/locks/audience/recovery and migrated-version compatibility evidence is reused because those implementations were unchanged. This family adds no continuous animation; reduced-motion cases and actual modal interaction were checked, not a new GPU/frame-rate claim.

Changed-file lint passes. The full Website lint command fails on the pre-existing intentional control-character regex in `src/lib/downloads/serve.ts:47` (`no-control-regex`). That warning is outside this change and remains a separate CI follow-up. Final renderer formatting changes are whitespace-only.

Strict deployment preserved the 1,601-file installed backend snapshot, including all 22 Community Events files. A storage-inclusive backup was taken first; all rows in its six plugin tables match the post-deployment export. No provider account, catalog item, media asset or payment was changed.

Artifacts: `output/media-family-20260921/` contains failing-before/final test logs, native readback, action refusals, saved document, real links/media, lightbox toggle, reviewed screenshots, deployment receipts, plugin comparison and cleanup. An automation-kernel timeout lost the driver handles; the still-running Electron process was reattached by its actual debugging port. The first lightbox locator included an aria-hidden arrow; using the accessible name corrected the harness. Neither is counted as a product defect or a passing interaction before the actual retry succeeded.

Next family: Video, Audio, Embed, Lightbox Grid and Before / after, confirmed in the current canonical inventory. Keep the remaining release and plugin/SDK gates separate.

MagicTables: four existing rows advanced to Verified with Tests/Screenshots and appended scoped evidence. Dry-run matched exactly; readback compared all 137 rows and confirmed 26 Verified with no unintended cell changes.
