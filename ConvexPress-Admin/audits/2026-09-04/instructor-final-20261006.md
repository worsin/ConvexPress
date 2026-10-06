# Instructor acceptance — 2026-10-06

Accept `lms/instructor` on retained native authoring, independent-database and live course-publication evidence plus the remaining portrait/profile-state checks. The root block's authored contract remains one instructor reference. Shared editor history/recovery and SDK workflow gates remain separate delivery requirements.

## Change and current evidence

BlockDemo previously supplied only an initials profile. Its Instructor study now exposes four explicitly fictional specimens: initials with biography, portrait with biography, name without biography, and unavailable profile. The portrait reuses the existing bundled fictional studio image. Every state runs through canonical data validation and the installed demo host; changing the specimen invalidates its prior grant. No production resolver or stored content changed.

`output/instructor-final-20261006/` contains:

- `tests-red.log` records the missing portrait and minimal-profile behavior before implementation. `tests-green.log`: all13 BlockDemo tests,170assertions pass, including canonical portrait data and six-plus-one course paging.
- `desktop.json`: Core, Journal, Depot and Aster House at1440px load the portrait, preserve the exact next/first page, focus the Instructor study after pagination, remove identity/course links when withdrawn, omit the minimal biography, and recover initials without an image.
- `mobile.json`: all four packs at390px load the portrait and fit the document width. Minimal and unavailable states pass; the first-page unavailable profile exposes no course links. On a withdrawn later page, the renderer retains its explicit return-to-first-page link and reports no courses.
- Eight portrait captures were saved; the four desktop and four mobile treatments were visually inspected for portrait crop, identity/biography hierarchy, readable course links, spacing and stacking. No browser console errors were recorded. Synthetic profiles establish rendering, not a new live upload or new backend profile authorization.
- Website and dedicated BlockDemo type checks pass (`types.log`, `demo-types.log`). Canonical blocks, generated transport and block-kit checks pass (`blocks.log`, `sync.log`, `kit.log`).

Pack selection remounts the demo study. An initial automation batch selected a specimen before that remount finished; it was rerun against settled controls. A separate assertion initially expected the first-page unavailable wording on page two; source inspection confirmed the existing page-specific message. Neither was counted as a product defect.

## Reused evidence

`output/instructor-block-20260911/checks.json` and its native/live browser receipts retain actual instructor selection, save and Website preview; both site databases' public profiles and six-plus-one pagination; foreign-identity rejection; four-pack keyboard/reduced-motion/overflow checks. The current `lms-customer-20261006.md` run proves actual course withdrawal removes the course from the public instructor result. Those workflows were not repeated merely to refresh a screenshot date.

## Preservation and scope

This run changes only demo source, regression tests and acceptance records. No backend deployment, customer/operator session, certificate, profile, course, page or appearance mutation occurred. Owned browser tab46 closed and temporary viewport override reset. Protected processes39198,62672,65092,10193,10207,10220,19946 remain alive; no runtime was started or stopped. Tracker write is limited to Instructor's Status/Tests/Screenshots, guarded against concurrent changes and verified through full readback with all Notes preserved. The full delivery goal remains active.
