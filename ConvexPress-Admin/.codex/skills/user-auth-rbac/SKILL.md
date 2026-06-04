---
name: user-auth-rbac
description: Use when the user asks to create, audit, debug, or improve ConvexPress users, roles, capabilities, permissions, profile, login/auth flows, API keys, session/security settings, Clerk integration, password flows, or route authorization.
---

# user-auth-rbac

Use this for identity and authorization. This system is high-risk because it
protects admin routes, customer data, API access, and extension capabilities.

## System Map

- Admin users: `apps/web/src/routes/_authenticated/_admin/users/**`
- Roles/capabilities:
  - `apps/web/src/routes/_authenticated/_admin/roles/**`
  - `apps/web/src/routes/_authenticated/_admin/tools/roles.tsx`
  - `apps/web/src/routes/_authenticated/_admin/tools/capabilities.tsx`
- API keys: `apps/web/src/routes/_authenticated/_admin/api-keys/**`
- Profile: `apps/web/src/routes/_authenticated/_admin/profile.tsx`
- Auth/settings: `settings/integrations.clerk.tsx`, security/password-related
  backend files.
- Backend: `packages/backend/convex/users`, `roles`, `auth`, `apiKeys`,
  `seed/roles.ts`, and route guards/capability helpers.
- Website auth: `../ConvexPress-Website/apps/web/src/routes/login.tsx`,
  `register.tsx`, `reset-password.tsx`, `dashboard/security.tsx`.

## Workflow

1. Identify whether this is user CRUD, role/capability registry, route guard,
   API key scope, profile, Clerk/local auth, or password/security flow.
2. Read existing guards and backend helpers before changing UI or permissions.
3. Do not invent new capabilities casually. If required, update seed/registry,
   checks, route visibility, and tests together.
4. Enforce server-side authorization; UI hiding alone is never sufficient.
5. For API keys, validate scope strings, token display-once behavior, revocation,
   audit logging, and HTTP handler enforcement.
6. For customer-facing auth, preserve redirect targets, email verification,
   password reset, and signed-out states.

## Verification

Run focused auth/RBAC tests where available and backend typecheck:

```bash
bunx tsc -p packages/backend/convex/tsconfig.json --noEmit
```

Smoke at least one allowed and one denied path when permissions change.

## Report

List changed capability/role/scope, protected routes or functions, escalation
risk, and verification.
