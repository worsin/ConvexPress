# PRD: Certificate System

> **Project:** ConvexPress — LMS extension. Completion certificates: templates, issuance on course completion, and verification.
> **Plugin:** `lms`. Subscribes to `lms.course_completed` and issues a verifiable certificate when a course has one assigned.
> **Two-app architecture:** Admin (Convex Auth) designs templates + issues; Website (Clerk) renders/downloads + verifies.
> **Stack:** Bun, Base UI, Tailwind v4, Tiptap (template), PDF render (server action).
> **Canonical path:** `specs/ConvexPress/systems/certificate-system/PRD.md`
> **Airtable:** ConvexPress base / Systems / "Certificate System".
> **Status:** Planned — fast-follow.
> **Depends on:** `course-system`, `progress-completion-system`, `media-system`.

---

## Integration with ConvexPress

**Positioning:** internal extension (`lms`) — certificate templates + issuance + verification.
**Extension gate:** `lmsEnabled`; `requireLmsEnabled(ctx)`.
**Code lives at:** `convex/lms/certificates/` + schema `lms_certificates`, `lms_certificate_issues`. Admin template editor at `.../_admin/lms/certificates/`. Public verify at `ConvexPress-Website/.../routes/_marketing/verify/$serial`.

**Consumes these ConvexPress systems:**
- **Progress & Completion** — listens for `lms.course_completed`.
- **Course System** — `course.certificateId` selects the template.
- **Media System** — background images/logos in templates; rendered PDF stored as a Media file.
- **Email Notification System** — emails the certificate on issuance.
- **Event Dispatcher** — `lms.certificate_issued`.
- **Role & Capability** — `lms.certificate.manage`.

**LearnDash analog:** LearnDash Certificates (a template assigned to a course/quiz, awarded on completion, with merge fields + a PDF download).

---

## 1. Overview

### 1.1 Purpose

Award a learner a **certificate** when they complete a course that has one assigned. Admins design reusable **templates** (a Tiptap/HTML layout with merge fields: learner name, course title, completion date, serial, points). On `lms.course_completed`, the system **issues** a certificate (records an issue row + renders a PDF), emails it, and exposes it for download and **public verification** by serial.

### 1.2 Scope

**In Scope (fast-follow):**
- `lms_certificates` template CRUD (layout + orientation + merge fields + background Media).
- Assigning a template to a course (`course.certificateId`).
- **Issuance** on `lms.course_completed`: create `lms_certificate_issues` row with a unique serial; render PDF (stored in Media); idempotent (one active issue per user+course).
- **Download** (learner) + **public verification** page (`/verify/$serial`).
- Issuance email via Email Notifications.
- Revoke/reissue (admin) if a completion is reversed.

**Out of Scope (owned elsewhere):**
- Completion detection → `progress-completion-system` (emits the trigger).
- Course settings → `course-system`.
- Quizzes/assessment-based certificates → **not in scope** (no quizzes exist).
- Points logic → Progress (this system only displays points as a merge field).

---

## 2. Data Model

### 2.1 `lms_certificates` (templates)

```ts
lms_certificates: defineTable({
  title: v.string(),
  templateDoc: v.any(),                                // Tiptap/HTML layout with merge tokens
  orientation: v.union(v.literal("landscape"), v.literal("portrait")),
  backgroundMediaId: v.optional(v.id("media")),
  isActive: v.boolean(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_active", ["isActive"]);
```

### 2.2 `lms_certificate_issues`

```ts
lms_certificate_issues: defineTable({
  userId: v.id("users"),
  courseId: v.id("lms_courses"),
  certificateId: v.id("lms_certificates"),
  serial: v.string(),                                  // unique, verifiable
  pdfMediaId: v.optional(v.id("media")),
  issuedAt: v.number(),
  status: v.union(v.literal("issued"), v.literal("revoked")),
}).index("by_user", ["userId"]).index("by_serial", ["serial"]).index("by_user_course", ["userId", "courseId"]);
```

Merge tokens available to templates: `{{learner_name}}`, `{{course_title}}`, `{{completion_date}}`, `{{serial}}`, `{{points}}`.

---

## 3. Functions

### 3.1 Mutations
- `createTemplate / updateTemplate / deleteTemplate`.
- `issueCertificate(userId, courseId)` — internal-ish; idempotent; called by the `lms.course_completed` subscriber.
- `revokeCertificate(issueId)` / `reissue(issueId)`.

### 3.2 Actions (Node runtime)
- `renderCertificatePdf(issueId)` — merges template + data → PDF → stores Media → sets `pdfMediaId`.

### 3.3 Queries
- `listTemplates()` / `getTemplate(id)`.
- `getIssueForUserCourse(userId, courseId)` / `listIssuesForUser(userId)`.
- `verifyBySerial(serial)` — public → `{ valid, learnerName, courseTitle, issuedAt, status }`.

### 3.4 Event subscriber
- on `lms.course_completed` → if `course.certificateId` set → `issueCertificate` → `renderCertificatePdf` → email.

Gated by `lmsEnabled`; template management requires `lms.certificate.manage`; verification is public.

---

## 4. Admin UI

- `/admin/lms/certificates` — template list.
- `/admin/lms/certificates/$id` — template editor (Tiptap layout, merge tokens, orientation, background, preview with sample data).
- Course editor → certificate picker (writes `course.certificateId`).
- Enrollee view → issued/revoke/reissue.

## 5. Website UI

- `/dashboard/courses/$slug` completion → "Download Certificate".
- `/verify/$serial` — public verification page.

---

## 6. Events

- `lms.certificate_issued / revoked / reissued`

---

## 7. Acceptance criteria

### 7.1 Data (declared in v1)
- [ ] `lms_certificates` + `lms_certificate_issues` tables/indexes in v1 schema; `course.certificateId` FK exists.

### 7.2 Fast-follow
- [ ] Template CRUD with merge tokens + orientation + background.
- [ ] Issuance on `lms.course_completed` is idempotent with a unique serial.
- [ ] PDF rendered + stored in Media; emailed to learner.
- [ ] Learner download + public `/verify/$serial`.
- [ ] Revoke/reissue on completion reversal.
- [ ] `lms.certificate.manage` enforced; verification public.

---

## 8. References

- Code: `convex/lms/certificates/*`, `lms_certificates`, `lms_certificate_issues`
- Sibling PRDs: `progress-completion-system`, `course-system`, `media-system`, `email-notification-system`
- Airtable: ConvexPress base / Systems / "Certificate System"
