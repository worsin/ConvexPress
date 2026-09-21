# Disclosure and tab family — September 21

**Accordion, FAQ, Tabs and Feature Tabs are verified for their current canonical contracts. Total14/137 verified;123 remain pending.** Tabbed Content was reviewed in the same family but remains unverified because its legacy CTA URL authoring contract accepts destinations rejected by the renderer. Original production audit remains eight accepted and sixteen open.

## Repairs and evidence

The new five-block BlockDemo study checks Core, Journal, Depot and Aster House at1440/390px. It reproduced standard Tabs moving in the wrong direction under RTL. The shared primitive now derives forward/backward arrows from computed reading direction; Home/End, wrapping, roving focus and panel associations remain intact. This is covered by failing-before and passing-after real browser checks.

Valid maximum unbroken disclosure text produced horizontal overflow exceeding32,000px. The shared Accordion and Tabs panel styles now wrap that text. Feature Tabs and Tabbed Content labels also constrain their width to the scrollable tab bar and wrap rather than creating one oversized inaccessible label. Normal tab bars still scroll; selected labels remain fully visible when reached by keyboard. Existing default typography, colors and pack-owned FAQ renderers are preserved.

Two focused browser cases pass across four packs/two widths: native details Enter/Space, multiple expanded items, default selection, out-of-range default index, FAQ newlines, LTR/RTL tab navigation, Home/End/wrap, tab-to-panel focus, unique relationships, resolved images, empty recovery and maximum-content bounds. These cases render all five blocks. Selected desktop/mobile screenshots from each pack were inspected. The existing renderer and primitive suites pass (12 outer tests/99 assertions, including the complete canonical renderer harness). Website and BlockDemo types/builds, generated-source checks, focused lint and whitespace checks pass. Existing build chunk-size warnings remain.

The disclosure icon retains its small transform transition. Actual reduced-motion browser inspection returns0s. Tabs switch directly without adding a layout animation. This is scoped interaction/reduced-motion evidence, not a claim of exhaustive hardware profiling.

## Native authored-content acceptance

Owned Electron29209 used renderer4105, its own profile and isolated Promotion Lab staging4860. Page `g187s39q8hmk0dannqcmchy4ns8etees` was created empty, initialized through Use block editor, and all five blocks inserted through the catalog.

| Block | Native and public evidence |
|---|---|
| Accordion | Heading/intro, three title/body pairs with line breaks, default-open index1 and compact layout. Negative index blocks saving; correction recovers. Saved public page initially opens the second item; keyboard opens another independently. |
| FAQ | Eyebrow/heading/intro, two question/answer pairs with line breaks, save/reopen and public disclosure behavior. Four-pack browser study includes Journal/Depot owned treatments. |
| Tabs | Three labeled text panels with line breaks, heading and compact layout; exact first body survives reopen. Published Home/End, one active panel and matching ARIA association checked at both widths. |
| Feature Tabs | Required label, title, rich text, authorized existing image selection and text-only second panel. Alternative text and focal-point0.35/0.6 survive save/reopen. Out-of-range1.1 disables save. Actual published image decodes and computes35%60% positioning at both widths; panel keyboard behavior passes. |
| Tabbed Content — not fully accepted | Heading/intro, two panels, image/alt, text and CTA are saved/reopened and published. Actual CTA navigates to the existing BlockDemo Fieldwork page and renders its H1. An invalid CTA URL remained authorable; full signoff is withheld as described below. |

Authoritative saved-document readback contains all five blocks and resolved media. Shared layout, protection and audience policies are separately covered by core-text-layout, block-locks and block-visibility acceptance. No schema, block version, backend deployment or provider operation was changed for these renderer repairs.

## Remaining concrete defect

`blocks/tabbed-content/block.json` declares `tabs.*.ctaUrl` as text. Entering `javascript:alert(1)` in the native editor leaves Save enabled; the Website primitive rejects that destination and no usable CTA appears. The invalid draft was corrected before any save/publication. This is an authoring/render contract mismatch, not evidence of executable script injection. A safe existing-page URL saves and navigates correctly.

Next action: align URL and accessible-label validation with the renderer through the canonical contract/compiler and compatible saved-content handling. Prove invalid-draft retention, disabled save, correction, native/public success and migration behavior. Do not simply add a field-name heuristic or silently rewrite stored invalid values. Keep Tabbed Content status unchanged until this closes.

## Cleanup and tracking

Native withdrawal/original-editor recovery restored the empty editor. Fixture trashed; all42 pre-existing pages and complete appearance identity/values match baseline. Native pointer logout and API logout succeeded. No native page errors were captured. Owned browser/Electron/preview/demo/tunnel processes and profile were removed; original user processes preserved.

Four block rows advance to Verified with Tests/Screenshots and evidence. Tabbed Content receives only an appended finding; its completion flags remain unchanged. Fresh standalone MagicTables health/base/schema reads, probe-first dry runs and full137-row comparison preserve every unrelated cell. Five blocks have fresh thumbnail receipts under all four packs; unrelated receipts unchanged.

Artifacts: `output/disclosure-family-20260921/` contains browser failures/successes, native/public images, saved-document and cleanup receipts, builds, checks and tracker readbacks. Full templates, remaining123 blocks, installed-fleet migration retirement and production release remain open.
