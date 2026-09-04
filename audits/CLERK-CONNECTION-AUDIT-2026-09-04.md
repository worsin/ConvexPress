# Clerk Connection Audit — 2026-09-04

Scope: Website Clerk login/registration, Admin Clerk settings, the Convex side of
Clerk JWT validation, and the multi-site (control plane + site runner) path that a
second website would take. Goal stated by the owner: a new site should be able to
plug in Clerk and have the custom front-end auth work no matter which options are
chosen in Clerk, ideally as a one-click "sign in to Clerk and it is wired" flow
from inside the admin, including the very first install where no Clerk exists.

## Verdict

**Not seamless. A second site cannot be connected to its own Clerk application from
inside the product today, and site #1 only works because three things were done by
hand outside the product.** The two values that actually gate authentication (the
JWT issuer domain on the Convex deployment and the publishable key in the website
process) are both outside the admin's control, and the one thing that creates the
ConvexPress user row on registration (the Clerk webhook) is marked optional and
has no automatic fallback.

The front-end auth screens are hard-wired to exactly one Clerk configuration
(email + password, first/last name required, email-code verification, Google and
GitHub buttons). Any other Clerk configuration produces dead ends.

The good news: Clerk's APIs support automating almost all of it, including creating
an application with no Clerk account at all (keyless) and a private-beta Platform
API that can create apps, production instances, JWT templates and redirect URLs and
transfer the app to a client's workspace. Details and a build plan are at the end.

## Where we stand, component by component

| Component | State | Evidence |
|---|---|---|
| Admin → Settings → Integrations → Clerk (secret key, webhook secret, issuer domain) | Built, per-site DB, secrets encrypted | `apps/web/src/routes/_authenticated/_admin/settings/integrations.clerk.tsx`, `settings/defaults.ts:428-434` |
| Integrations hub verifier for Clerk | Built: checks secret key, JWKS reachability, webhook secret presence | `packages/backend/convex/integrations/actions.ts:148-177` |
| Clerk webhook (Svix-verified) → upsert/delete users, email linking, invitation + registration gating | Built and tested (5 tests) | `auth/clerkWebhook.ts`, `auth/clerkSync.ts`, `auth/__tests__/clerkProvisioning.test.ts` |
| Server-side "ensure user exists in Clerk" for imports (phpass/bcrypt digest migration) | Built | `auth/clerkManagement.ts` |
| Password reset via Clerk Backend API | Built (custom token email, Resend) | `password/actions.ts:188-274` |
| Website runtime plumbing for a per-process publishable key | Built end to end, never fed | `ConvexPress-Website/apps/web/src/lib/site-runtime.ts`, `routes/__root.tsx:123-128`, `siteRunnerValidation.ts:212-215` |
| Clerk shim when no key present (dev only) | Built | `lib/auth/clerk-shim.tsx`, `vite.config.ts:30-52` |
| Desktop install wizard writing Clerk env to the deployment | Partial: reads the installer's `.env` files, no UI inputs, never writes webhook secret | `packages/desktop/electron/ipc/setup.ts:111-199` |
| Convex JWT provider for Clerk | **Env-only, deploy-time** | `packages/backend/convex/auth.config.ts:25-34` |
| Publishable key field anywhere in the product | **Missing** | no settings field, no site record field, no wizard input |
| On-demand user provisioning on first Clerk login | **Dead code** | `auth/clerkProvisioning.ts` `provisionClerkUser` has zero callers |
| Control-plane storage / push of per-site auth config | **Missing** | `overseer_websiteInstances` has no auth fields; `update_environment_variables` never called; `site.engine.deploy` has no handler |
| Clerk-side prerequisites (JWT template `convex`, allowed origins, redirect URLs, webhook endpoint) | **Manual, unverified** | no code path |
| Front-end adaptation to Clerk instance settings | **None** | forms hard-coded, see section 3 |

## 1. Why a fresh site fails today (blocking)

Ranked by how early they bite a new site.

1. **The issuer domain saved in the admin is inert.** `auth.config.ts` reads only
   `process.env.CLERK_JWT_ISSUER_DOMAIN` at deploy time. The settings value is
   validated, stored, and never used for JWT validation. Result: the admin page
   shows "Connected", Clerk signs the user in, and Convex sees an anonymous
   caller. The website dashboard shell spins on "Loading your dashboard…" or
   bounces to `/login`. Fixing it needs `convex env set` plus a redeploy of that
   site's backend, and nothing in the product does either for a fleet site.
2. **The publishable key is collected nowhere.** Not in the Clerk settings
   section, not in the site/environment records, not in the wizard. The site
   runner's `clerkPublishableKey` branch exists but neither target builder
   (`targetForEnvironment`, `targetForSingleSite` in `apps/web/src/lib/site-runner.ts:80-114`)
   sets it, so every locally launched storefront falls back to the shared
   checkout's `.env` and uses site #1's Clerk app. A production website build
   bakes a single key in at build time (`import.meta.env.VITE_CLERK_PUBLISHABLE_KEY`).
3. **Registration depends on a webhook the product calls optional.** The
   registry marks `clerkWebhookSecret` `required: false`, the wizard never writes
   it, and the current production deployment has no `CLERK_WEBHOOK_SECRET` env
   var. Yet the webhook is the only code that inserts the user row:
   `provisionClerkUser` (the on-first-login fallback) is never called by the
   website, and `authTracking.recordLogin` explicitly "no longer provisions users".
   Without the webhook a new customer registers in Clerk, lands on the dashboard,
   and `profiles.queries.getProfile` returns `null` forever.
4. **The webhook URL shown to paste into Clerk is wrong for a fleet.** It is
   built from `window.location.origin` of the admin renderer
   (e.g. `http://127.0.0.1:4105/webhooks/clerk`). The correct value is the site's
   HTTP-actions origin (`https://<deployment>.convex.site/webhooks/clerk`, or port
   plus one on self-hosted).
5. **Clerk-side prerequisites are never created or checked.** Convex requires a
   session token with `aud: convex` (the Clerk "Convex integration" toggle, or a
   JWT template named `convex`). The verifier probes JWKS but never lists JWT
   templates, so the single most common failure ("login works, nothing loads") is
   undetectable from the admin. Allowed origins, redirect URLs and the webhook
   endpoint with `user.created/updated/deleted` are also manual.
6. **No multi-site model for auth config.** The control plane holds each site's
   Convex admin key but never uses it to set environment variables, and there is
   no deploy handler. The auth-migration design (`specs/superpowers/2026-03-20-auth-migration-design.md:175-181`)
   assumed one deployment with env vars; the multi-site master plan never
   mentions per-site Clerk.
7. **First install has no Clerk path at all.** The wizard UI collects deployment
   URL, deploy key and first admin only. Clerk values are read from `.env` files
   on the installer's machine. A new operator with no Clerk account has no way
   forward except editing files.

## 2. What was done by hand for site #1

The current production deployment has `CLERK_SECRET_KEY` and
`CLERK_JWT_ISSUER_DOMAIN` set as env vars (names confirmed with `convex env list`)
and the website checkout has a single `VITE_CLERK_PUBLISHABLE_KEY` in three `.env`
files. Those three manual steps, plus whatever was clicked in the Clerk dashboard
(Convex integration, webhook endpoint), are the entire reason one site works.

## 3. Front-end robustness against Clerk settings

The owner's requirement is that the custom template's login and registration work
regardless of what is enabled in Clerk. Today the forms assume one configuration.
Each row below is a Clerk dashboard option and what happens now.

| Clerk option | What happens today | Where |
|---|---|---|
| Username required | `signUp.create` returns `missing_requirements`; code assumes that means email verification, sends the user to `/verify-email`; after the code is accepted sign-up is still incomplete: "Verification requires additional steps" dead end | `RegisterForm.tsx:95-110`, `verify-email.tsx:118-130` |
| Phone number required | Same dead end | same |
| First/last name disabled | Clerk rejects the unknown `first_name`/`last_name` params; raw Clerk error shown | `RegisterForm.tsx:80-85` |
| Email verification by link instead of code | `prepareEmailAddressVerification({strategy:"email_code"})` throws; registration stalls | `RegisterForm.tsx:97` |
| Passwordless sign-in (email code / magic link) | Login form is password-only; `signIn.create` returns `needs_first_factor`; "Additional verification is required. Please try again." dead end | `LoginForm.tsx:57-64` |
| MFA enabled (TOTP, SMS, backup codes) | `needs_second_factor` is not handled; same dead end; users with MFA can never sign in | `LoginForm.tsx:60-64` |
| Bot protection (CAPTCHA) | Custom flows must render `<div id="clerk-captcha">`; it is not rendered anywhere, so sign-ups can be rejected or forced through an invisible fallback | no element in any auth component |
| Legal consent required | Clerk expects `legalAccepted: true`; the form has its own Terms checkbox with `href="#"` placeholders and never passes consent to Clerk; `missing_requirements` dead end | `RegisterForm.tsx:236-262` |
| Sign-up mode restricted / waitlist | Clerk refuses sign-up; ConvexPress runs its own registration gate that does not know Clerk's mode, so the two gates can disagree | `RegistrationGate.tsx`, `registration/queries.ts` |
| Social providers | Google and GitHub are hard-coded; any other enabled provider is never shown; a disabled provider's button fails silently (`catch {}`) | `OAuthButtons.tsx:74-85,89-104` |
| OAuth redirect callback | `/api/auth/callback` immediately redirects to `/login` instead of running Clerk's redirect callback; first-time OAuth users (sign-in → transfer to sign-up) are dropped | `routes/api/auth/callback.tsx` |
| Password policy (min length, special chars, zxcvbn, HIBP) | Client checks "8 characters" only; the policy surfaces as post-submit Clerk errors; strength meter ignores Clerk's settings | `RegisterForm.tsx:58-61`, `PasswordStrengthIndicator.tsx` |
| Remember me | Checkbox is decorative; nothing is sent to Clerk | `LoginForm.tsx:31,131-139` |
| Password reset | Custom token email via Resend plus Backend API `PATCH /users/{id}` password; requires Resend configured and a `clerkUserId`; OAuth-only users get a silent no-op | `password/actions.ts` |
| SSR | `@clerk/tanstack-react-start` is installed but unused; the site uses `@clerk/clerk-react` only, so SSR renders signed-out and protected pages flash | `package.json:24-25`, `__root.tsx` |

Clerk exposes every one of these settings through the public Frontend API
`GET {frontendApi}/v1/environment` (no auth; it is what clerk-js loads on boot).
The response includes `user_settings.attributes.{email_address,username,phone_number,first_name,last_name,password}.{enabled,required,verifications}`,
`user_settings.social.oauth_*.enabled`, `user_settings.sign_up.{captcha_enabled,captcha_widget_type,progressive,mode,legal_consent_enabled}`,
`user_settings.password_settings.*`, `user_settings.sign_in.second_factor`, and
`display_config.{captcha_public_key,terms_url,privacy_policy_url}`. Confirmed
against Clerk's published OpenAPI spec (`fapi/2025-04-10.yml`). That document
should drive the forms.

## 4. What Clerk's APIs allow (verified against Clerk's OpenAPI specs)

Backend API, authenticated by the instance secret key (`bapi/2025-04-10.yml`):

- `GET /v1/domains` returns the primary domain with `frontend_api_url`. From that
  host the publishable key is derivable (`pk_test_`/`pk_live_` + base64 of
  `host$`), and the JWT issuer is `https://<host>`. The desktop wizard already
  does the reverse derivation (`setup.ts:144-165`). So one secret key is enough
  to recover publishable key and issuer.
- `GET /v1/instance` returns `environment_type` and `allowed_origins`;
  `PATCH /v1/instance` sets `allowed_origins`, `development_origin`, `support_email`.
- `GET/POST /v1/jwt_templates` lists and creates JWT templates
  (`{name:"convex", claims:{aud:"convex"}}`), which is the API equivalent of the
  dashboard's Convex integration toggle.
- `GET/POST /v1/redirect_urls` manages the OAuth redirect allowlist.
- `POST /v1/webhooks/svix` creates the Svix app; `POST /v1/webhooks/svix_url`
  returns an embeddable Svix portal URL. Webhook endpoints themselves are not
  creatable through Clerk's Backend API; the portal (embeddable in the admin) is
  the closest to one click, after which the signing secret is pasted once.
- `POST /v1/sign_in_tokens` plus `GET /v1/sessions/{id}/tokens/convex` allows a
  real end-to-end verification: mint a token for a test user, present it to
  Convex, confirm identity resolves.

Keyless / accountless (used by Clerk's own SDKs, `@clerk/backend`
`AccountlessApplicationAPI`): `POST https://api.clerk.com/v1/accountless_applications`
with no credentials returns `publishable_key`, `secret_key`, `claim_url`,
`api_keys_url`. It creates a development instance owned by nobody; opening
`claim_url` and signing into Clerk moves it into the user's workspace. This is the
"install with zero Clerk setup" path and the closest thing to "log into Clerk and
poof". Caveats: marked experimental in the SDK, development instance only, and
must be claimed before production use.

Platform API (`platform/beta.yml`, **private beta, access by request form**),
authenticated by a workspace-level Platform token: `POST /platform/applications`
(returns instances with `publishable_key` and `secret_key`),
`POST /platform/applications/{id}/instances` (production instance for a domain,
optionally cloning dev config), domains with DNS status checks, JWT templates,
redirect URLs, instance config get/patch with a JSON schema, and application
transfers that produce a `dashboard.clerk.com/apps/transfer?code=` link for a
client's workspace. This is the agency model for a 10+ site fleet: ConvexPress
creates and configures, then transfers. Clerk has no public OAuth flow for
workspace access; the Platform token is the "sign in once" credential.

Clerk CLI (`clerk` 3.3.0 on npm, published 2026-09-02, so inside the 30-day
quarantine until 2026-10-02) wraps the same APIs (`apps create`, `config patch`,
`deploy`, `api --platform`). Not needed if we call the APIs directly.

## 5. Target design: "Clerk Connection" per site

One page per site under Settings → Authentication, with three entry paths and a
single verified state model.

Entry paths:

1. **Start without a Clerk account** (first install default). Create an
   accountless application, store keys, continue with the same pipeline as path
   2, then show a persistent "Claim this app in Clerk" card linking to
   `claim_url`. After claiming, re-verify.
2. **Connect an existing app with one secret key.** Paste `sk_…`. The backend
   derives the frontend API, publishable key and issuer from `GET /v1/domains`,
   records `environment_type`, ensures the `convex` JWT template, adds the site's
   origins to allowed origins and redirect URLs, and creates the Svix app.
3. **Create through the Platform API** (once beta access is granted; operator
   pastes the Platform token once at the fleet level). Create app + dev instance,
   later create the production instance for the site's domain and surface Clerk's
   DNS status checks; optionally transfer to the client's workspace.

Common pipeline after keys are known:

1. Persist `clerkSecretKey`, `clerkPublishableKey`, `clerkJwtIssuerDomain`,
   `clerkEnvironmentType`, `clerkFrontendApi`, `clerkInstanceId`,
   `clerkWebhookSecret` in `integrations.clerk` (new fields) and mirror the
   non-secret subset onto `overseer_websiteInstances` so the site runner and the
   fleet builds get the publishable key.
2. Push `CLERK_JWT_ISSUER_DOMAIN` and `CLERK_SECRET_KEY` to that site's
   deployment and redeploy. Desktop already knows how (`setup.ts:287-325`); the
   change is to target the selected site using its stored admin key instead of
   the bundled backend. For self-hosted backends the env write can also go
   through the deployment's `update_environment_variables` HTTP endpoint with
   the admin key; the push is still required because `auth.config.ts` is
   evaluated at push time.
3. Webhook: create the Svix app, embed the Svix portal with the correct
   `https://<managementOrigin>/webhooks/clerk` URL prefilled in the instructions,
   accept the signing secret, then fire a test event and confirm receipt.
4. Sync the Clerk environment document (`/v1/environment`) into a per-site
   `authCapabilities` settings section on connect and on demand, and expose it
   to the website through `settings.queries.getPublic`.
5. Verify end to end and show a readiness ledger: secret key valid, issuer JWKS
   reachable, `convex` template present, env var on deployment matches, deploy
   is current, publishable key served by the website process, webhook
   delivering, test session accepted by Convex.

Website changes so the template works under any Clerk configuration:

- Drive sign-up fields from `authCapabilities.attributes` (show username/phone
  only when enabled, mark required per Clerk, omit names when disabled) and pass
  `legalAccepted` when consent is on.
- Replace the status guesswork with a state machine over
  `signUp.missingFields`, `signUp.unverifiedFields`, `signIn.supportedFirstFactors`
  and `signIn.supportedSecondFactors`: email code, email link, phone code,
  password, TOTP, backup code, and the reset-password first factor.
- Render `<div id="clerk-captcha">` when `sign_up.captcha_enabled`.
- Build the social button list from `social.oauth_*.enabled`.
- Turn `/api/auth/callback` into a real redirect handler
  (`AuthenticateWithRedirectCallback`, or `handleRedirectCallback` with transfer
  handling) and pass absolute redirect URLs.
- Feed Clerk's `password_settings` into the strength indicator and pre-submit
  validation.
- Call `provisionClerkUser` on the first authenticated render (dashboard shell)
  so a missing webhook degrades to "profile sync delayed" instead of "no account".
- Move to `@clerk/tanstack-react-start` for SSR auth once the above is stable
  (optional, quality improvement).

## 6. Build plan, in order

1. **Stop the silent failures (backend + admin, small).** Call
   `provisionClerkUser` on first authenticated load; fix the webhook URL to use
   the site's management origin; add `clerkPublishableKey` and derived fields to
   `integrations.clerk`; extend the verifier to list JWT templates, compare the
   deployment's env var to the saved issuer, and report "redeploy required".
2. **Env push + deploy for the selected site (desktop + control plane).** A
   `site.auth.apply` operation that sets env vars on the target deployment with
   its admin key and runs the deploy, with the readiness ledger above.
3. **Publishable key transport.** Store it on the environment record, set it in
   both site-runner target builders, and make production builds read it from
   the server env (already supported by `site-runtime.ts`) instead of build time.
4. **Clerk Connection page** with the three entry paths, the Svix portal embed,
   and the environment sync.
5. **Website auth state machine** driven by `authCapabilities`, with Playwright
   coverage for each Clerk configuration (username required, passwordless, MFA,
   captcha, legal consent, link verification, each social provider on/off).
6. **Platform API tier** once Clerk grants beta access (submit the request form
   now; it is the only user-gated item).

## 7. Manual checklist to bring up a second site today

Until the above lands, this is the full set of hand steps for site #2:

1. Create a Clerk application; activate the Convex integration (or create JWT
   template `convex` with `aud: convex`); note Frontend API URL, `pk_`, `sk_`.
2. Add the site's origins (public URL and local dev port) to allowed origins and
   OAuth redirect URLs.
3. Add a webhook endpoint `https://<site-deployment>.convex.site/webhooks/clerk`
   subscribed to `user.created`, `user.updated`, `user.deleted`; copy `whsec_`.
4. On the site's Convex deployment: `convex env set CLERK_JWT_ISSUER_DOMAIN …`,
   `convex env set CLERK_SECRET_KEY …`, then redeploy (`--url`/`--admin-key`).
5. In the admin, select the site, paste secret key, issuer, webhook secret.
6. Launch the storefront with `CONVEXPRESS_CLERK_PUBLISHABLE_KEY=pk_…` exported
   (or edit the shared website `.env`, which breaks site #1's local runs).
7. Register a test user and confirm the user row appears (webhook) and the
   dashboard loads (JWT accepted).
