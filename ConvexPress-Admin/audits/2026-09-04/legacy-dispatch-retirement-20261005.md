# Canonical authoring and public surface dispatch — 2026-10-05

Normal post/page edit URLs now enter NativeCanonicalEditor directly. Existing legacy content opens deliberate conversion review; users cannot switch back into the legacy editor. Loading, not-found and Trash handling remain. The public page/blog routes and all four packs render the authorized canonical body, preserving membership gates, layout/title behavior and surrounding template chrome. Website startup no longer imports the legacy hydration dispatcher. Archived source fields and deliberate conversion are retained.

This is a frontend retirement boundary, not full E07 completion. Ordinary creation still creates an empty v1 draft before canonical initialization. Other legacy writers/schema consumers and dead implementation removal remain to reconcile. Unconverted published v1 documents now return HTTP404 instead of using a legacy renderer; both captured installed corpora were entirely canonical before this change. No backend deployment or push occurred in this batch.

## Verification

Evidence: `output/legacy-dispatch-retirement-20261005/`.

- Four packs × five page layouts plus each blog surface: 24 tests, 72 assertions. Legacy renderers deliberately throw in the harness; all24 failed before removal and pass afterward. Covers retained legacy fields, canonical hero title suppression and membership gate precedence.
- Eight mounted post/page route cases cover undefined/v1/v2 formats plus loading, missing and Trash states. Existing20 mounted canonical workspace cases also pass. Public body lifecycle and hydration regression wrappers pass.
- Admin and Website explicit project type checks pass. Website production build passes; native/public acceptance uses that fresh artifact. Admin production build passes (`admin-build.log`); existing bundle-size warnings remain.
- Actual Electron: source post and target page entered migration review via normal edit URL, converted once, saved title, reloaded into canonical authoring, and rendered heading/bold/link on their actual Website at335px preview width without preview horizontal overflow or page/console errors after correcting the test setup. Both reached revision2 with two history entries. Original authoring fields match the retained original revision exactly.
- Actual public Website: existing source page/post and target page HTTP200, expected canonical body in SSR and hydrated rendering, desktop1440 and mobile390 screenshots, images loaded, no public page/console/hydration errors. The currently installed packs were exercised live; all four packs were exercised by the24 surface cases, not four separate live site activations.
- Native narrow Admin chrome has horizontal scrolling visible in the screenshots; the no-overflow assertion applies only to the actual Website preview. This batch does not claim complete narrow Admin chrome acceptance.

## Test setup and cleanup

The output-directory SSR build initially could not resolve React; linking its dependency directory to the Website's installed dependencies fixed the isolated test setup. A source environment-switch wait used a nonexistent heading; shell readback confirmed the selected4860 environment before proceeding. Neither issue caused a repeated content mutation. Public post acceptance was tightened from title-only readiness to the actual canonical body before capturing final evidence.

Owned source post `g1897h7fsv35xbbe6g4ba975058fptbj` and target page `g1849j0sq3v6b49zwa269bv7qs8fqgcy`, plus four revisions, were deleted after native signout. Original source116posts/434revisions and target29posts/88revisions, appearance, queue and email templates match baseline exactly. API sessions revoked; owned Electron62698 and Website62668/62683 stopped; isolated profile removed. Owner39198/62672/65092 processes and separate RSVP fixtures preserved.

## Claude audit35

Accept the count-scope clarification. `installed-final.json` counts108source/86target files under `convex/extensions/`, including tests; `installed-preservation.json` counts71/55 non-test extension files. Recounting the preserved manifests confirms both scopes. Prior report now names both. Accept public surface parity as this batch's required verification; adapt the on-track observation as scope evidence, not independent code acceptance. Unanswered advisory questions do not block progress.
