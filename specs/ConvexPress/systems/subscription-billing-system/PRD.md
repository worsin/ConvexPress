# PRD: Subscription Billing System

> **Project:** ConvexPress — unified CMS + commerce. Commerce is a first-class layer inside ConvexPress alongside posts/pages/media/users/taxonomies.
> **Two-app architecture:** `ConvexPress-Admin/` (Convex Auth) + `ConvexPress-Website/` (Clerk).
> **Roles:** WordPress-standard (Administrator / Editor / Author / Contributor / Subscriber).
> **Stack:** Bun, Base UI, Tailwind v4, Stripe — off-session charging architecture in `docs/stripe-integration.md`.
> **Canonical path:** `specs/ConvexPress/systems/subscription-billing-system/PRD.md`
> **Airtable Record:** `rec7Eayn6V8Vft1Vl`
> **Expert:** `/experts:commerce-subscriptions-system` (existing — this system is the billing *view* of the combined Commerce Subscriptions System).
> **Status:** Wave 9 shipped real Stripe off-session charging. This PRD is the billing-layer contract for the Commerce Subscriptions System; the lifecycle + admin surface live in `subscription-system/PRD.md`.

---

## Relationship to Commerce Subscriptions

**Clarification:** The Airtable Systems table has three closely-related records:

1. **Commerce Subscriptions System** (`recMrbOOqnZjqs5zk`, slug `subscription-system`) — the full feature: templates, offers, contracts, items, order-form acquisition, customer portal, admin dashboard.
2. **Subscription Billing System** (THIS record, `rec7Eayn6V8Vft1Vl`) — the charging / invoicing / dunning subset.
3. **Subscription Entitlement System** (`recgbNuzg3lSyN3Br`) — the entitlement-code layer that bridges subscriptions → membership grants.

In code these three live in **one module**: `convex/commerceSubscriptions/`. They share schema, events, and Stripe integration. This PRD narrows in on the **billing loop**: invoice generation, charging, dunning, proration, renewal cadence — the parts that move money.

**Consolidation path:** after Wave 11 ships, consider retiring this Airtable row in favor of "Commerce Subscriptions" + cross-referencing the billing-specific sections of `subscription-system/PRD.md`. For now, this PRD exists as a focused billing contract.

---

## Integration with ConvexPress

**Positioning:** billing subset of the `commerceSubscriptions` extension (same gate, same codebase).
**Extension gate:** `commerce.subscriptions.commerceSubscriptionsEnabled` (lifecycle) + `commerce.payments.subscriptionChargingEnabled` (live-money gate — when off, stub processor runs).
**Code lives at:** `convex/commerceSubscriptions/` — specifically `internals.ts` (invoice generation, payment-result handling), `renewal.ts` (hourly renewal cron action), `dunning.ts` (retry cron), `proration.ts` (upgrade/downgrade), `stripeCharge.ts` (Wave 9 — real off-session charging), `actions.ts` (Node-action wrappers).

**Consumes these ConvexPress systems:**

- **Payment System** — Stripe SDK wrappers + webhook dispatch at `/webhooks/stripe`.
- **Commerce Subscriptions System** — contracts + items + templates (shared schema).
- **Membership Plan System** — bridge propagates renewal/failure status into grants.
- **Email Notification System** — renewed / trial-ending / payment-failed / cancelled templates.
- **Order System** — signup initial-charge creates a matching `commerce_orders` row.
- **Event Dispatcher** — emits `commerce.subscription_renewed / past_due / cancelled / paused / trial_ending`.
- **Settings System** — `stripeSecretKey`, `stripeWebhookSecret`, `subscriptionChargingEnabled`, `commerceSubscriptionsInvoiceCounter`.
- **Audit Log** — every status transition + refund + proration logged.

**WooCommerce / Stripe analog:** WooCommerce Subscriptions (Automattic) + Stripe Billing — we own the subscription record and use Stripe purely as a card vault + charger (off-session PaymentIntents, not `stripe.subscriptions.*`).

---

## 1. Overview

### 1.1 Purpose

The Subscription Billing layer turns an activated subscription contract
into recurring money movement. It runs the renewal cadence, generates
invoices, charges cards off-session, retries failed payments per a
dunning schedule, and handles proration on upgrade/downgrade.

### 1.2 Scope

**In Scope:**
- Renewal cron (hourly) — sweeps contracts where `currentPeriodEndAt <= now` and generates invoices.
- Invoice generation — `createDueInvoices` mutation writes `commerce_subscription_invoices` rows with sequential `invoiceNumber`.
- Payment charging — `chargeSubscriptionInvoice` Node action creates off-session PaymentIntent with `confirm: true, off_session: true, customer, payment_method, idempotencyKey: invoiceId`.
- Dunning cron (hourly, +15min offset) — retries failed invoices per retry schedule (default [1d, 3d, 7d, 14d]).
- Proration — immediate upgrade charge via `applyUpgradeProration` + async downgrade via `applyDowngradeProration` at period end.
- SetupIntent at signup — card vaulting via `beginSubscriptionFirstCharge` with `setup_future_usage: "off_session"`.
- Webhook routing — `payment_intent.succeeded|payment_failed` routed by `metadata.kind` to `handleInvoicePaymentResult` or `activateCheckoutIntentFromStripe`.
- **Wave 11:** Invoice PDF rendering + download.
- **Wave 11:** Trial-ending warning (cron emits `commerce.subscription_trial_ending` 3d before `trialEndsAt`).
- **Wave 11:** `day` billing interval parity.
- **Wave 11:** Dunning queue admin UI with manual retry.

**Out of Scope:**
- Subscription lifecycle semantics (activate/pause/cancel/scheduled-offer-change) — owned by `subscription-system/PRD.md`.
- Entitlement propagation to membership grants — owned by `subscription-entitlement-system/PRD.md`.
- Customer portal UI — owned by `subscription-system/PRD.md`.
- Tax calculation — delegates to Tax System.

---

## 2. Data Model (shared with Commerce Subscriptions)

### 2.1 Exists

```ts
commerce_subscriptions       // contracts
commerce_subscription_items  // child items on a contract
commerce_subscription_invoices {
  invoiceNumber: v.optional(v.string()),  // Wave 10.3 added sequential numbering
  status: "draft" | "open" | "paid" | "failed" | "void",
  subtotalAmount, taxAmount, totalAmount,
  prorationEventId: v.optional(v.id("commerce_subscription_proration_events")),
  ...
}
commerce_subscription_dunning_attempts
commerce_subscription_proration_events
commerce_subscription_checkout_intents { stripeCustomerId, savedPaymentMethodId, ... }
```

### 2.2 Wave 11 additions

```ts
// Settings: commerce.payments
subscriptionChargingEnabled: boolean  // exists, Wave 9

// Settings: commerce.subscriptions.counters (exists, Wave 10.3)
invoiceCounter: number
invoicePrefix: string

// NEW: invoice-PDF metadata
commerce_subscription_invoices {
  pdfStorageId: v.optional(v.id("_storage")),  // Convex file-storage ID
  pdfGeneratedAt: v.optional(v.number()),
}
```

---

## 3. Functions

### 3.1 Exists (Wave 9 + Wave 10 baseline)

- `internals.createDueInvoices` — renewal sweep writes invoices with sequential numbers
- `internals.handleInvoicePaymentResult` — branches on `prorationEventId` vs normal renewal; applies period advance or proration item swap
- `internals.applyDueScheduledOfferChanges` — downgrade scheduler
- `renewal.runRenewalSweep` — hourly cron, branches on `subscriptionChargingEnabled`
- `dunning.runDunningSweep` — hourly cron, same branch
- `stripeCharge.chargeSubscriptionInvoice` — Node action, off-session
- `stripeCharge.beginSubscriptionFirstCharge` — signup SetupIntent + first charge
- `stripeCharge.saveSetupIntentResult` — webhook PM persistence
- `proration.applyUpgradeProration` + `.applyDowngradeProration` + scheduler-aware live-charging
- `internals.emitTrialEndingEvents` — daily cron (Wave 10.2)
- `internals.getInvoiceForRenewal` — joins subscription.stripeCustomerId + email
- `internals.recordSavedPaymentMethod` — webhook → intent persistence
- `internals.activateCheckoutIntentFromStripe` — webhook → subscription activation

### 3.2 Wave 11 new

- `internals.renderInvoicePdf` (Node action) — generates a PDF from an invoice + uploads to `_storage`; stores `pdfStorageId`.
- `queries.getInvoicePdfUrl(invoiceId)` — signed URL for customer + admin download.
- `queries.listDunningQueue` — admin view of failed + retrying invoices.
- `mutations.retryDunningManual(attemptId)` — admin one-click retry that schedules `chargeSubscriptionInvoice`.
- `internals.detectStuckInvoices` — hourly cron flags invoices stuck in `processing` > 24h.
- Add `"day"` to `billingInterval` union (Wave 10.5 plan; may already be in progress).

---

## 4. Admin UI

### 4.1 Exists
- Invoices list at `/commerce/subscriptions/invoices` (shows `invoiceNumber` as of Wave 10.3)
- Invoice detail at `/commerce/subscriptions/invoices/$id`
- Dunning page `dunning.tsx` — lists failed invoices

### 4.2 Wave 11 new
- Dunning queue with manual-retry button on each row
- Invoice-PDF download button (wired to `getInvoicePdfUrl`)
- Per-invoice stripe-event history panel (shows every PaymentIntent attempt + webhook)

---

## 5. Events

Existing (Wave 10.2):
- `commerce.subscription_renewed / past_due / cancelled / paused / trial_ending`

Wave 11:
- `commerce.subscription_invoice_pdf_ready`
- `commerce.subscription_dunning_retry_manual`
- `commerce.subscription_invoice_stuck`

---

## 6. Acceptance criteria

### 6.1 Existing (must not regress)
- [x] Renewal cron runs hourly
- [x] Dunning cron runs at +15min offset
- [x] Sequential invoice numbering (Wave 10.3)
- [x] Off-session Stripe charging gated by `subscriptionChargingEnabled`
- [x] Signup SetupIntent flow (Wave 9.1)
- [x] Webhook metadata.kind routing
- [x] Proration upgrade/downgrade (Wave 10.1)
- [x] Trial-ending daily cron (Wave 10.2)

### 6.2 Wave 11 new
- [ ] Invoice PDF rendering + storage
- [ ] `getInvoicePdfUrl` + customer + admin download
- [ ] Dunning queue admin UI with manual-retry mutation
- [ ] Stuck-invoice detector cron
- [ ] `day` billing interval wired in schema + `addBillingPeriod`
- [ ] Per-invoice Stripe-event history panel

---

## 7. Definition of Done

1. All §6.2 boxes ticked.
2. Customer downloads a valid PDF invoice from the portal.
3. Admin manually retries a stuck invoice from the dunning queue and the retry succeeds on the next poll.
4. `day` interval produces the correct next-billing timestamp in unit tests.
5. Stuck-invoice alert fires within 25h on a test invoice intentionally stalled.

---

## 8. References

- Code: `convex/commerceSubscriptions/internals.ts`, `renewal.ts`, `dunning.ts`, `proration.ts`, `stripeCharge.ts`, `actions.ts`
- Knowledge doc: `.claude/docs/COMMERCE-SUBSCRIPTIONS-SYSTEM.md` (1050 lines)
- PRD: `.codex/docs/COMMERCE-SUBSCRIPTIONS-PLUGIN-PRD.md`
- Acceptance: `docs/superpowers/reports/2026-04-21-membership-subscriptions-acceptance.md` (Wave 7/9/10 addenda)
- Stripe architecture: `docs/stripe-integration.md`
- Sibling PRDs: `subscription-system`, `subscription-entitlement-system`, `payment-system`, `order-system`, `membership-plan-system`
- Airtable: `appqpJ8QQkoKsH02O` / Systems / `rec7Eayn6V8Vft1Vl`
