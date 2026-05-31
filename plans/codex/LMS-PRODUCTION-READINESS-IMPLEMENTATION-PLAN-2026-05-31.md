# LMS Production Readiness Implementation Plan

Date: 2026-05-31
Branch: `lms-extension`
Scope: ConvexPress LMS extension only.

## Objective

Bring the LMS extension from PRD-level MVP to paid-tester-ready quality. The
target is a system that can be exercised by real users after deployment and
human verification, with the remaining uncertainty limited to environment,
content, payment, and product acceptance checks.

## Strategy

1. Stabilize the backend first so frontend work can rely on generated Convex
   API types and deterministic access behavior.
2. Add seed data and regression tests around the LMS rules that are hardest to
   validate manually: access, membership, enrollment, drip, prerequisites,
   progress, completion, and certificates.
3. Close the public learner gaps: catalog discovery, preview lessons, account
   route parity, player progress, certificate verification, and disabled-plugin
   behavior.
4. Close authoring gaps in the admin workflow: rich lesson editing, end-to-end
   course creation, publishing, preview, progress, and certificate issuance.
5. Harden production surfaces: search, SEO, settings, AI jobs, RBAC, rate
   limits, accessibility, performance bounds, and smoke coverage.
6. Keep this branch LMS-only. Do not deploy shared Convex schema changes from
   this branch unless the Forms branch/schema ownership issue has been resolved.

## 24-Item Execution Checklist

1. **Backend TypeScript unblock and Convex API generation**
   - Remove stale type blockers.
   - Keep LMS backend functions typecheckable.
   - Regenerate route/API types when route or backend signatures change.

2. **Deployment safety and branch isolation**
   - Avoid shared Convex deploys that would mutate Forms-owned schema/indexes.
   - Treat source as ready for deploy once LMS and Forms schema ownership is
     reconciled.

3. **Deterministic LMS seed data**
   - Add resettable seed coverage for open, free, membership, certificate, and
     drip/linear course variants.
   - Seed membership plan/benefit/grant data needed for LMS access testing.

4. **Backend LMS access coverage**
   - Cover anonymous access, free enrollment, membership access, missing rules,
     prerequisites, drip locks, linear progression, and staff preview.

5. **Backend enrollment/progress/certificate coverage**
   - Cover seat limits, idempotent enrollment, burst rate limits, video/time
     gates, heartbeat completion, certificate issuance, rollback revocation, and
     idempotent manual issuance.

6. **Public LMS smoke coverage**
   - Verify catalog, first published course landing, and certificate verification
     routes in an anonymous browser context.

7. **Admin LMS workflow smoke coverage**
   - Verify course authoring, settings, topic/lesson creation, rich lesson edit,
     publish, learner preview, completion, certificate issue, and cleanup.

8. **Rich lesson editing**
   - Replace raw body/material textareas with a richer editor surface that
     supports expected authoring actions without adding fresh dependencies.

9. **Public preview lessons**
   - Allow public course landing pages to deep-link to preview lessons and
     render preview content without enrollment.

10. **Account course route parity**
    - Add `/account/courses` compatibility routes that redirect learners to the
      active dashboard/course surfaces.

11. **Catalog filters and search**
    - Support search, category, tag, and access filters on `/courses`.
    - Keep filter counts deployment-tolerant by deriving them from catalog data.

12. **Course SEO and structured data**
    - Add canonical metadata and Course JSON-LD to public course landing pages.

13. **Unified site search integration**
    - Index courses as searchable content.
    - Add course result rendering, filters, suggestions, and URLs.

14. **LMS settings and public plugin gating**
    - Add public/default `lmsEnabled` support.
    - Ensure website LMS surfaces close when the plugin is explicitly disabled.

15. **AI generation hardening**
    - Validate prompt inputs.
    - Add JSON cleanup/retry behavior.
    - Track regeneration jobs and provenance.
    - Fail jobs with useful errors when generation cannot complete.

16. **Video progress tracking**
    - Record learner heartbeat/watch fraction for video lessons.
    - Make manual completion respect watched fraction/time gates.

17. **Certificate verification and detail UX**
    - Harden serial validation.
    - Add public certificate detail pages with print/save support.
    - Link learner-issued certificates to the public verification surface.

18. **RBAC hardening**
    - Verify author/editor boundaries for editing and publishing.
    - Keep learner mutations scoped to the authenticated learner.

19. **Disabled-plugin behavior**
    - Verify public queries and write paths return closed/empty behavior when
      LMS is disabled.

20. **Enrollment abuse guards**
    - Add burst rate limiting for self-enrollment.
    - Preserve seat-limit behavior under repeat attempts.

21. **Learner state polish**
    - Improve public and dashboard copy around preview, access, progress,
      completion, and certificate states.

22. **Accessibility and UI polish**
    - Use semantic search/forms/buttons, labels, visible focus-friendly controls,
      stable layouts, and non-overlapping text.

23. **Performance bounds**
    - Keep public catalog/filter queries bounded.
    - Limit seed and search-index work to deterministic, scoped operations.

24. **Verification and repo hygiene**
    - Run backend tests, typechecks, browser smokes, and whitespace diff checks.
    - Keep dirty files LMS-scoped and avoid unrelated branch/schema churn.

## Verification Contract

Required automated checks for this branch:

```bash
cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin
bun test packages/backend/convex/lms/__tests__/access.test.ts
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit

cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web
bun run check-types
bunx playwright test tests/smoke/admin-lms-workflow.spec.ts --project=chromium-authed

cd /Users/worsin/Development/ConvexPress/ConvexPress-Website/apps/web
bun run check-types
PLAYWRIGHT_PORT=4107 bunx playwright test tests/smoke/anon-lms.spec.ts --project=chromium-anon

cd /Users/worsin/Development/ConvexPress
git diff --check
```

## Deployment Note

This branch is intentionally source-complete rather than shared-deployment
complete. A previous Convex dev push from this branch removed Forms indexes from
the shared backend because this LMS branch does not contain the Forms schema
work. Production or paid-tester deployment should happen only after LMS and
Forms schema ownership is reconciled or isolated per branch/deployment.
