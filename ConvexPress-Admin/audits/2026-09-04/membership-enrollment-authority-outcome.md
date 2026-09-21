# Membership enrollment authority — September 6

While inspecting membership expiry maintenance, found an independent authorization bypass: `lms/access.ts:getActiveEnrollment` treated an active enrollment as sufficient authority without checking the membership grant that created it. A stale enrollment with no expiry could therefore keep a course and its lesson body accessible after the grant expired, was revoked, or its plan was archived. This made cleanup timing part of the security boundary.

Membership-derived enrollments now require a current grant on their recorded plan, an active plan, the enabled membership plugin, and a satisfied current course policy. The shared existing authority readers enforce start/end/grace/revocation and bounded policy reads. Missing course rules cannot make a stale membership enrollment an independent override. Manual and purchase enrollments retain their independent authority. The course-rule precheck now uses the complete bounded policy reader instead of collecting all matching rules.

## Evidence

Five tests exercise registered Convex handlers against the real schema: course access, lesson-player content, and rejection of progress writes. They cover exact expiry while grant/enrollment stored statuses remain active; future, revoked, deleted, expired-grace, archived/missing-plan, disabled-plugin, deleted/changed-rule, and inactive-user conditions; valid grace; a replacement grant on the same plan; manual/purchase enrollment independence; and policy overflow refusing the lesson. All five pass with 36 assertions.

A negative control copies the prior `access-lease-20260906` backend into a disposable local directory and runs these same tests. Three fail with the old code, reproducing retained access/lesson content; the two non-vulnerable cases pass. The directory is removed afterward. No authoritative checkout or captured checkpoint is altered. Script and log: root `output/membership-enrollment-20260906/negative-control.py` and `negative-control.log`.

Full backend + canonical foundation: **2,342 tests, 14,498 assertions, 185 files, zero failures**. Scoped backend TypeScript passed. Generated API consumers each passed 19 compiler fixtures; function/DTO counts remain 2,067/2,429 with the existing 428 unknown boundaries. The earlier 77-test LMS/permission regression run also passed. Whitespace checks passed.

## Deployment and current limits

The captured `membership-enrollment-20260906` backend checkpoint has 1,119 files. Captured Convex typecheck and dry-run passed, with no deleted indexes. Deployed only to Aster House staging (`careful-cormorant-268`); health, auth, storage, website/instance identity and media epoch `mi_ready_60aa40c699ba4d83b9367dd4130a9c12` were verified afterward. No Website source changed; published artifact remains `d12173751d7ea6a54a540ca4a94a1088c49657a2a43d7a4df6c14d74a3a195cf`.

Native Electron course management displays the authored published course and three lessons. The actual staging public API still exposes the authored public course metadata and denies anonymous access with `login_required`. No memberships, enrollments, course content or progress were changed in staging for this pass. There is no claim of a real signed-in customer expiry workflow yet.

## Remaining work

The daily grant expiry job and its LMS projection bridge still require bounded processing and recovery. The current expiry implementation collects all grants; the bridge collects course rules and alternate grants and does not validate alternate grant dates. Existing `membership/__tests__/enforcement.test.ts` copies maintenance logic instead of calling the actual handlers; its passing tests do not establish production maintenance correctness. `membership_plans` has no `gracePeriodDays` schema field even though the old sweep and copied tests consult it. Replace that dead behavior with explicit recorded grace semantics rather than inventing a grace interval at sweep time.

Next maintenance work must include actual registered-handler tests, bounded due-grant selection, resumable course-enrollment reconciliation, fresh authority checks on retries, and durable recovery after interrupted jobs/restore. Legacy/archive/dashboard display expiry, signed-in customer/native session acceptance, organization/business fleet isolation and other original audit/handoff gates remain open. Block renderer acceptance remains 96/136.
