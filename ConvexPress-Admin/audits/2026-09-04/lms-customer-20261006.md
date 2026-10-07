# LMS customer acceptance — 2026-10-06

`lms/course-grid`, `lms/curriculum` and `lms/progress` now have the missing actual customer Website evidence. Accept these three blocks together with their existing native authoring, pagination, four-pack presentation and recovery tests. Instructor gains withdrawal evidence here but remains open for its remaining profile/media reconciliation. No product source changed; the actual Website artifact is `6fc1e5fa`.

## Actual customer workflow

Artifacts: `output/lms-final-20261006/`.

Two fresh customer-role users were created in the already configured Clerk development instance. Credentials stayed in mode0600 private files, were used through the normal Website login and were removed during cleanup. The documented development verification flow was used: [Clerk test emails](https://clerk.com/docs/guides/development/testing/test-emails-and-phones). These are separate customers, not operator-token impersonation.

An isolated closed course has one topic and two lessons. A published canonical page includes the category-filtered course grid, expanded curriculum, instructor and both selected-course/all-course progress scopes.

1. Anonymous readers see public course cards and curriculum metadata, plus signed-out progress messages (`signed-out.txt`). Curriculum deliberately exposes an outline and a course link; it does not expose lesson bodies or claim that each lesson is unlocked. Enrollment and lesson access belong to the linked course/player.
2. Customer one, manually enrolled, initially sees selected-course 0/2=0% and an empty all-course history (`learner-one-zero.txt`). The course card leads to the real course and its Continue learning link.
3. Through the real customer course player, Mark complete records one lesson. The player shows 1/2=50% (`learner-one-completed-lesson.txt`). Returning to the authored page shows 50% on the course card and both progress blocks (`learner-one-progress.txt/png`). The screenshot was visually inspected.
4. Normal enrollment revocation removes personal progress from all three displays without reloading the open page (`learner-one-revoked.txt`). Public outline metadata stays available; no unauthorized lesson-content claim is made.
5. Normal logout followed by customer two login in the same browser shows selected-course 0% and empty all-course history, never customer one's 50% (`learner-two-isolation.txt`). This checks the real session-switch boundary, not only distinct API identities.
6. Unpublishing the owned course updates the still-open page: course-grid empty, curriculum unavailable, instructor omits the course and progress is absent (`course-withdrawn.txt`). Customer two then logs out normally (`customer-signout.txt`).

The first fixture attempt omitted the required topic and was atomically rejected. The corrected fixture created the topic first. This was an acceptance-script error, not a product repair.

## Accumulated evidence

Current focused registered backend suites (courses, curriculum, instructor, learner progress and membership-enrollment authority) pass **25 tests / 191 assertions**, in `output/lms-focused-20261006.log`. They cover strict projections, learner/site/document cursor binding, revocation and publication, bounded pagination and membership authority. Current block specs and renderers for the three accepted blocks exactly match the reviewed inventory hashes.

Reuse these valid records rather than repeat them:

- `output/course-blocks-20260911/course-grid-ui-checks.json`: actual native category/count editing, saved values and reactive Website updates. `course-grid-preview-checks.json`: actual native previews against both independent databases, wrong-environment refusal and exact return to the user's environment.
- `course-grid-checks.json`: catalog pagination without duplicates, four packs at1440/390, keyboard focus, reduced motion and overflow checks. Subsequent learner/curriculum count reports supersede its earlier pending aggregate work.
- `output/curriculum-block-20260911/checks.json`: native course picker/expanded/save/preview, 200 lessons across26 public pages per installation, no duplicate entries and four-pack presentation. September11 hydration interaction and Website bundle/payload reports plus `public-focus-hydration-20260928.md` supersede its early lost-click limitation.
- `output/progress-block-20260911/checks.json`: native paginated course picker/save/actual connected preview with operator personal data withheld; all/course scopes, four packs at1440/390, focus/pagination/reduced-motion/overflow checks. Today's customer sessions close the explicit provider-none/customer-browser gap.
- Progress integrity and maintained counts reports retain 199/200, exact100%, undo, duplicates, foreign/deleted rows and bounded recovery evidence. Today's 50% observation is not presented as a fresh full count-recovery test.

Shared cross-environment reference promotion, full SDK/editor integration and the overall delivery plan retain their separate gates. This block acceptance does not close those tasks or unrelated course-player maintenance.

## Cleanup and preservation

`restoration.json`: original43source+28target pages, both appearance/settings/menu snapshots, all9original courses, plugin values and the full email queue are exact. Eleven relevant active notification templates were temporarily muted for disposable customer events and restored; only their expected mutation timestamps differ. Both deactivation events completed without listener failures.

Both test users are inactive locally and deleted from Clerk; private credentials removed. Both enrollments revoked, owned course archived and page recoverably trashed. Both customers used normal logout, both temporary operator API sessions were revoked and refresh returns401. Owned Website PID79546 stopped; seven protected processes remain alive. Tab44 closed; no native app was launched or user session altered in this batch.

Only Status/Tests/Screenshots on the three eligible tracker rows may change under guarded dry-run/full readback. All Notes and unrelated cells remain exact. Full delivery goal remains active.
