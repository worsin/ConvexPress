# MVP Stabilization Ledger - 2026-05-23

This ledger records the current MVP disposition after the Codex stabilization pass on May 23, 2026.

## Verified In This Pass

- Admin backend/provider blockers:
  - Subscription renewal, dunning, upgrade proration, checkout activation, and first-charge flows now fail closed for paid invoices when live subscription charging is not configured. Zero-dollar/free subscription paths remain usable.
  - Support inbound webhooks are signed by default. Unsigned inbound channels must opt in with `allowUnsigned: true`; otherwise missing or invalid HMAC signatures are rejected.
  - Media API upload is truthful: POST `/api/v1/media` either issues a Convex storage upload URL or finalizes an uploaded `storageId` into a real media row.
  - Public routing redirect functions are available to the website middleware and deployed to the current Convex deployment.
- Website production blockers:
  - Paid subscription signup is disabled when live charging is not configured; zero-dollar offers activate through the explicit free path.
  - Checkout payment method selection disables card checkout when Stripe publishable settings are missing and blocks review submission for unusable card payment.
  - Analytics tracking no longer leaks console errors when the current Convex deployment lacks the HTTP ingestion endpoint; it disables further client sends after 404/405.
  - Homepage fallback is real content using published posts instead of a developer health-check page.
  - Page/post password gate comments now reflect the existing backend verification functions.
- User-facing copy cleanup:
  - Removed misleading "pending/stub" UI copy from custom fields, products, pricing renderer comments, and default template-part fallback text.

## System Disposition

- Auth, roles, capabilities, registration, password reset: MVP wired through existing Admin/Website routes and covered by type checks, route smoke, and existing backend tests. Authenticated browser smoke still requires test credentials.
- Pages, posts, taxonomies, menus, routing, SEO, sitemap/feed: MVP wired. Website route smoke covers public routes; SEO and bundle checks pass. Redirect middleware now calls public Convex functions.
- Media: MVP wired for Admin UI, Convex storage, API upload URL, and API finalization. External API clients still need a manual upload/finalize exercise with a real file.
- Commerce core, products, variants, cart, checkout, orders, discounts, tax helpers, returns, reviews, wishlists: MVP covered by backend unit tests, website unit tests, website browser smoke, and production build. Provider-specific live payment/shipping/tax paths require credentials.
- Subscriptions, membership, restrictions: MVP gated. Free subscriptions and entitlement bridge logic are covered; paid charging requires Stripe configuration and webhook validation.
- Shipping: MVP internal rate/zone/label systems are present and covered by build/tests, but carrier actions require sandbox/live credentials before production enablement.
- Support, KB, tickets, comments, search: MVP routes/functions are wired and smoke-covered on public website routes. Inbound provider webhook security is now explicit.
- Analytics, notifications, email, GA4: MVP internal paths are wired; external delivery/reporting requires configured provider credentials.
- WordPress/Airtable sync: Implementation remains present as an ops system. Provider/source-account verification requires external credentials and a chosen source dataset.
- Themes, layouts, blocks, desktop: Builds pass; website rendering smoke and admin static route smoke cover major surfaces. Desktop packaging builds through the Admin monorepo build.

## Validation Commands

Admin:

- `bunx convex dev --once` in `ConvexPress-Admin/packages/backend` - deployed current Convex functions.
- `bunx convex run routing/public:resolveRedirect '{"url":"/"}'` - deployed public redirect function callable.
- `bunx convex codegen` in `ConvexPress-Admin/packages/backend` - passed.
- `bun run check-types` in `ConvexPress-Admin` - passed.
- `bun run check:smoke` in `ConvexPress-Admin` - passed, 409 generated routes and 123 nav targets checked.
- `bun test packages/backend/convex --timeout 30000` in `ConvexPress-Admin` - passed, 879 tests.
- `bun run build` in `ConvexPress-Admin` - passed. Vite reports large chunk warnings for the admin/desktop bundles.
- `bunx playwright test --project chromium-anon` in `ConvexPress-Admin/apps/web` - passed, anonymous root smoke.

Website:

- `bun run quality` in `ConvexPress-Website/apps/web` with root `.env.local` loaded - passed lint, type check, build, SEO check, bundle check, and SSR smoke.
- `bun test apps/web/src --timeout 30000` in `ConvexPress-Website` - passed, 39 tests.
- `bun run check:smoke:browser` in `ConvexPress-Website/apps/web` - passed, 42 routes checked.
- `bunx playwright test --project chromium-anon` in `ConvexPress-Website/apps/web` - passed, 36 anonymous browser/API smoke tests.

## External Or Human-Only Validation

These systems are MVP-gated instead of silently simulated:

- Stripe commerce checkout: requires publishable key, secret key, webhook signing secret, successful test card payment, failed card path, refund/chargeback webhook smoke, and production mode review.
- Stripe subscriptions: requires enabling live subscription charging, first-charge setup, renewal invoice charge, failed renewal/dunning, saved payment method, portal/change-payment flow, and webhook replay.
- PayPal: requires sandbox/live client credentials, webhook ID, order capture/refund webhook tests, and mode review.
- Carrier shipping providers: ShipStation, USPS, UPS, FedEx, and DHL require sandbox/live credentials for rate, label, void, tracking, and webhook checks.
- Resend/email: requires API key/domain verification and at least one test send for transactional and newsletter paths.
- Clerk: authenticated admin and website Playwright suites require smoke users. Admin browser route smoke currently stops at login without `ADMIN_SMOKE_USER` and `ADMIN_SMOKE_PASSWORD`.
- GA4/Google integrations: require service account/API key credentials and property-level sandbox/live verification.
- Airtable and WordPress sync: require source credentials and a selected source/base/site for import and reconciliation QA.
- Support inbound providers: each provider/channel must configure a signing secret or an explicit `allowUnsigned: true` setting before inbound traffic is accepted.
- Media external API: requires a manual three-step client test: request upload URL, upload binary to Convex storage, finalize with `storageId`.

## Deployment Notes

- Convex function paths use slash syntax such as `settings/queries:getBySection`, not stale colon examples such as `settings:queries:getBySection`.
- The current deployed settings validator does not accept a `brand` settings section; brand data should use the implemented settings sections until docs/design examples are updated.
- Large admin bundle warnings remain build warnings, not build failures. They should be handled as a performance follow-up, not an MVP blocker.
