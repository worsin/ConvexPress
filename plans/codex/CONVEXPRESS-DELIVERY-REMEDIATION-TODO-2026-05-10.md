# ConvexPress Delivery Remediation TODO

Date: 2026-05-10
Scope: `ConvexPress-Admin/`, `ConvexPress-Website/`, admin-owned Convex backend, desktop shell

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[!]` Blocked or needs product decision

## Ground Rules

- Keep `ConvexPress-Admin/` as the only Convex owner.
- Do not add Convex schema/functions to `ConvexPress-Website/`.
- Prefer current source over historical docs when they conflict.
- Every remediation item needs either automated coverage or an explicit reason coverage is not practical.
- Existing dirty worktree changes are treated as user work and must not be reverted.

## P0 - Delivery Blockers

### 1. Real Browser Smoke Coverage

- [x] Add a reusable browser smoke harness for admin runtime checks.
- [~] Walk every static admin route in a real browser.
- [x] Fail on page crashes, console errors, uncaught exceptions, and failed app requests.
- [ ] Add representative dialog/pop-up coverage:
  - [~] API key create/revoke/key-created dialogs.
  - [~] Webhook create/created/test delivery dialogs.
  - [~] Audit export/clear dialogs.
  - [ ] User delete/deactivate/bulk role dialogs.
  - [ ] Menu delete dialog.
  - [ ] Permalink change dialog.
  - [ ] Media picker/lightbox flows.
  - [ ] WordPress sync add-site dialog.
  - [ ] Website comment flag dialog.
  - [ ] Dashboard avatar crop/delete-account dialogs.
- [ ] Add website browser smoke coverage for public and customer flows:
  - [~] Home, blog index/detail, page route, search.
  - [~] Product/shop/category/product detail/cart/checkout steps.
  - [~] Pricing/signup/subscription dashboard.
  - [~] Help center/category/article/search.
  - [~] Support new/tickets/detail/widget flows.
  - [~] Login/register/forgot/reset/verify/logout.
- [ ] Wire smoke commands into root scripts.
- [ ] Document required env/server assumptions.

Admin browser smoke command:

```bash
cd ConvexPress-Admin
ADMIN_SMOKE_BASE_URL=http://localhost:4105 \
ADMIN_SMOKE_USER=admin@example.com \
ADMIN_SMOKE_PASSWORD='...' \
bun run check:smoke:browser
```

The command intentionally reuses an already-running dev server. It does not
spawn Vite, Convex, or Electron.

Website browser smoke command:

```bash
cd ConvexPress-Website/apps/web
WEBSITE_SMOKE_BASE_URL=http://localhost:4106 \
bun run check:smoke:browser
```

This command also reuses an already-running dev server.

Acceptance:
- One command can run admin browser smoke against an existing dev server.
- One command can run website browser smoke against an existing dev server.
- Static route smoke remains green.

### 2. Subscription Payment Completion

- [x] Remove or production-gate subscription checkout stub activation.
- [x] Finish webhook-driven first payment activation for Stripe.
- [ ] Finish live dunning retry path instead of processor stub fallback.
- [ ] Finish live proration charge path instead of processor stub fallback.
- [ ] Verify off-session renewal charging against saved payment methods.
- [ ] Add tests for webhook activation, renewal, dunning success/failure, proration upgrade/downgrade.
- [ ] Ensure failed/async payment states surface clearly in admin and customer portal.

Acceptance:
- Paid subscription creation, renewal, failed renewal retry, and upgrade proration can run without stub payment success.

### 3. Invoice PDF Generation

- [x] Replace plain-text invoice placeholder with a real PDF generation path.
- [x] Store or stream generated invoice PDFs.
- [x] Add invoice number/date/tax/customer/subscription line details.
- [ ] Add admin/customer download tests.

Acceptance:
- Customer portal invoice download returns a PDF MIME payload and a `.pdf` filename.

### 4. Shipping Provider Completion

- [x] Replace local-only credential checks with live verification for FedEx, USPS, DHL, and ShipStation.
- [x] Implement concrete address validation provider calls for configured providers.
- [x] Implement USPS and DHL label voiding or hide unsupported operations.
- [ ] Add tracking sync support/fallback messaging for all supported shipment providers.
- [ ] Add tests for provider unavailable, credential invalid, live verification success, label void failure.

Acceptance:
- Shipping settings can verify real provider credentials and unsupported provider actions are not exposed as working features.

## P1 - High-Impact Product Gaps

### 5. Newsletter Subscription

- [x] Decide target destination: native subscribers table, email provider, or hide feature.
- [x] Add backend mutation/action for public newsletter signup.
- [~] Validate email, rate-limit, dedupe, and record consent timestamp/source.
- [x] Wire footer form to backend with success/error states.
- [ ] Add tests for duplicate signup and invalid email.

Acceptance:
- Footer newsletter form produces a persisted subscription or is removed from configurable layouts.

### 6. Structured Registration Status

- [x] Replace boolean registration-open query with `{ status, inviteOnly, open, defaultRole }`.
- [x] Preserve compatibility for existing callers or migrate all callers.
- [x] Update website registration gate to distinguish `open`, `invite_only`, and `closed`.
- [ ] Add tests for all three modes.

Acceptance:
- Website can render accurate register/invite/closed states.

### 7. Dashboard View Tracking and Content Performance

- [x] Define view event source for posts/pages/products/kb where applicable.
- [x] Persist bounded analytics suitable for dashboard widgets.
- [x] Replace dashboard content-performance coming-soon state.
- [ ] Add tests for aggregation.

Acceptance:
- Dashboard content performance is populated from real view tracking data.

### 8. Media Derivatives

- [ ] Decide whether PDF thumbnails/video posters are in local Convex runtime or external service.
- [ ] Implement PDF first-page thumbnail generation or remove claims/UI expectations.
- [ ] Implement video poster frames or remove claims/UI expectations.
- [ ] Add media regeneration support and tests for non-image assets.

Acceptance:
- PDFs/videos have deterministic preview behavior, not generic unfinished states.

### 9. Permalink Redirect Batch Generation

- [x] Add internal post query for all published posts needed by permalink redirect generation.
- [x] Implement batch redirect creation for old/new post permalink structures.
- [x] Add batching/idempotency safeguards.
- [ ] Add tests for changed category base, tag base, and post permalink structure.

Acceptance:
- Changing permalink structure can generate post-level redirects, not just taxonomy base redirects.

## P2 - Hardening and Quality

### 10. API Drift and Type Safety

- [ ] Inventory `anyApi`, `(api as any)`, `as any`, `@ts-nocheck`, and `@ts-expect-error` usage.
- [ ] Replace unsafe casts where generated API types are available.
- [ ] Keep website consumer proxy intentional, but add runtime route/function drift checks for critical calls.
- [ ] Add CI guard for accidental Convex backend code under `ConvexPress-Website/`.

Acceptance:
- Critical public checkout/auth/support calls are covered by contract checks even if website remains consumer-only.

### 11. Bundle Size

- [ ] Split admin editor/dashboard/commerce route chunks further.
- [ ] Split website theme/context and heavy route chunks.
- [ ] Add bundle size budget or warning documentation.

Acceptance:
- Builds still pass and primary entry chunks are below agreed thresholds.

### 12. Documentation Sync

- [ ] Update `.codex/audit-backlog` based on current implementation reality.
- [ ] Add notes for systems whose historical completion values are stale.
- [ ] Keep Claude originals untouched.

Acceptance:
- Codex-side docs match current code and this remediation list.

## Current Validation Baseline

- [x] `cd ConvexPress-Admin && bun run check-types`
- [x] `cd ConvexPress-Website && bun run check-types`
- [x] `cd ConvexPress-Admin && bun run check:guardrails`
- [x] `cd ConvexPress-Admin && bun run check:smoke`
- [x] `cd ConvexPress-Admin && bun run build`
- [x] `cd ConvexPress-Website && bun run build`
