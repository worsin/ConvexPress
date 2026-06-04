# Critical Audit Backlog

Source: `audits/codex-backlog/system-audit-gaps.md`
Generated: 2026-06-04
Severity mapping: `P0 - Critical`

This file consolidates all critical audit results into two execution lanes:

- Agent-doable: work that can be designed, implemented, tested, documented, and smoke-tested without a human decision or external account action.
- Needs human: product policy, credentials, legal/compliance, production-account setup, or final operator acceptance.

## Summary

- Systems: 15
- Most urgent technical theme: commerce purchase continuity, auth/setup reliability, event visibility, and admin governance.
- Most urgent human theme: provider/payment credentials, production policy choices, and final checkout/auth acceptance.

## Systems

| System | Status | Agent-doable work | Needs human |
| --- | --- | --- | --- |
| Cart System | 55%, In Development | Add cart lifecycle events, guest-to-user merge, abandonment cron, abandoned-cart admin view, cart share tokens/routes, cart drawer/icon, optimistic updates, price/stock warnings, cart MCP tools, indexes. | Decide abandonment reminder cadence/copy and whether shared carts/collaborators are in launch scope. |
| Order System | 65%, In Development | Emit order lifecycle events, add status notification templates, customer cancel request flow, fulfillment queue queries/routes, status transition guardrails, confirmation page, invoice/packing-slip generation, guest claim flow. | Approve order status policy, cancellation/refund policy, and invoice template/legal wording. |
| Product System | 65%, In Development | Emit product events, add SEO/identity/view/analytics fields, product view tracking, public search query, dedicated capabilities, Product JSON-LD, stock badges, UCP/product feed, MCP tools, type cleanup. | Decide UCP/MCP launch priority and product metadata policy for brand/GTIN/MPN/AI fields. |
| Checkout System | 68%, In Development | Emit checkout events, add order confirmation email binding, abandon mutation, session expiry cron, address-book save path, UCP session endpoints, MCP tools. | Approve stock reservation policy, checkout timeout, express-pay scope, and final checkout acceptance with real provider settings. |
| Payment System | 72%, In Development | Wire real admin refund modal, emit payment/refund events, notification listeners, PayPal checkout UI, saved payment-method route, SetupIntent support, dispute persistence, min-amount guards, refund reconciliation, type cleanup. | Provide/confirm Stripe and PayPal test/prod credentials, wallet-domain setup, refund/dispute policy, and live payment acceptance. |
| Shipping Rate Engine | 82%, In Development | Add stale-cart fingerprint recheck, diagnostic mode, retention cron, configurable ranking weights, real manual-fallback calculation, shipping capabilities, improved Test Rates UI, type cleanup, provider multi-package audit. | Confirm shipping ranking policy, manual fallback policy, and carrier account coverage for real-world test lanes. |
| Dashboard System | 85%, In Development | Wire CMS version to settings, populate content-performance once analytics/view tracking lands, add optional stats cache/cron, add admin root redirect/index if desired. | Decide whether `/admin` must redirect to dashboard and whether static dashboard layout is acceptable for launch. |
| Registration System | 88%, In Development | Write PRD, verify Clerk webhook uses registration/invitation path, wire Electron first-admin wizard to `auth.setup.createFirstAdmin`, add captcha UI, hide OAuth when registration is closed. | Choose captcha provider, decide Clerk-only verification vs supplementary Resend verification, run first-admin install acceptance. |
| Auth System | 90%, In Development | Document Clerk/JWT schema divergence, add signed-in change-password flow, verify/emit session refresh/OAuth/email verification events, bind welcome email, complete verify-email route. | Confirm auth policy, Clerk configuration, email domain/sender, and final login/register/reset acceptance. |
| Event Dispatcher System | 92%, Production Ready | Build live event log UI, listener registry UI, dispatcher tests, lift 100-listener cap, add rate/circuit protection, optional runtime payload validation, reconcile event catalog. | Decide event retention/noise policy and which listener-management operations should be exposed to admins. |
| Page System | 92%, In Development | Backfill PRD, extract shared page templates config, verify front-page fallback, scheduled publish cron, event coverage, front-page cleanup on trash/delete. | Confirm page template taxonomy and final homepage/front-page behavior. |
| Role & Capability System | 92%, In Development | Add role/capability tests, site notification for role changes, event name alignment, document `pageAccess` vs `routePermissions`, seed missing capabilities. | Approve final role model, inheritance/non-inheritance stance, and admin notification expectations. |
| Post System | 95%, Production Ready | Backfill PRD, reconcile KB/schema drift, tighten type casts, verify trash cascade hooks, add focused tests for contributor demotion/password/scheduled publish. | Confirm governance wording and whether documented divergences stay as-is. |
| Routing System | 95%, In Development | Backfill PRD, add `routing.view_redirects`, aggregate redirect stats, central slug-collision warnings, preview URL mechanism. | Decide preview URL semantics and slug conflict policy. |
| Settings System | 97%, Production Ready | Backfill PRD, refresh KB for all settings sections, clean marker/test files, formalize settings-first/env-fallback helper. | Confirm which settings sections are launch-owned vs extension-owned. |

## Agent-First Execution Order

1. Wire event emission and notification bindings for Cart, Checkout, Order, Payment, Product, Shipping Rate Engine.
2. Fix direct user-facing blockers: cart merge, checkout expiry/abandon, PayPal/Payment UI, first-admin registration, verify-email route.
3. Add admin observability: event log, listener registry, fulfillment queue, abandoned carts, payment refunds, shipping diagnostics.
4. Backfill PRDs and reconcile KB drift for production-ready systems.

## Human Gates

1. Payment provider credentials and live payment acceptance.
2. Shipping provider credentials and production shipping policy.
3. Tax/refund/cancellation/legal copy signoff where it affects checkout/order/payment.
4. Auth provider, email sender, captcha provider, and first-admin wizard acceptance.
