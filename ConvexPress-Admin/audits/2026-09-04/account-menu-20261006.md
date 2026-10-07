# Account menu descendants and signed-in controls — October 6, 2026

E92: repaired and verified. Base commit 46f25a56, with the account-menu changes in this commit. Task 5 / E09 remains open.

## Defect and repair

The dashboard menu adapter discarded children beneath heading items. Both public UserMenu and dashboard ProfileMenu also rendered only root items. A valid assigned profile menu therefore hid its authored destinations. The red tests reproduced both failures. The adapter now preserves heading children, and a shared AccountMenuItems renderer retains headings, nested links, separators, external link attributes and dashboard badges. Parent links remain usable; nested links are indented. Existing avatar/name display choices, presets and sign-out behavior remain intact.

## Evidence

- 12 focused tests pass across account-menu.test.ts and nav.test.ts. The actual component fixture exercises all three display choices with all three presets, plus assigned heading/link descendants in both public and dashboard menus (11 component cases with sign-out).
- Website TypeScript, production build and changed-file lint pass. Diff whitespace check passes. No backend source change or deployment.
- Production Website4331 against the retained, isolated extension trial4922/4923. Real synthetic Clerk customer, Subscriber role, no admin login; the actual customer was denied the management appearance snapshot API.
- Four actual header preset/display cases: Core avatar/default, Journal name/profile-settings, Depot avatar-only/custom fallback, Aster avatar/default. Correct destination hrefs and avatar/name visibility verified.
- Assigned heading → profile → settings descendants plus an external link rendered in all four public headers at1440 and390: eight cases. Menus stayed inside the viewport. External target_blank and backend-normalized rel=noopener noreferrer retained.
- Actual profile and deepest settings navigation reached Edit profile and Account Settings. Actual Core dashboard account menu retained the same descendants and external link. Header Log Out and dashboard Sign out independently returned to the guest homepage with no account menu and visible Sign In/Register.
- Browser console errors: none. Screenshots depot-nested-mobile.png and core-dashboard-menu.png saved; Depot screenshot visually inspected.

The live configuration used the registered staging publication API. This batch does not claim fresh native UI publication for account controls; earlier native header/Customizer lifecycle evidence is reused. It also does not repeat the full dashboard interaction matrix. One initial backend request occurred before the resumed container listened; a later request succeeded without restarting it. A screenshot check initially expected rel exactly noopener; the backend correctly adds noreferrer, so the check was corrected to require noopener. Neither was counted as a product defect.

## Preservation and cleanup

Appearance values restored after asserting the current values were the owned fixture. Original menu inventory restored; the single owned menu and its items removed. Menu location semantics restored; the default dashboard-profile location row remains materialized, so row identity/timestamps are not claimed exact. Email/dashboard/general values restored; normal settings audit metadata may advance. Local synthetic customer is inactive and exact owned Clerk test user deletion verified404. Local operator session revoked and refresh returns401; private disposable customer/session files removed.

Owned Website59680 stopped. Trial container convexpress-sdk-trial-extension-20261006 returned to exited; retained volume preserved and control-plane archive unchanged. Tab29 closed, viewport reset, all seven protected processes alive. No shared source4860 writes or push.

## Next boundary

E09 now has signed-in display/preset and assigned account-menu proof in addition to E82–E91. Reconcile remaining declared Customizer fields/surfaces against these receipts, prioritizing unaccepted footer controls and contextual targets. Do not rerun accepted header matrices or infer completion of Tasks5–8 from this batch. Full goal remains active,117Verified/20In progress.

Evidence: output/account-menu-20261006/{red.log,green.log,types.log,build.log,lint.log,browser-receipts.json,customer-boundary.json,cleanup.json}.
