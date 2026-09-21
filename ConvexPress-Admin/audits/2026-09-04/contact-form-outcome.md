# Contact form native and public acceptance — September 6

The canonical Contact block is implemented and has passed the renderer/browser milestone, bringing that count to **97/136**, with 39 renderers remaining. This is not whole-app production acceptance or a claim that every Forms capability has been accepted.

Contact uses a server-owned Forms record tied to its source document and block. Saves reconcile field identities, notification configuration and confirmation text in the document transaction. Public reads and submissions recheck the source's current publication, visibility, password/membership authority and saved projection. Recipient configuration stays out of public output. Completed submissions receive short-lived confirmation receipts; IDs alone cannot retrieve answers through confirmation rendering.

## Actual staging acceptance

- Captured backend `contact-live-20260906-r3` deployed to `careful-cormorant-268`. Health, site/instance identity and media epoch were verified before and after deployment. Production was not changed.
- Electron created **Start a conversation**, initialized its canonical editor, saved a four-field Contact block, and reopened the saved configuration. The page is `x17wf310grhw7etb1wpzyja9yd8dw2jc`; its restored revision is 5.
- The saved Website preview acknowledged its document and showed four effectively disabled controls, with no submission form. Effective disabling comes from the fieldset; checking the inputs' own `.disabled` property was an insufficient first assertion.
- Native Website publishing installed artifact `faa08e87b64d392a5a3ea0b21e81d91dd7f00f3aa300d1ca768c46a6439be338`. The public HTTP response reported the same artifact. The draft page returned 404; native publication made it available at `/page/start-a-conversation/`.
- The real public form rejected missing required fields and focused the first missing control. One valid synthetic submission produced the saved confirmation, focused its status, and kept the URL unchanged. Four answers were stored and rendered in Electron.
- Removing the phone field kept its historical answer. Acceptance exposed loss of its label; the fix retrieves missing definitions by indexed key only from this Contact form's history group. A registered regression failed before the fix and now also rejects an unrelated group's label. Native readback after deployment showed the retained phone label and answer.
- Native revision restoration returned all four fields, the same backing form, original field IDs and managed notification/confirmation IDs. The original entry and answer values remained unchanged. There was one Contact entry, zero emails, and the existing two queue records were unchanged. The recipient is blank and there are no form action rules.
- The existing Navigation field guide remains exactly revision 20 with its original ten blocks.

## Repairs found during acceptance

Fresh Convex API generation exposed recursive inference in the messaging helper's signature. Narrowing messaging inputs to its actual recipient/success fields and explicit persisted binding/projection types fixed it. Deployment preflight now includes fresh code generation before dry-run. The failed first capture is retained; it is not represented as a successful deploy.

The field guide already uses the planner's eight distinct data-source allowance. Adding Contact correctly failed before writes, but the editor incorrectly advised reloading. The native adapter now runs the shared pure planner before save and explains source/output capacity without discarding edits. A separate Contact page keeps the original page intact. This does not increase the current capacity limit.

Public screenshots exposed a narrow-column layout defect that full-width specimens missed. Named container queries now switch the Contact and field grids according to their actual available width. Typography and gaps also respond to the container. The corrected public desktop and mobile states, native preview, and Aster 550px specimen were inspected.

The standalone template SSR harness also needed the storefront's app-owned Zod resolution and automatic JSX treatment for root block sources. Its four loading fixtures and authored Aster cover pass.

## Verification and limits

- Backend/foundation: **2,367 tests, 14,711 assertions, 191 files**, zero failures.
- Focused history/document/confirmation handlers: 58 tests, 443 assertions.
- Native workspace integration: eight expanded cases, including pre-save source/output capacity.
- Renderer/DOM regressions, backend fresh generated types, final Admin and Website types, and both API consumers' 19 compiler fixtures passed.
- Five Contact browser tests cover all four packs at desktop/mobile plus 300/550/1100px constrained columns. Required, pending, server error, retry, success, hidden honeypot and reduced-motion states are included.
- The exact hosting bundle passed its offline workerd gate across the four packs and public route types. Native publishing and the actual public Contact lifecycle provide the live proof above.

Hardware frame-timing acceptance, provider-backed CAPTCHA/email delivery, general Forms pagination for very large entry details, and the broader production audit remain open. The floating support widget can overlap controls at a mobile viewport edge and remains a site-level polish item. Full-block lifecycle flags in MagicTables are not closed by this renderer/browser milestone. No commits or pushes were made.

Evidence: root `output/contact-form-20260906/runtime-receipt.json`, its native/public logs and before/after inventories, `output/playwright/contact-form-20260906`, and `output/block-demo/contact-container-20260906`. Backend captures and deployment receipts are under `ConvexPress-Admin/output/production-checkpoints/contact-live-20260906-r3`.

MagicTables Contact Notes updated with exact readback; all other cells and full lifecycle flags preserved. Final source inventory confirms97rendererfolders of136. Whitespace checks pass.
