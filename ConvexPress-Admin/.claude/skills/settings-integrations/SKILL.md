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

## Integrations hub (readiness)

`/setup` and `/settings/integrations` render one component,
`apps/web/src/components/integrations/hub/IntegrationsHub.tsx`. It is driven by:

- Registry: `packages/backend/convex/integrations/registry.ts` — the single list
  of providers, their fields (kind, required, env fallback), storage kind
  (`settings` section / `shipping` carrier store / `env` only / `link`), docs
  and console URLs. The web app imports it directly; never duplicate provider
  lists in the UI.
- Overview: `integrations/queries.overview` — per provider: field state
  (`set` / `env` / `empty`, values only for non-secrets), configured/missing,
  last check with `stale` (config fingerprint changed), shipping connection
  summary, and the encryption mode (`aes-gcm` vs `base64` fallback).
- Verification: `integrations/actions.verify({ providerId })` (node) makes a
  real read-only call to the provider, stores a safe summary in
  `integration_checks`, and returns it. Add a provider by adding a registry
  entry plus a `verifyX` function in `integrations/actions.ts`.
- Configure dialog saves settings providers through `settings.mutations.updateSection`
  with the FULL section (that mutation replaces the document with
  defaults + incoming; untouched secrets are sent as `__set__`).

Rules learned the hard way:

- In actions, resolve keys with `getServiceKeyFromAction` or
  `resolveServiceKeyAsync`; the sync `resolveServiceKey` returns ciphertext.
- Do not add large `returns` validators to functions in `integrations/*`;
  they exhaust the TypeScript instantiation budget (TS2589).
- `packages/backend/.env.local` targets the production deployment. Deploy or
  codegen against the test fleet with `--url http://127.0.0.1:148x0 --admin-key`
  only; never run bare `convex deploy` / `convex codegen` in that package.

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
