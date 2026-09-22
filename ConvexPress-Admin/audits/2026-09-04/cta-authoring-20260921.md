# CTA authoring and inline signup — September 21

**CTA Band and CTA with inline form are verified for their current canonical contracts. 54/137 blocks verified;83 In progress. Original production audit: eight accepted, sixteen open.** Complete template websites, other blocks and provider/fleet/installer production acceptance remain open.

## Repairs

CTA Band accepted whitespace-only action labels and rendered an unnamed link. The spec now declares both action pairs through the shared authoring rule. Regression testing also exposed invisible Unicode characters passing that shared rule; it now uses the same visible-text definition as authoringNonblank. Root and nested action tests cover spaces, default-ignorable characters, valid multilingual text and emoji. This affects new authoring only: old values remain readable without rewriting, and historical draft recovery is preserved.

CTA with inline form now requires visible submit-label text on new writes. Both body fields explicitly select multiline editor controls. Existing versions, persisted field types, defaults and optional values are unchanged; no content migration is required.

Visual review found viewport-based padding consumed nearly half the inline form's width in a narrow desktop column. A regression measured input/card width ratio0.551 before repair. CTA form padding now follows its available width and its heading uses container-relative sizing. All four packs pass the narrow-input-space check. The final actual390px Website has a275px card,16px padding and241px input. Newsletter Signup's separate treatment remains unchanged. Four CTA form catalog thumbnails were refreshed and all548 thumbnail entries validate.

## Native and real Website evidence

Owned Electron66259 used a private profile and the synthetic acceptance operator against source4860. Both blocks were inserted with the native picker. Authored headings, eyebrow, multiline paragraphs, primary anchor/secondary email link, muted tone, two anchors, placeholder, submit label and fine print. Invisible CTA labels and blank signup labels disabled Save beside the invalid field.

Revision3 retained the authored two-block tree after reload. A deliberately changed submit label saved another revision; reviewed native restore recovered the exact original tree. Full-width settings and native publication yielded revision7, whose block tree equals revision3 exactly. The final native workflow also withdrew publication, restored the original editor content and signed out. Native live preview reached Live draft rendered during the workflow; preview reconnection after the final Website build restart is not a new continuity acceptance claim.

The built Website at1440/390px renders the authored content without horizontal overflow. Keyboard activation follows the first CTA to #studio-notes; the secondary destination retains mailto:hello@example.test without sending a message. Real signup using one example.invalid fixture returned You're subscribed and moved focus to the receipt. Repeating on mobile left exactly one subscribed record with canonical_newsletter source and no queued email. This handler records a subscriber only; it does not dispatch email. Original subscriber and email queue tables were empty and are restored exactly after removing the owned record.

Seven malformed inputs through deployed save and draft preview produced14 refusals with the published document unchanged: blank/invisible primary label, invisible/missing secondary label, unsafe destination and blank/invisible signup label. Historical read preservation is covered by contract tests; the native original-editor recovery is distinct evidence.

## Checks and preservation

-16 contract tests/11,103 assertions pass, including the failing-before CTA/signup tests and the additional shared invisible-label regression.303 renderer cases/5,250 assertions pass. The generated-form wrapper verifies its15 isolated DOM cases; two composed-definition cases pass.
- Four final browser cases pass: two four-pack CTA authoring/layout/keyboard cases plus the existing desktop/mobile conversion cases covering disconnected, invalid, failed, pending and reset signup states. Their embedded-provider checks are intercepted fixtures, not new provider playback acceptance.
- Admin, Website and demo types, final client/SSR build, block checks, generated freshness, kit parity, focused lint and whitespace checks pass. Native selector mistakes (search input is searchbox/placeholder, not textbox) and publication review before selecting a change were harness setup failures; they did not remove assertions or change product behavior.
- Strict backend deployment succeeds from ConvexPress-Admin/output/production-checkpoints/cta-authoring-20260921. Manifest and receipt are output/cta-authoring-20260921/deployment-source-final.json and deployment-final.json. It retains1601 files and22 installed Events source files. Derive future snapshots from this checkpoint.
- The owned page is permanently removed, its public URL returns404, all42 original pages/appearance compare unchanged, and nine plugin/media tables match the pre-deployment backup. API session logged out. Native sign-out receipt was written before an automation dialog-handler rejection reset the REPL during process closure. Process66259 was verified absent; original-editor restoration was verified from persisted content; its remaining private profile was then removed. Owned browser processes had exited; owned preview and tunnel were closed. Original user processes39198/69634/8172/68390 remain intact.

MagicTables updates only the two completed block rows, with exact dry-run comparison and full137-row readback. Other acceptance flags remain unchanged. Artifacts are under output/cta-authoring-20260921, including contracts-before.log, contracts-after.log, contracts-final.log, width-before.log, browser-final.log, baseline.json, restored-published.json, refusals.json, newsletter-acceptance.json, public-final.json, final-preservation.json and cleanup.json. The original content-mode restoration changes the canonical read envelope; a diagnostic helper's attempted blocks.map after that restoration was a helper error, not lost content.

Next: continue the remaining block families and keep Steps with Media's historical motion outlier separately tracked. Overall production readiness remains unaccepted.
