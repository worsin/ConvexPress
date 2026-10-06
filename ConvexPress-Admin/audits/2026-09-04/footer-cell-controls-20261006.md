# Footer cell controls — October 6, 2026

E96 completes the presentation repair batch under Task 5. E09 remains open and the overall goal remains active, with 117 Verified / 20 In progress blocks.

## Workflow, cause and repair

Authors must be able to align footer cells, show contact icons and size images without breaking narrow layouts or the editor. Actual component tests produced 34 failing groups: all packs ignored cell alignment; Journal/Aster ignored contact showIcons; oversized images had no column bound; Core emitted raw media IDs as image sources while media was missing/loading.

Shared FooterImage now uses the existing MediaImage loading/missing behavior for IDs, preserves direct HTTP(S) images, authored alt/link/width, and bounds both image and link to the column. Core cells also have min-width:0 and the newsletter input can shrink. Shared footerCellAlignment implements explicit cell → column → inherited row presentation. Native and on-site editors expose Content alignment for every cell, including Inherit; changing it preserves cell content. Journal/Aster contact fields now render optional decorative icons. The Social editor hint points to the actual Social menu assignment.

Native Journal verification exposed a further causal defect: opening a supported URL-backed image passed the URL into MediaField's media-ID query and crashed the page. The footer image editor now edits existing URLs directly and offers an explicit switch to the library. This is confined to the footer consumer; MediaField's ID-only contract is unchanged.

## Evidence

- 40 actual-component cases across four packs: icon on/off, all alignments, cell-over-column precedence, direct URL/stored/missing/loading images, alt text and width bounds.
- Existing footer content/row/section regressions pass. Native editor tests exercise alignment changes and Inherit while preserving text. Existing URL image editor renders without a media query/provider. Four native editor tests,48 assertions pass.
- Both app type checks and production builds pass; changed-file lint and diff whitespace checks pass.
- Eight production-CSS browser checks (4packs ×1440/390): computed text/flex alignment, loaded 1200px image bounded by column, contact icons and no horizontal overflow. Aster phone screenshot inspected.
- Actual isolated native Journal on disposable4860: prepared two-cell appearance fixture; edited contact alignment/icons and image alignment. The original URL editor error reproduced, then Try Again recovered after repair. URL, width and content retained; Review → Publish showed Everything published. Native API readback matches exactly the three requested cell changes; other changes are footer default materialization by the existing builder.
- Actual published Journal at1440/390: centered contact,3icons,right-aligned loaded image bounded by column,no overflow. Public DOM/computed geometry receipts saved. The narrow actual-page screenshot was compositor-scaled and is not used as visual proof; the production-CSS screenshot is the readable visual reference.

Evidence directory: `output/footer-cell-controls-20261006/`. `red.log`, `tests.log`, `native-editors.log`, both type/build logs, `browser-receipts.json`, `native-receipts.json`, `published-receipts.json`, `restoration.json`, `cleanup.json`, `cell-controls-390.png`.

Original appearance values restored with exact revision guard; all43pages,general/reading/menu locations/API draft slots unchanged. Native original Live selection restored/sign-out verified; API logout then refresh401; owned66590/66591 and fixture66409 stopped; private profile removed;tab34closed,viewportreset;7protected processes alive. No content/media mutations, backend deployment, live publication or push.

## Next required behavior: E97 newsletter audience

1. Required workflow: an authored footer newsletter cell with an audience selection subscribes to that audience and preserves its consent/source semantics.
2. Evidence: FooterCellEditors exposes audienceId. Core/Depot NewsletterCellRenderer and Journal/Aster NewsletterForm omit it. emails/mutations.subscribeNewsletter only accepts email/source and writes newsletterSubscribers.
3. Dependency: an existing installation-owned mailingLists/mailingListSubscribers system exists, but its subscriber schema requires sourcePostId/sourceBlockId/sourceRevision. The leadMagnets source/digest/consent path is post-bound. A footer is not a post.
4. Repair boundary: reuse owned mailing lists and their active/consent/suppression rules; define a footer source tied to published template configuration, connect the native/on-site selection and public form, preserve unrelated lists/customer identity, and address cross-environment resource mapping. Do not pretend arbitrary provider-list IDs work or introduce a parallel provider subsystem.
5. Exit: actual native audience selection, public signup into the intended installation/list with recorded consent/source; invalid/unpublished/stale/foreign/inactive targets refused, unsubscribe/suppression behavior preserved, content/promotion resources safe. Keep default no-audience subscription behavior compatible.

This remains a demonstrated defect to implement, not an external prerequisite or reason to stop work. Reuse E93–E96 presentation/lifecycle evidence.
