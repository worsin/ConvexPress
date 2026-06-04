---
name: notifications-events
description: Use when the user asks to create, audit, debug, or wire events, actions, email notifications, site notifications, notification preferences, templates, listener registration, or event-driven automation in ConvexPress.
---

# notifications-events

Use this when behavior should emit or respond to an event, send site/email
notifications, or appear in Airtable/GitHub docs as an action/event relation.

## System Map

- Events/constants: `packages/backend/convex/events/constants.ts`
- Emit helpers: `packages/backend/convex/events/`
- Listener bootstrap: `packages/backend/convex/bootstrap/registerListeners.ts`
- Notification engine: `packages/backend/convex/notificationEngine/`
- Site notifications: `packages/backend/convex/notifications/`
- Email registry/defaults/internals:
  - `packages/backend/convex/emails/registry.ts`
  - `packages/backend/convex/emails/templateDefaults.ts`
  - `packages/backend/convex/emails/internals.ts`
- Admin routes:
  - `apps/web/src/routes/_authenticated/_admin/tools/events.tsx`
  - `tools/email-notifications.tsx`
  - `tools/site-notifications.tsx`
  - `settings/email*`
  - `settings/notifications.tsx`

## Workflow

1. Identify whether the task is event definition, event emission, listener,
   email template, site notification, preference, or audit table mapping.
2. Reuse existing event naming by system prefix (`lms.*`, `form.*`,
   `purchase.*`, `commerce.*`, etc.).
3. Emit events from backend mutations/actions after the state change succeeds.
4. Keep payloads stable, minimal, and documented in code/tests when possible.
5. For email, update registry, defaults, internals, and tests together.
6. For site notifications, update validators/defaults and engine channel tests.
7. Avoid duplicate user notifications when a domain event and a purchase/order
   event both fire.

## Verification

Run focused registry/channel tests plus backend typecheck:

```bash
bun test packages/backend/convex/emails/__tests__/registry.test.ts packages/backend/convex/notificationEngine/__tests__/registry.test.ts
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit
```

For new domain events, add or run tests around the mutation/action that emits
them.

## Report

List event codes, payload shape, listeners, email/site notifications, duplicate
delivery risk, and verification.
