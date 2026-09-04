# Clerk connection

Customer sign-in for a ConvexPress website is provided by Clerk. Each site has
its own Clerk connection, managed from **Settings → Integrations → Clerk
connection** (`/settings/integrations/clerk`) in the admin. This document
covers what the page does, what happens underneath, and how to operate it.

## For operators

### Connect an existing Clerk app (one paste)

1. In Clerk Dashboard → Configure → API keys, copy the **secret key**.
2. In ConvexPress, open the site, go to Settings → Integrations → Clerk
   connection, paste the secret key, press **Connect**.
3. ConvexPress derives and configures everything else from that key:
   publishable key, Frontend API / JWT issuer, the `convex` token template (with
   the claims ConvexPress needs, including email), the site's origins in Clerk's
   redirect allow-list, the webhook app, and a snapshot of Clerk's sign-in
   options.
4. Press **Apply to deployment and redeploy** (desktop app). This writes
   `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` (and
   the webhook secret when set) on the site's Convex deployment and pushes the
   backend so the deployment trusts the new issuer. In a browser-hosted admin
   the page writes the variables through the control plane and shows the deploy
   command instead.
5. **Verify now** re-checks Clerk and the deployment; the readiness ledger turns
   green when customers can sign in.

### Start without a Clerk account (keyless)

Press **Create a keyless Clerk app**. ConvexPress asks Clerk for a claimable
development application, connects it exactly as above, and shows a **Claim in
Clerk** button. Claiming moves the app into your Clerk workspace with all
settings intact. Keyless apps are development instances: claim before relying
on them and create a production instance before launch.

### Webhook (optional)

Accounts are created the first time a customer signs in, so the webhook is not
required for sign-in to work. It additionally syncs profile changes made in
Clerk and deactivates deleted users. **Open Clerk webhook portal** opens Clerk's
Svix portal; add the endpoint URL shown on the page (the site's Convex
HTTP-actions address, `/webhooks/clerk`) with `user.created`, `user.updated`,
`user.deleted`, then paste the signing secret into the page.

### Sign-in options

The page shows what Clerk is configured to accept (identifiers, required
fields, verification strategy, social providers, bot protection, legal consent,
password rules, second factors). The website's login and registration forms
follow this snapshot. Press **Sync from Clerk** after changing options in the
Clerk dashboard.

### Sign-in probe (development instances)

Mints a real Clerk session token for a probe user through the `convex` template
and verifies it exactly like the deployment does (issuer, audience, email
claim). If this passes, customer tokens will be accepted.

## What is stored where

Site database, `settings` section `integrations.clerk`
(`packages/backend/convex/settings/defaults.ts` → `ClerkIntegrationSettings`):
secret key and webhook secret (encrypted), publishable key (encrypted at rest,
public by nature), Frontend API / issuer, instance id and environment type,
connection mode, claim URL, capability snapshot, verification results, webhook
receipt timestamp, registered site origins.

Site deployment environment variables (must match the settings):
`CLERK_JWT_ISSUER_DOMAIN` (read by `convex/auth.config.ts` at deploy time),
`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`.

Control plane, `overseer_websiteInstances.clerkPublishableKey`: mirrored on
connect so the desktop site runner starts local storefronts with the right key.

## How the website picks its Clerk app

`ConvexPress-Website/apps/web/src/routes/__root.tsx` loads
`auth/clerkPublic:getWebsiteAuthConfig` (public query) during SSR. The
publishable key is resolved in this order: site database → process env
(`CONVEXPRESS_CLERK_PUBLISHABLE_KEY` / `VITE_CLERK_PUBLISHABLE_KEY`) → build-time
env. `src/lib/auth/clerk.tsx` switches between the real Clerk provider and a
"not configured" shim at runtime, so one build serves every site.

The same query carries `capabilities` (normalised from Clerk's public
`/v1/environment`), which drives `RegisterForm`, `LoginForm`, `OAuthButtons`,
`verify-email` and the subscription/forms sign-ups through
`hooks/useSignUpFlow.ts` and the reducers in `lib/auth/clerk-flow.ts`.

## Backend map

- `packages/backend/convex/auth/clerkConnectionHelpers.ts` — pure: key
  derivation, domain selection, origin merging, environment normalisation,
  readiness ledger. Unit-tested.
- `packages/backend/convex/auth/clerkConnection.ts` — actions
  `connectWithSecretKey`, `startKeyless`, `verify`, `syncCapabilities`,
  `webhookPortalUrl`, `runTokenProbe`; query `getStatus`,
  `deploymentEnvChanges`; mutations `saveWebhookSecret`, `markClaimed`,
  `disconnect`.
- `packages/backend/convex/auth/clerkConnectionInternals.ts` — settings
  read/write with encryption, webhook receipt stamp.
- `packages/backend/convex/auth/clerkPublic.ts` — website contract.
- `packages/control-plane/convex/connections/siteAuth.ts` —
  `applySiteEnvironment` (writes env vars with the stored admin key),
  `issueDeploymentCredential` (lends the key to the desktop for the deploy).
- `packages/desktop/electron/ipc/siteDeploy.ts` — `site-deploy:run` IPC:
  env set + `convex deploy` for a site, streaming progress. In dev builds
  `CONVEXPRESS_DEPLOY_ORIGIN_MAP` rewrites LAN origins to SSH tunnels.

## Manual fallback

If the desktop app is not available, after connecting run from
`ConvexPress-Admin/packages/backend` (values shown on the page):

```
bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://<frontend-api> --url <deployment> --admin-key <key>
bunx convex env set CLERK_SECRET_KEY <sk_…> --url <deployment> --admin-key <key>
bunx convex deploy --url <deployment> --admin-key <key>
```

## Not automated (Clerk platform limits)

- Webhook endpoints cannot be created through Clerk's Backend API; the page
  embeds the portal link and the secret is pasted once.
- Production instances (custom domain, DNS) are created in the Clerk dashboard,
  or through Clerk's Platform API once beta access is granted.
- Clerk has no OAuth flow for workspace access; keyless + claim is the
  sign-in-to-Clerk moment.

## Fresh deployments: install from the desktop

A brand-new Convex deployment (cloud project or self-hosted backend) has no
ConvexPress code, so the controller's health probe fails and "Connect" cannot
succeed. In ConvexPress Desktop, both the **Add website** flow and the
environment's **Connect** dialog offer **Install ConvexPress and connect**.
With the deployment admin key entered once in the protected window, the
desktop:

1. lists the deployment's environment and fills only what is missing
   (`AUTH_ISSUER_URL`, `AUTH_ALLOWED_ORIGINS`, `AUTH_ALLOW_NULL_ORIGIN`,
   `SITE_URL`, the at-rest encryption keys `SHIPPING_PROVIDER_ENCRYPTION_KEY` and
   `WEBHOOK_SECRET_ENCRYPTION_KEY`, and `AUTH_PRIVATE_KEY`, each only when none
   exists; existing keys are never rotated),
2. deploys the backend (typechecked; `auth.config.ts` tolerates a missing
   `CLERK_JWT_ISSUER_DOMAIN`, so Clerk is added later from Integrations),
3. configures the site identity with the full management capability contract
   (`@convexpress/site-contract` `MANAGEMENT_CAPABILITY_CODES`; the desktop's
   copy is pinned by a unit test), seeds the built-in roles,
4. verifies the health endpoint, and
5. enrolls the controller connection with the same key.

Values never travel on the command line: environment variables are written
through a 0600 temp file (`convex env set --from-file`), and PEM fragments are
scrubbed from the install log. Failures show the deployment's real reason
(control-plane domain errors are surfaced as `ConvexError`, so "Deployment
origin is already attached to another environment" reads as such instead of
"Server Error").

## Self-hosted deployments in the setup wizard

The desktop setup wizard accepts a Convex Cloud URL (`https://name.convex.cloud`
with a `prod:` deploy key) **or** a self-hosted backend origin (`https://…`
anywhere, plain `http://` on private networks such as `127.0.0.1:3210` or a LAN
worker) with the admin key from `generate_admin_key.sh`. HTTP actions for
self-hosted backends are derived as port + 1. `*.convex.site` and link-local
addresses are rejected with a specific message.

## Desktop sessions survive relaunches

* **Control plane (Better Auth):** the operator session is kept by the
  cross-domain client in Electron's OS-encrypted `safeStorage`; browser builds
  use `localStorage` (Better Auth's default), so a tab or browser restart no
  longer signs the operator out.
* **Site mode (local admin auth):** browsers keep the HttpOnly
  `convexpress_refresh` cookie. That cookie cannot work for the desktop
  against a plain-http (LAN / self-hosted) deployment: cross-site fetches never
  send a `SameSite=Lax` cookie and `SameSite=None` requires `Secure`. The
  desktop therefore opts into a header transport (`X-ConvexPress-Session:
  token`): `/auth/login` and `/auth/refresh` also return the refresh token in
  the body, the renderer keeps it in `safeStorage` (main process, never in the
  page), and presents it on `X-ConvexPress-Refresh`; `/auth/logout` revokes it.
  See `convex/auth/refreshTransport.ts`.
