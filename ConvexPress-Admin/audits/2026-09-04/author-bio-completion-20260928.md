# Author Bio completion — 2026-09-28

E29 closes the existing Author Bio requirement: a manual card, an explicitly selected site author, or the current post/page author. The former spec exposed `userId` but had no resolver; the renderer threw and the backend disabled the reference. Enabling the reference also exposed a stale-search association, reproduced and repaired. The tracker required current-author behavior beyond the old spec; that requirement was retained and implemented before acceptance.

## Behavior and compatibility

`content.author` has a closed, bounded public result: selected author ID, public display name, biography, optional image, and an actual author archive path when the profile has a slug. It excludes account fields. Inactive, management and route-denied profiles withdraw; missing media does not fall back to an older avatar URL. Email-shaped account names do not become display names. Full stored user/media/current-host rows count against the existing request budget.

New `useCurrentAuthor` defaults false. With it off, an empty `userId` keeps the manual card and a nonempty ID selects that exact public profile. With it on, the authorized host document supplies its current author; attributes cannot supply a host document ID. Authored name/bio/media override a profile, while role/links remain authored. An unavailable profile withdraws the whole profile-bound card, including overrides. Version2 and its six existing fields remain supported; the saved three-card live fixture retained every original field, ID, anchor and value, adding only the explicit false default.

Search continues indexing declared authored text, not account data. Public search now checks the selected/current author's present availability before disclosing associated authored copy. The separate open composed-content/search coverage requirement is unchanged.

## Verification

- Backend:121 tests/1134 assertions across author, canonical document and canonical search suites. Registered save, preview, publication, exact restore (including current mode), target binding, host-author changes, missing/management/inactive/route-denied targets, unsafe and withdrawn media, full-row read budgets, and stale search withdrawal.
- Renderer:310 tests/5442 assertions, including every canonical example under all four installed packs. Manual, selected/current, overrides, unavailable profiles, missing images and target mismatch covered.
- Backend/Admin/Website types, Website production build, block generation/freshness, portable contracts, block-kit and thumbnail inventory pass. Writer gate:1487 classified writes,30 owner tables, no bypasses. These focused gates do not claim repository-wide completion or close the existing main-bundle budget.
- Installed final snapshot:`ConvexPress-Admin/output/production-checkpoints/author-current-20260928`;1609 hashed files,22 Events files and all2405 original function signatures retained. Both deployments had storage-inclusive private backups and strict deployed type checking. First deploy generated exactly two author module entries in api.d.ts; that derived change is recorded in its manifest.
- Native Electron97170 used a separate private profile. Author picker selected Rowan Author Study; authored name/role/bio/link/media overrides and manual card were entered through normal controls. The portrait was uploaded through the native media chooser using the existing fictional BlockDemo image. Save/reopen, exact revision4 tree recovery to6, publication7, and current-author addition/save/reopen at8 passed. The actual Website iframe rendered all modes and dynamically withdrew deleted/inactive selected profiles while retaining the manual/current cards.
- Public:8 final cases, Core/Journal/Depot/Aster House ×1440/390px, from the final Website build. Current/manual/selected/override cards, three decoded portraits, no invented current-profile image, correct author archive via keyboard Enter/Back, no horizontal overflow, no page/console/hydration errors. Appearance restored after each matrix.
- BlockDemo:8 pack/width cases covering manual/selected/current examples with a labeled fictional profile; no page errors. Representative screenshots visually inspected.
- Live profile update appeared without editing the document; authored overrides remained. Removing the profile avatar preserved both authored portraits. Inactivation/deletion withdrew both selected cards and their stale search match. Native matching-contract reopen/deletion checks had zero errors.

## Diagnostics retained

The first current-author test had an incorrectly published/owned fixture and failed on permissions; it was corrected before meaningful current-mode assertions. It is not counted as a product regression. The initial public matrix ran before native publication settled and correctly received404; the subsequent published matrices passed. Three development-HMR errors occurred when the new local contract loaded before its matching backend deployment. They are preserved in `native-during-contract-update.json`; acceptance restarted after deployment and Website restart, with zero errors. No product error was filtered from the final matrices. Cross-version deployment/recovery remains part of E05/E18 rather than being claimed complete here.

Cleanup initially detected API-login timestamps changing on the pre-existing synthetic API principal. The preservation check was narrowed to those two expected timestamp fields for that exact principal; all other fields still compare exactly. No original profile was rewritten to make the assertion pass.

## Cleanup and scope

One owned page, one owned author and one owned media record/blob family removed; the fixture route is404. All42 original pages, eight site-profile projections, original menu/location projections and appearance preserved. The only profile differences are the authenticated synthetic API principal's `lastLoginAt`/`updatedAt` from login. Native signed out and ownedElectron97170 closed; userElectron39198 retained. API session revoked; reusable consumer index ready. No push.

Evidence:`output/author-bio-20260928/` and final deployment identity under `output/author-current-20260928/`. E29 closed; full editor/template goal remains active. Audit07 F18 count drift repaired. F17 reference completeness is tracked under Task7/E17; F1 plugin-default parity remains before Task3.

Tracker dry-run/readback changed only Author Bio Status/Tests/Screenshots/Notes:66Verified/71Inprogress,137rows. Header, block-row and live-tracker counts agree.
