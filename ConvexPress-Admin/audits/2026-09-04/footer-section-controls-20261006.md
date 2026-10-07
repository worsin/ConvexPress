# Footer section layout delivery — 2026-10-06

## Failure and repair

The section footer exposed six column layouts, four backgrounds, four borders and three padding choices. Actual component tests reproduced 16 failing groups: Core treated Minimal as one column and ignored Image; Journal/Aster hard-coded four columns, ignored accent/image backgrounds and all top-border choices; Depot additionally ignored padding. All four kept newsletter/contact in Minimal although the existing native preview defines Minimal as branding plus navigation.

A shared FooterSectionFrame now renders the section background, decorative public media and top border, and a shared column mapping implements one through four columns, centered stacking and a wrapping Minimal layout. Minimal omits newsletter/contact as the existing preview specifies. Pack-owned typography and spacing scales remain; Depot now consumes its padding choices. Core newsletter input can shrink inside narrow columns. Authored rows continue to own their independent presentation, and dashboard minimal variants retain their existing behavior.

Background Image was stored but had no editor control. Added the field to the portable schema and native section schema, connected native MediaField, and reused the on-site paginated ImageSetting. Selected images use the existing public MediaImage, an empty alt, hidden decorative wrapper, cover sizing and a subdued layer over the site background. No assets were modified or uploaded. No backend change or deployment.

## Evidence

- Red tests: 16 failing component groups plus missing image schema field. Green: 84 component/control cases, existing 80 authored-row cases, schema parity and structured footer editor tests. Native editor regression suite passes 3 tests. Existing Core/footer copyright/menu-descendant regressions pass separately.
- Both Website and Admin TypeScript and production builds pass; changed-file lint has zero warnings/errors. Existing build chunk/deprecation advisories remain distinct from checks failing.
- Actual components with controlled source hooks and built production CSS: 136 browser cases (4 packs × 17 values × 2 widths). Verified numeric column counts, centered alignment, Minimal content gates, distinct backgrounds and border colors/widths, ordered padding values, loaded image dimensions, visible links and no horizontal overflow. This fixture matrix is rendering proof, not four fresh native publications.
- Actual isolated Electron on disposable staging4860: selected existing Community ceramics image through the library, set Image/Centered/Accent/Spacious, reviewed and published. API snapshot stayed exact until publication, then only Core footer.layout changed. Sparse settings storage is expected; defaults are resolved by consumers.
- Actual Website1440/390: selected public image loaded, decorative/hidden with empty alt, centered content, 2px border, 64px/48px padding, no overflow. Phone viewport screenshot visually inspected with the footer scrolled into view. Initial full-page screenshot did not paint below-viewport content reliably; it is not the visual proof.
- On-site authorized editing: matching image selected in media picker, No image removes preview image, Undo restores it, field search retains the picker. Closed/discarded and ended website editing; browser error log empty.
- Native automation briefly returned an old Electron window snapshot after a retained helper. Rebinding the explicit acceptance app path showed the correct Core draft and Image selection. No publication was attempted from the stale snapshot.

## Preservation and cleanup

Appearance values restored with the exact owned publication revision guard; all43pages, general/reading, menu locations and API-actor drafts remain exact. No content/media fixtures created. Normal revision/audit notification metadata advanced. Native Live scope restored and sign-out observed. API revoked and refresh returned401. Owned native63572, Website63598 and static server63555 stopped; private profile/session/handoff removed, tab32closed and viewportreset. Seven protected processes preserved. No push.

Evidence: output/footer-section-controls-20261006/ (red/image-red/green/regressions logs, builds/types/lint, browser-receipts.json, native-receipts.json, published-receipts.json, published-footer-390.png, onsite-picker.png, restoration.json, cleanup.json).

## Remaining scope

E94 closes the section layout controls and image selection/publication path above. It does not close E09/Task5. Next: section branding enablement, legal-link choices/menu sources and remaining row/cell controls. Reuse E81/E90–E94 instead of repeating accepted publication/picker matrices. Other full-goal tasks and the137block tracker remain117Verified/20In progress.
