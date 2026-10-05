# Article flow after canonical migration — 2026-10-05

Accepted for the bounded prose-flow repair; E07 remains open.

1. Required workflow: converted prose documents must read as continuous articles in the actual Website, including native preview.
2. Evidence: migration-nested-list-20261005 desktop/phone captures show large padding between each heading/list/code/divider. Paragraphs alone use the SDK prose-flow flag; those other text renderers omit it.
3. Dependency: prepareBlocks selects standalone Section padding unless the renderer declares prose flow or an author supplies explicit layout spacing.
4. Repair boundary: use the existing prose-flow mode on Heading/List/Code/Divider, sharing paragraph spacing. Keep every explicit spacing choice authoritative; no attrs/version/backend mutation. Non-text marketing sections remain unchanged. Layout container gap ownership remains intact.
5. Exit check: mixed-source regression goes from1 to5 prose-flow wrappers, explicit spacious remains5spacious sections; all renderer/pack examples pass, actual native Website preview has no default section padding or horizontal overflow and preserves content. Clean owned fixture/profile/processes and source baseline.

Red: expected5prose-flow wrappers, received1. Green: existing renderer suite passes, including explicit-spacing assertions.

## Actual runtime and cleanup

Built an isolated production Website bundle with all 1,795 original dist files preserved. Actual native Electron28431 converted an owned copy of the retained nested-list document on source4860. After reconnecting the preview (it had initially opened before Website startup completed), the actual Website renderer showed seven prose wrappers and all eight Sections with zero default padding. Desktop preview530px and phone388px both had matching scroll widths, retained two nested semantic lists, italic text and the exact code sample. Screenshots inspected; no page errors. Desktop here denotes the editor preview mode, not a full1440px published route. The previous batch already verifies public migration semantics; this draft was deliberately never published.

The renderer regression proves authored spacious spacing still produces five spacious Sections. Website typecheck and scoped lint pass; the full renderer wrapper passes with the new mixed-document case. No backend deployment or schema/attrs changes.

Owned draft deleted; original source post,43pages, post listing, full appearance, email templates and all101 existing queue entries exactly preserved. No new notifications. Native and API sessions revoked; Electron28431/Website28888 closed and private profile removed. Receipts and desktop/phone captures: `output/migration-prose-flow-20261005/`.
