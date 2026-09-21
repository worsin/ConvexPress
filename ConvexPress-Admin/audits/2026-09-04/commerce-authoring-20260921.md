# Commerce authoring validation — September 21

**Implemented and accepted at the shared authoring boundary. Full block counts remain19/137 verified,118 pending; original production audit8accepted/16open.**

## Defect and repair

Product Collection and Product Showcase accepted fractional product counts in the generated editor, but the actual resolver required integers. Category/tag modes could similarly save an empty required source. A new editor regression failed before the repair with an invalid draft reported as valid.

The planner's existing binding and normalization now live in one portable module shared with editor and backend write validation. This retains trusted collection overrides, strips presentation-only group fields, and preserves visitor search/calendar/pagination handling. No authorization is fabricated: runtime plugin/capability/site checks remain in the planner and server. Resolver errors map to the actual bound editor fields, including custom nested aliases. Reusable content remains separately expanded and revision-authorized, rather than treated as a public query resolver.

Stored schemas and block versions are unchanged. Invalid historical values remain readable and draft-restorable; new initialize/save/preview and publication require correction. Withdrawal and original-editor recovery remain possible. The existing common write gate also applies to reusable content and scoped custom definitions. No silent rounding, missing-source substitution or data migration occurs.

## Verification

- All285 shipped examples retain valid resolver arguments. Pure regressions cover old fractional-value reads, draft restore, publication refusal, withdrawal, correction, custom nested bindings and collection group projection.
- Registered-function regressions refuse five bad commerce candidates through save and preview without altering posts/history. Full backend suite3469pass; final affected suites101pass after the target compatibility correction.
- Generated editor suite15pass, including the isolated13-case DOM suite; renderer297cases/5143assertions. Admin/Website/backend types, both app builds, focused lint, canonical checks/freshness and block-kit distribution pass.
- Strict staging deployment initially failed because the backend TypeScript target lacks Object.hasOwn. Replaced those new calls with the existing portable hasOwnProperty pattern; backend types and strict deployment passed. No indexes were deleted. The failed receipt is retained.
- Deployed source4860 refused10 invalid save/preview calls; five corrected previews succeeded and the document remained unchanged. Production errors redact diagnostics, so exact semantic diagnostics/no-history-write assertions come from registered-function tests, with positive deployed controls proving the route works.
- Owned Electron93363 used private configuration, renderer4105 and Promotion Lab staging4860. Both count fields retained invalid decimals and blocked Save. Category mode required a real site category; picker selection repaired it. Tag mode required a tag; changing to recent cleared the unused requirement. Corrected blocks saved/reopened with count2 and authored headings; native reviewed publication succeeded.
- Actual built Website4322 at1440/390 showed real catalog products/prices without overflow. Product Showcase's Choose options link navigated to its exact real product page/H1. The existing test products had no images; this does not prove media rendering or premium design. Mobile screenshot was inspected. Native withdrawal and original-editor recovery to0blocks succeeded.

## Preservation and remaining work

A storage-inclusive backup preceded deployment. The installed1599-file snapshot preserves all22 Community Events files; a post-deployment export proves every row in all six plugin tables unchanged, and the disabled handler retains its expected denial. All42 pre-existing pages and full appearance values match the baseline. Disposable page g18b8n53f3cpbsgep6vffx7meh8et724 was recovered and trashed. Owned native/API sessions logged out; Electron93363, Website95046 and SSH94969 exited; private profile removed. Original user processes39198/69634/8172/68390 remain running.

MagicTables updates only the Notes for Product Collection and Product Showcase. Full137-row comparison preserves all other cells and19 Verified statuses. Artifacts: output/commerce-authoring-20260921/. Installed snapshot: ConvexPress-Admin/output/production-checkpoints/commerce-authoring-20260921.

Next: finish the commerce family across supported modes, manual/grouped cards, live source changes, purchase actions, Category Tiles and assistant host states, reusing prior valid pack/interaction evidence. This authoring repair does not close those blocks, animation approval, packaged releases or the16 original production gates.
