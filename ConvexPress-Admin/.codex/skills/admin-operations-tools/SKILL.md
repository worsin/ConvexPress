---
name: admin-operations-tools
description: Use when the user asks to build, audit, debug, or improve ConvexPress admin dashboard, activity logs, audit logs, routes registry, webhooks, system tools, update screens, health/diagnostics, operational dashboards, or cross-system admin utilities.
---

# admin-operations-tools

Use this for operational/admin infrastructure that does not belong to one
business domain.

## System Map

- Dashboard: `apps/web/src/routes/_authenticated/_admin/dashboard*`
- Tools routes:
  - `tools/activity.tsx`
  - `tools/audit-log/**`
  - `tools/routes.tsx`
  - `tools/events.tsx`
  - `tools/email-notifications.tsx`
  - `tools/site-notifications.tsx`
  - `tools/404-log.tsx`
  - `tools/redirects/**`
- Webhooks: `apps/web/src/routes/_authenticated/_admin/webhooks/**`
- Updates: `apps/web/src/routes/_authenticated/_admin/updates.tsx`
- Backend domains: audit logs, activity logs, route registry, webhooks,
  diagnostics, event/notification tools.

## Workflow

1. Identify operational surface: dashboard widget, audit/activity log, routes,
   webhook, diagnostics, update flow, or cross-system tool.
2. Read both UI route and backend query/mutation/action.
3. Preserve admin-only access and auditability.
4. For webhooks, verify signing, secret handling, retries, delivery logs, test
   dispatch, and failure states.
5. For audit/activity logs, avoid PII/secret leakage in payloads and preserve
   filters/pagination.
6. For routes/tools registries, keep generated/scanned state aligned with actual
   route files.
7. For events/notifications, also use `notifications-events`.

## Verification

Run backend typecheck and smoke the admin tool route. For webhook changes, test
delivery or explain why provider/network verification remains manual.

```bash
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit
```

## Report

List operational surface, access/audit implications, cross-system dependencies,
and verification.
