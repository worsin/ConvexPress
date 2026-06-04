---
name: settings-integrations
description: Use when the user asks to configure, audit, debug, or improve ConvexPress settings, site identity, appearance/theme settings, AI settings, email settings, analytics integrations, Stripe, PayPal, Clerk, Google, shipping provider credentials, media settings, privacy, reading/writing, permalinks, or tools settings.
---

# settings-integrations

Use this for site-wide configuration and provider integration surfaces. Settings
often feed both Admin and Website behavior.

## System Map

- Admin settings routes: `apps/web/src/routes/_authenticated/_admin/settings/**`
- Appearance/theme routes: `apps/web/src/routes/_authenticated/_admin/appearance/**`
- Layouts: `apps/web/src/routes/_authenticated/_admin/layouts/**`
- Backend domains: `packages/backend/convex/settings`, provider integration
  helpers, email settings, shipping provider configs, payment configs.
- Website consumers: brand/site identity, theme/layout rendering, auth/payment
  callbacks, analytics, media constraints.

## Workflow

1. Identify settings section: general, writing, reading, discussion, privacy,
   permalinks, media, email, notifications, AI, analytics, appearance, layouts,
   or provider credentials.
2. Read settings schema/defaults and the route before editing.
3. Keep secrets out of tracked files and UI responses. Use env vars or secret
   storage patterns already present in the codebase.
4. Preserve validation and preview/test actions for provider credentials.
5. When settings affect public rendering, update Website consumers and smoke the
   relevant route.
6. For appearance/layout/theme work, verify fallback behavior when no custom
   setting exists.

## Verification

Run backend typecheck and smoke the settings route touched. For providers, use
safe test/validation endpoints and do not claim live success without credentials.

```bash
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit
```

## Report

List settings section, persisted keys, secret-handling behavior, public/provider
impact, and verification.
