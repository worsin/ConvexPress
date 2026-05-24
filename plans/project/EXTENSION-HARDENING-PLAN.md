# Extension Hardening Plan — Beta-Readiness Master Instruction Set

Source: Codex audit, 2026-04-15.
Scope: Every registered extension + shipping subsystem + global gating + typecheck + production certification.
Execution: Sequential phases. Each phase has acceptance criteria. No phase ends until its verification passes.

Registered extensions under scrutiny:
Commerce, Digital Products, Product Reviews, Wishlists, Product Bundles, Returns & RMA, Commerce Subscriptions, Membership, Knowledge Base, Support Tickets, Custom Fields, Recipes, Image Galleries. Shipping is treated as a Commerce-dependency blocker.

--------------------------------------------------------------------------------

## PHASE 0 — GROUND RULES (applies to every phase)

0. **NO FEATURE REMOVAL.** Hardening is additive and corrective only. Features, fields, routes, capabilities, UI, and backend functions that already exist stay. If something is broken, fix it; if it is unfinished, finish it; if it is unused, wire it up. Never delete an existing feature to make an error go away. If a registry claim (e.g. a route prefix, a nav entry) has no corresponding implementation, the fix is to **build the implementation**, not retract the claim. The only things that may be removed are: dead code paths with zero user-visible effect, `@ts-nocheck` suppressions, and placeholder/stub code being replaced by real behavior.
1. Deploy backend to `amiable-mongoose-989.convex.cloud` after every schema or function change with `bunx convex deploy --typecheck=disable`.
2. After each phase, run `bun run check-types` in `ConvexPress-Admin/apps/web` and `ConvexPress-Website/apps/web`. Phase cannot close with new regressions; extension-owned errors must drop monotonically.
3. After each phase, re-audit the changed routes via Chrome DevTools MCP: navigate, snapshot console, confirm no new runtime errors.
4. Use real providers with sandbox keys when they are present in settings; otherwise gate the feature behind "not configured" UX, never crash.
5. Never hide a problem behind `@ts-nocheck`. Removing `@ts-nocheck` is part of each extension's done-criteria.
6. Commit work in phase-sized chunks with a clear commit message. No giant end-of-day dumps.
7. User-blocking items (anything requiring real carrier/merchant accounts, live keys, legal/compliance sign-off, or provider-side certification) go into `BLOCKED_ON_USER.md`.

--------------------------------------------------------------------------------

## PHASE 1 — CENTRALIZE THE EXTENSION GATE

Goal: one source of truth that nav, admin routes, public routes, loaders, and backend functions all consult.

### 1.1 Canonical registry
- Keep `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts` as the single frontend registry. Correct every `adminAccessPrefixes` to match the real TanStack paths so guards actually match the routes. If a claimed prefix has no route yet, build the route (per ground rule 0).
- Narrow the Gallery registry entry so it no longer swallows the core Media Library prefix. Gallery keeps its own `/admin/gallery*` prefixes; Media Library stays core and ungated.
- Export `isPluginEnabled(pluginId, settings)` as the single predicate; nav, guards, and backend callers all import this.

### 1.2 Backend plugin registry (new)
- Add `packages/backend/convex/plugins/registry.ts` that mirrors the frontend IDs and publishes a `requirePluginEnabled(ctx, pluginId)` helper that throws `ConvexError({ code: "PLUGIN_DISABLED", pluginId })`.
- Source of truth for enablement: `settings` table, section `plugins.extensions` (new). Default-enable Commerce + anything currently shipping enabled; default-disable pre-beta extensions we have not hardened yet.
- Add a one-shot migration to backfill `plugins.extensions` from any legacy flags.

### 1.3 Admin layout guards
Wrap these parent routes with `PluginGuard`:
- `routes/_authenticated/_admin/kb.tsx` → pluginId `knowledge-base`
- `routes/_authenticated/_admin/tickets.tsx` → pluginId `support-tickets`
- `routes/_authenticated/_admin/custom-fields.tsx` → pluginId `custom-fields`
- `routes/_authenticated/_admin/commerce/returns.tsx`, `bundles.tsx`, `reviews.tsx`, `digital.tsx`, `subscriptions.tsx`, `/commerce/settings/shipping` tree, `membership/*`, `recipes/*`, `gallery/*` — verify each parent has PluginGuard.

### 1.4 Nav entries
In `nav-config.ts`, attach `pluginId` to every extension nav item (Commerce, Digital, Reviews, Wishlists, Bundles, Returns, Subscriptions, Membership, KB, Tickets, Custom Fields, Recipes, Galleries). Nav is hidden purely off `isPluginEnabled`.

### 1.5 Public route gates
- Add `PublicPluginGate` wrappers to `_marketing/help.tsx`, `_marketing/support.tsx`. For routes where loaders fetch before gate renders (`gallery/$slug.tsx`, `gallery.tsx`, `recipes/$slug.tsx`, `recipes.tsx`, `recipes/categories/$slug.tsx`), move the enablement check into the loader itself — throw redirect if disabled.

### 1.6 Backend guards
Add `await requirePluginEnabled(ctx, "...")` to the first line of every exported query/mutation/action in:
- `convex/kb/*` (pluginId `knowledge-base`)
- `convex/tickets/*` (pluginId `support-tickets`)
- `convex/customFields/*` + `convex/productAttributes/*` (pluginId `custom-fields`; productAttributes uses a shared flag with custom fields or gets its own — decide before coding)
- `convex/gallery/*`, `convex/recipes/*`, `convex/membership/*`, `convex/commerceReviews/*`, `convex/commerceWishlists/*`, `convex/commerceBundles/*`, `convex/commerceDigital/*`, `convex/commerceReturns/*`, `convex/commerceSubscriptions/*`
- Storefront-read queries: respect the flag but return `null`/empty instead of throwing so pages degrade gracefully when previewing.

### 1.7 Acceptance
- Toggling any extension off in settings:
  - Hides its nav entries (admin + storefront if applicable).
  - Blocks direct URL entry to its admin routes (guard shows disabled state).
  - Blocks direct URL entry to its public routes.
  - Backend queries return `PLUGIN_DISABLED` for mutating calls and null/empty for read calls.
- No extension has any bypass path. Verified by toggling each extension off, hitting its routes, confirming expected behavior.

--------------------------------------------------------------------------------

## PHASE 2 — TYPECHECK TO GREEN

Goal: `bun run check-types` passes in both apps. `@ts-nocheck` removed from every extension-owned file.

Order (work extension by extension; each is a branchless commit):

1. Admin app — fix non-extension errors first (nav plugin typing, router typing, shared util typing).
2. Custom Fields — SearchBoxProps, RelationshipField `_id` access, implicit anys, duplicate ARIA. Remove `@ts-nocheck` from custom-fields backend files as they come up.
3. KB — JSX dynamic heading union type, nullable article access, route search params, remove `@ts-nocheck` from `convex/kb/*`.
4. Tickets — route search params, component implicit anys, website support routes, remove `@ts-nocheck` from `convex/tickets/*`.
5. Commerce core — remove `@ts-nocheck` from `convex/commerce/paymentActions.ts`, `payments.ts`, `products.ts`, `checkout.ts`, `cart.ts`, `customers.ts`, `fulfillment.ts`, `inventory.ts`, `tax.ts`. Fix the resulting errors. If Convex codegen drift is the cause, regenerate and refactor callsites — do not re-suppress.
6. Commerce extensions — remove `@ts-nocheck` from `commerceDigital`, `commerceReviews`, `commerceWishlists`, `commerceBundles`, `commerceReturns`, `commerceSubscriptions`. Fix errors.
7. Shipping — remove `@ts-nocheck` from `shipping/actions.ts` and `shipping/queries.ts`, fix errors.
8. Membership, Recipes, Gallery, productAttributes — same pattern.

Acceptance: both apps green. Re-run devtools audit on extension routes. No new runtime errors.

--------------------------------------------------------------------------------

## PHASE 3 — EXTENSION COMPLETENESS (in priority order)

Each sub-phase gets a 4-part done-definition: (a) direct-route + backend gating, (b) typecheck clean for that extension, (c) functional tests in `packages/backend/convex/<ext>/__tests__/`, (d) devtools walk of every route for that extension.

### 3.1 Knowledge Base (high — public, SEO-visible)
- Backend: plugin gate on every query/mutation. Fix search, publishing workflow, analytics permission.
- Public `/help` route family gated. Loaders honor disabled flag.
- Admin typecheck green. Remove `@ts-nocheck`.
- Tests: disabled-plugin blocks public, publishing workflow persists, search returns expected results, comments/feedback gated by role.

### 3.2 Support Tickets
- Backend: plugin gate everywhere. Fix getQueue (already done), getStats, canned responses.
- Email piping: wire `email-notification-system` templates for ticket.created, ticket.replied, ticket.assigned, ticket.resolved. Hook into real Resend via settings-first key.
- SLA job: cron-driven, scans awaiting-response tickets, emits escalation events.
- Attachments: accept via MediaPicker, store as media IDs on ticket_messages.
- Rate-limit new-ticket endpoint (per email / per IP) to protect against spam.
- Tests: disabled-plugin, permissions, canned response substitution, SLA escalation fires, attachments attach.

### 3.3 Custom Fields
- Backend: gate custom fields + productAttributes. Decide attribute ownership (custom-fields ext vs commerce core); register and gate accordingly.
- Fix all typecheck errors in editor components and relationship field.
- Nav entry gets `pluginId`.
- Tests: field validation, relationship resolution, metabox persistence, disabled-plugin.

### 3.4 Shipping (unblock Commerce)
- Remove placeholder branches in `addressValidation/actions.ts:264` and `rates/pipeline.ts:242`. If a provider is not configured, return a structured "not configured" result, not a fabricated one.
- Confirm real USPS is wired (it is) and exercised; add integration tests against recorded fixtures.
- Provider certification harness: recorded-fixture tests for ShipStation, UPS, USPS, FedEx, DHL rate + label + tracking. Live certification checklist lives in `BLOCKED_ON_USER.md` with explicit account prerequisites.
- Webhook dedup already exists — add coverage. Add replay tooling: `shipping/webhooks:replay` internal mutation.
- Alerts: on repeated carrier failure, emit a site-notification. Stale OAuth tokens refresh on demand, surface error if refresh fails.

### 3.5 Commerce core (payments, checkout state machine, inventory)
- End-to-end sandbox runs: Stripe and PayPal. Capture, partial capture, refund, partial refund, webhook replay, idempotency keys.
- Recovery queues:
  - Stuck payment sessions (older than N minutes) — admin page + cron.
  - Stuck orders (in "processing" with no carrier label).
  - Inventory reservations without a parent order.
  - Stale carts (cron + cleanup).
  - Webhook failures (replay + alert).
- Remove `@ts-nocheck` from all `convex/commerce/*`.
- Tests covering webhook ordering, retry idempotency, tax application, shipping cost application.

### 3.6 Returns / RMA
- Provider refund reconciliation: when Stripe/PayPal refund webhook arrives, patch the return record. Alert if refund creation succeeds but webhook never confirms.
- Partial refund failure path tested.
- Integrate return labels with shipping subsystem: RMA can purchase a return label from the enabled carrier.
- Policy: configurable restocking fee, shipping-refund toggle, tax-refund toggle, discount-proration rule.
- Exchange flow (swap original line item for another — creates a new order linked to return).
- Remove `@ts-nocheck`. Add tests for provider refund, partial refund, exchange.

### 3.7 Product Reviews
- Storefront: wire `ProductReviews` into product detail route; add review submit form gated by verified-purchase (if enabled).
- Moderation UI: already exists — add notification hook for new pending reviews.
- Rate limiting: per customer / per product.
- Vote abuse: per-customer one-vote cap.
- Remove `@ts-nocheck`. Tests: submit, moderate, vote, disabled-plugin.

### 3.8 Wishlists
- Build missing `/admin/commerce/wishlists` route (list view + detail) so the registry claim matches reality. The route is not optional — the feature was registered and must ship.
- Guest-to-user merge on login (tested).
- Shared wishlist token: scoped read-only, no mutation; tests.
- Variant-aware wishlist state (distinct entry per variant).
- Remove `@ts-nocheck`. Tests.

### 3.9 Product Bundles
- Product editor: show "used in N bundles" warning before delete / stock change (finish `convex/commerceBundles/queries.ts:362`).
- Cart behavior on component price change: reprice on next cart touch + notify; tested.
- Variant deletion: remove component gracefully, mark bundle as broken, admin notification.
- Coupon interaction: decide whether discounts stack; test both paths.
- Remove `@ts-nocheck`. Tests.

### 3.10 Digital Products
- Download token: time-bound (configurable expiry), max-downloads, ownership check, revoke on refund.
- Storage authorization: signed URL only via token; no direct public fetch.
- Disabled-plugin behavior: existing licenses stop working, tested.
- Remove `@ts-nocheck`. Tests.

### 3.11 Subscriptions (large — off-session billing)
- Implement off-session charging via Stripe (primary) and PayPal (secondary):
  - Store payment method / customer at checkout.
  - Renewal cron creates off-session PaymentIntent, handles 3DS / SCA challenges via email fallback.
  - Dunning: retry schedule (e.g. 1d, 3d, 7d), cancel on final failure, notify customer.
- Webhook reconciliation: succeed, fail, require_action.
- Billing portal (customer-facing): cancel, swap plan (with proration), update payment method.
- Invoice PDF generation + email delivery.
- Plan migration / proration math.
- Remove `@ts-nocheck`. Tests across renewal, dunning, cancellation, plan swap.
- If user's Stripe/PayPal accounts lack the required features (subscription billing, webhooks), flag in `BLOCKED_ON_USER.md`.

### 3.12 Membership
- Replace placeholder website dashboard (`dashboard/membership.tsx`) with real member UI: current plan, renewal date, benefits, cancel, change plan.
- Enforce restrictions in actual content rendering (post, page, KB, gallery, recipe). Restriction resolver utility + tests.
- Plan purchase flow integrates with Subscriptions (3.11) — one buy button → subscription + membership grant.
- Grant/revoke reconciliation cron: membership lifecycle follows subscription lifecycle.
- Role/capability sync: when membership grants a role, sync; when revoked, sync back.
- Audit log for grants, upgrades, revokes.
- Remove `@ts-nocheck`. Tests.

### 3.13 Recipes
- Import robustness: schema.org/Recipe ingest + validation, fallback for missing fields.
- Nutrition schema validation.
- Media handling: featured image, step images; broken media handling.
- Category count consistency (count cron + tests).
- Public SEO: JSON-LD Recipe schema in head.
- Fix loader enablement gate.
- Remove `@ts-nocheck`. Tests.

### 3.14 Image Galleries
- Album/media ownership and permissions tests.
- Embed access (short-code / iframe) permission tests.
- Category count consistency.
- Broken media handling (missing file, failed processing).
- Public SEO correctness tests.
- Fix loader enablement gate.
- Remove `@ts-nocheck`. Tests.

--------------------------------------------------------------------------------

## PHASE 4 — PRODUCTION CERTIFICATION

Only runs after Phases 1–3 pass.

1. End-to-end Stripe sandbox: place order, capture, partial refund, full refund, failed payment, webhook replay.
2. End-to-end PayPal sandbox: same scenarios.
3. Tax: integrate a certified provider (Stripe Tax or TaxJar). Compliance-grade audit trail in Returns + Orders.
4. Carrier live certification per carrier (blocked on user-provided accounts — see `BLOCKED_ON_USER.md`).
5. Email deliverability: Resend DNS / SPF / DKIM verified for the production domain (user-provided).
6. Observability: site-notifications + email-notifications wired for every failure path (payment, refund, carrier, subscription, webhook dedup miss).
7. Final Chrome DevTools audit across every admin + public route with each extension toggled on/off.

--------------------------------------------------------------------------------

## BLOCKED_ON_USER (what I cannot fix without your input)

A running file at `docs/BLOCKED_ON_USER.md` will collect these as they surface:

- Real carrier accounts + credentials for production certification: ShipStation, UPS, USPS (OAuth apps), FedEx, DHL. (Sandbox runs work from keys you already have.)
- Production Stripe account with Subscriptions + Tax modules enabled (if Stripe Tax is chosen).
- PayPal Business account with off-session / recurring billing permission.
- Resend: production domain verification DNS records (SPF/DKIM/DMARC).
- Address validation: USPS OAuth production app approval (sandbox already works).
- Legal/compliance sign-off on tax-filing audit trail.
- Any third-party review (accessibility, security pen-test) you want before beta.

--------------------------------------------------------------------------------

## EXECUTION COMMITMENT

I work phases 1 → 4 without stopping for confirmation on individual tasks. I only stop for:
- An item that lands in `BLOCKED_ON_USER.md`.
- A dependency that cannot be completed in the session without destabilizing the tree (in which case I leave the extension in a working-but-incomplete state with a clearly-labeled follow-up, rather than a half-broken state).

Each phase closes with: typecheck green, devtools audit clean, commits pushed, phase checkbox ticked in this file.
