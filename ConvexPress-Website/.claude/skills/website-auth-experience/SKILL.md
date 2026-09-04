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
- Clerk wiring (runtime-switched): `apps/web/src/lib/auth/clerk.tsx` (import
  Clerk hooks from here, never from `@clerk/clerk-react`), shim in
  `lib/auth/clerk-shim.tsx`, site config via `contexts/AuthConfigContext.tsx`
  (loaded in `routes/__root.tsx` from `auth/clerkPublic:getWebsiteAuthConfig`).
- Adaptive forms: `lib/auth/capabilities.ts` (what Clerk accepts),
  `lib/auth/clerk-flow.ts` (next-step reducers, unit-tested),
  `hooks/useSignUpFlow.ts`, `components/auth/{SignUpFields,LegalConsent,CodeInput}.tsx`.
  Forms must follow capabilities (fields, verification strategy, social
  providers, captcha `#clerk-captcha`, consent, password rules, second factors).
- First-sign-in provisioning: `hooks/useEnsureCustomerAccount.ts` (called by
  `dashboard/DashboardShell.tsx`); the webhook is optional.
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
