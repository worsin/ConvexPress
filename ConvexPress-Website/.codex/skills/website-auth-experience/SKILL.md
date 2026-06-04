---
name: website-auth-experience
description: Use when the user asks to build, audit, debug, or improve public authentication and account-entry flows: login, register, signup offers, logout, forgot password, reset password, verify email, auth callbacks, protected-route redirects, Clerk/local auth wiring, or post-login destinations.
---

# website-auth-experience

Use this for Website auth entry points and redirect behavior. Admin owns backend
auth/user data; Website owns the public route experience.

## System Map

- Routes:
  - `apps/web/src/routes/login.tsx`
  - `register.tsx`
  - `signup.$offerId.tsx`
  - `forgot-password.tsx`
  - `reset-password.tsx`
  - `verify-email.tsx`
  - `logout.tsx`
  - `api/auth/callback.tsx`
- Dashboard protection: `apps/web/src/routes/dashboard.tsx`
- Backend owner: `../ConvexPress-Admin/packages/backend/convex/auth`,
  `users`, Clerk/local auth helpers.
- Admin skill: use `user-auth-rbac` for backend/roles/capability work.

## Workflow

1. Identify flow: sign-in, registration, offer signup, reset, verification,
   callback, logout, or protected-route redirect.
2. Read the route and backend/auth provider contract.
3. Preserve safe redirect handling and do not allow open redirects.
4. Keep error, loading, expired token, invalid token, and already-signed-in
   states clear.
5. For offer signup, verify the offer/subscription/membership effect.
6. Do not put secrets or server-only auth logic in client components.

## Verification

Run Website checks and browser-smoke the relevant auth route. For backend auth
changes, run Admin backend typecheck/tests.

```bash
bun run check-types
bun run build
```

## Report

List flow, redirect behavior, provider/backend contract, security risks, and
verification.
