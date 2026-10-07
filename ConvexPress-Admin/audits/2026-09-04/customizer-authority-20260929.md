# Customizer customer and parent authority acceptance — 2026-09-29

Task5 authority boundary accepted on the actual source Website4322/Convex4860 and controller4720. Full Task5/E09 remains open. Block tracker unchanged at117 Verified/20 In progress. No backend deployment, push or subagents.

## Signed-in customer

A disposable Clerk test customer completed real Website sign-in; the ordinary profile query confirmed the expected active Clerk principal. `/?customize=1` displayed no Customizer. Using that customer's real JWT, snapshot, getDraft, saveDraft and operatorHandoffs:create each returned structured FORBIDDEN/Insufficient permissions. No draft or handoff was created. The customer then signed out through the real menu. Zero page errors; signed-in screenshot inspected.

## Actual parent operator revocation and recovery

Provisioned one owned scoped controller operator for the Promotion Lab website and claimed it through the normal auth flow. The broker exchanged its credentials for a site administrator session; ordinary one-use handoff opened the source Website editor. The actual management profile established the expected authority source. Changed primary color to#761234 without saving or publishing.

At18:20:26UTC the owner deactivated this owned operator through operators:setActive. By18:20:34 the open panel had disappeared, and the original site session's snapshot query returned UNAUTHORIZED/Authentication required. A new broker exchange while inactive was refused (observed tool result, not a separate stored response). No other operator or session was revoked. Reactivated the same operator, exchanged a fresh handoff in the same browser document, and recovered#761234 with working Undo/Redo at18:21:22. Zero page errors. Revoked and recovered screenshots inspected. Explicit End discarded the draft; browser closed and controller auth signed out. Finally deactivated the owned operator again.

## E69: stale active banner

The revoked screenshot shows the real defect: editor authority was gone while the top banner still said editing was active and suggested saving a private draft. Its display depended only on an in-memory session object. WebsiteOperatorNotice now combines that session with Convex authentication and the existing manage_options capability state. It displays checking while unresolved, an alert for confirmed denial, and active/save guidance only for confirmed authority. End remains available; a desktop bridge can offer reconnect after denial. The notice does not clear recovery, grant authority or renew automatically.

A new actual Notice/provider regression failed before the source fix and passes afterward across capability loading/denial, backend unauthenticated state, restored authority and retained draft memory. The isolated panel harness now supplies the added capability hook. An older lazy-editor harness lacked the auth/profile/runtime/controller dependencies already required by OnSiteCustomizer; it now supplies them and additionally proves loss of backend authentication removes the panel and clears preview. Seven outer focused tests pass, including isolated session, real Convex renewal, panel recovery and lazy gate suites. Website TypeScript and scoped lint checked separately.

E69 remains open for refreshed Website acceptance. The running4322 production bundle predates this source fix and E68 repeat-picker fix. It was preserved because it hosts the pending human RSVP challenge. Component proof is not runtime proof. No broad auth changes were needed.

## Cleanup and preservation

Both cleanup receipts compare against the pre-fixture source baseline: full published appearance snapshot/revision,43pages, general/security settings and99email-queue rows exact. Customer notification templates were suppressed only for the owned fixture events, restored after those events completed; template values match apart from normal updatedAt. The RSVP-owned settings-alert suppression remains at its preceding baseline, untouched by this acceptance.

Customer profile inactive; owned Clerk user deleted and verified404. Owned controller operator confirmed inactive. Its claimed invitation, scoped grant, management binding and ordinary audit history remain retained. Both owned browsers closed, customer persistent browser profile removed, owned controller sessions signed out, site API sessions revoked and owned credential files removed. Private baseline files retained outside the repo. Owner Electron/Admin/BlockDemo/SOCKS/sourceWebsite and human CAPTCHA session preserved.

## Evidence and remaining gates

Ignored `output/customizer-authority-20260929/`: customer-denial.json, signed-in-customer-denial.png, signed-out.json, customer-cleanup.json, operator-before-revocation.json, operator-revoked.json/png, operator-recovered.json/png, operator-deactivated.json, operator-cleanup.json, notice-red.log, focused-final.log, website-types.log, renderer-tests.json, renderer.log and tracker.log. This pass proves customer denial and real parent revocation/recovery; reuse prior actual natural renewal rather than repeat it.

Remaining Task5: refreshed E68/E69 runtime, complete per-field/four-pack and Aster native workflow, public HTTPS/local-network permission,22dashboard surfaces, and appearance migration/runtime retirement. Earlier Core native chrome and Journal/Depot publication/conflict/promotion evidence remain reusable. E07/E18/E22 and authored sites/demo/SDK completion remain independent delivery work;117/137 is not overall completion percentage.

Final verification: Website TypeScript and scoped lint pass. Fresh source-bound central renderer receipt317tests/5493assertions,137block versions/1148executed pack/example cases; live tracker137rows/117Verified passes; delivery per-row/header parity passes. These checks do not upgrade E68/E69 to refreshed runtime acceptance.
