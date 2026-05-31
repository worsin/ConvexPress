# PLAN: Certificate System — Build Sequence

> Companion to `PRD.md` (read first). Scaffold/conventions: `specs/codex-prds/LMS-PLUGIN-IMPLEMENTATION.md` (M0 assumed). **Verify gate every step:** `cd ConvexPress-Admin && bun run check-types` exits 0.
> **For agentic workers:** task-by-task via `superpowers:subagent-driven-development`; `- [ ]` steps. **Milestone 2**.

**Goal:** Certificate templates + issuance on `lms.course_completed` + PDF render + learner download + public verify.
**Prereqs:** M1 + `progress-completion-system` (fires `lms.course_completed`). Reuses Media (PDF storage) + Email Notifications.
**Code home:** `convex/lms/certificates/` + `convex/schema/lms.ts` (`lms_certificates`, `lms_certificate_issues`); admin `.../lms/certificates/`; website `_marketing/verify/$serial`.

## Decisions
- Issuance is **event-driven + idempotent**: subscribe to `lms.course_completed`; if `course.certificateId` set and no active issue for (user, course) → issue once (unique `serial`).
- PDF render runs in a **Node-runtime action** (`renderCertificatePdf`) and stores the result as a **Media** file (`pdfMediaId`); merge tokens resolved server-side.
- Templates are a Tiptap/HTML layout with merge tokens (`{{learner_name}}` etc.) — reuse the editor for the layout.
- Verification is **public** (no auth) by serial.

## Build Sequence

### Step 1 — Schema
- **Files:** EDIT `convex/schema/lms.ts`.
- [ ] Add `lms_certificates` (PRD §2.1) + `lms_certificate_issues` (§2.2) with indexes (`by_serial` unique-by-convention). Confirm `lms_courses.certificateId` FK already exists (from Course System).
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): certificate schema`.

### Step 2 — Template CRUD + issuance
- **Files:** CREATE `convex/lms/certificates/mutations.ts`, `convex/lms/certificates/internals.ts`, `convex/lms/certificates/validators.ts`.
- [ ] `createTemplate/updateTemplate/deleteTemplate`; `issueCertificate(userId, courseId)` (idempotent, unique serial via `helpers/slug.ts`-style id); `revokeCertificate/reissue`. `internals.onCourseCompleted` subscriber → `issueCertificate` → schedule `renderCertificatePdf`.
- [ ] Gate: `requirePluginEnabled(ctx,"lms")`; template mgmt = `lms.certificate.manage`.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): certificate templates + issuance`.

### Step 3 — PDF render action + email
- **Files:** CREATE `convex/lms/certificates/actions.ts` (`"use node"`).
- [ ] `renderCertificatePdf(issueId)` — resolve merge tokens → render PDF (reuse the project's PDF/`sharp` toolchain; the root deps include `sharp`) → store Media → set `pdfMediaId`; then send issuance email via the Email Notification system.
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): certificate pdf render + email`.

### Step 4 — Queries + verify
- **Files:** CREATE `convex/lms/certificates/queries.ts`.
- [ ] `listTemplates`, `getTemplate`, `getIssueForUserCourse`, `listIssuesForUser`, `verifyBySerial(serial)` (public → `{ valid, learnerName, courseTitle, issuedAt, status }`).
- [ ] Verify: `bun run check-types` → 0. Commit: `feat(lms): certificate queries + verification`.

### Step 5 — Events
- [ ] Declare `lms.certificate_issued/revoked/reissued`. Wire subscriber to `lms.course_completed`. Verify: `bun run check-types` → 0.

### Step 6 — UI: admin templates + website download/verify
- **Files:** CREATE `.../lms/certificates/index.tsx`, `.../lms/certificates/$id.tsx`; EDIT course settings (certificate picker → `course.certificateId`); CREATE `ConvexPress-Website/.../routes/_marketing/verify/$serial.tsx` + download link in the player completion state.
- [ ] Template editor (Tiptap layout, merge tokens, orientation, background, preview with sample data); learner download; public verify page.
- [ ] Verify: `bun run check-types` (both apps) → 0 + `bun run check:smoke`. Commit: `feat(lms): certificate admin + verify page`.

## MVP Definition of Done (from PRD §7)
- [ ] (v1) `lms_certificates` + `lms_certificate_issues` exist; `course.certificateId` FK exists.
- [ ] Template CRUD with merge tokens + orientation + background.
- [ ] Issuance on `lms.course_completed` idempotent + unique serial.
- [ ] PDF rendered + stored in Media + emailed.
- [ ] Learner download + public `/verify/$serial`.
- [ ] Revoke/reissue on completion reversal.
- [ ] `lms.certificate.manage` enforced; verification public.

## Verify
```bash
cd ConvexPress-Admin && bun run check-types && bun run check:guardrails
cd ConvexPress-Website && bun run check-types
```
