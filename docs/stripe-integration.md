# ConvexPress ↔ Stripe Integration

## Architecture: we own invoices, Stripe charges cards

Unlike a straight Stripe Billing integration, ConvexPress manages its own
`commerce_subscription_*` schema end-to-end. Stripe is used only as a card
vault + charge processor. This decouples subscription lifecycle (our code)
from payment execution (Stripe) and lets the same subscription engine back
bundled / custom / membership / commerce flows without being pinned to
Stripe's data model.

## What Stripe events we DO handle (`/webhooks/stripe`)

- `payment_intent.succeeded`
  - `metadata.kind === "subscription_invoice"` → mark our invoice paid via
    `handleInvoicePaymentResult`
  - `metadata.kind === "subscription_first_charge"` → activate the checkout
    intent into a real subscription via `activateCheckoutIntentFromStripe`
  - no subscription metadata → one-time cart order (commerce/payments)
- `payment_intent.payment_failed` — mirror routing, failure path
- `payment_intent.requires_action` — 3DS; logged, client-side finishes
- `payment_intent.canceled` — commerce cart only
- `setup_intent.succeeded` — `saveSetupIntentResult` persists PM on intent
- `charge.refunded` — logged; refund state tracked via our own refund flow
- `charge.dispute.created` — logged; admin-side follow-up

## What Stripe events we do NOT handle (and why)

- `invoice.paid` / `invoice.payment_failed` / `customer.subscription.*` /
  `invoice.upcoming` — these are **Stripe Billing** events tied to
  Stripe-managed subscription objects. We do not create Stripe subscription
  objects. Our `commerce_subscriptions` are internal records driven by
  crons (`subscription-renewals`, `subscription-dunning`,
  `subscription-trial-ending`) that in turn create our own invoices and
  charge via one-shot PaymentIntents with `off_session: true,
  confirm: true`. The Stripe Billing webhook surface is intentionally
  unused.

Consequences of this choice:

- We get exact control over trial windows, grace periods, dunning
  retry schedules, proration math, and coupon redemptions without
  fighting Stripe's opinionated Billing primitives.
- We never lose state to Stripe's side of the world — our schema is
  canonical. Stripe is a dumb charger.
- The tradeoff: we do more ourselves. `createDueInvoices` is our code,
  not Stripe Billing's. Worth it; the logic is small and fully tested.

## Settings-first key resolution

All keys live in `settings.commerce.payments`:

- `stripePublishableKey` — exposed to the website via
  `commerceSubscriptions.queries.getLiveChargingStatus`
- `stripeSecretKey` — server-only; read by Node actions via
  `helpers/serviceKeys.getServiceKeyFromAction`
- `stripeWebhookSecret` — verified on every `/webhooks/stripe` request
- `subscriptionChargingEnabled` — master switch; when false, the in-code
  stub processor handles every charging path (renewal, dunning,
  proration, signup)

## Off-session charging pattern

1. **Signup** — website calls
   `publicCharge.beginFirstCharge(intentId)` which creates a Stripe
   Customer (or finds by email) and a PaymentIntent with
   `setup_future_usage: "off_session"`. Client confirms via Stripe
   Elements (`@stripe/react-stripe-js`). See
   `ConvexPress-Website/apps/web/src/components/subscriptions/StripePaymentForm.tsx`.
2. **On first success** — webhook routes to
   `activateCheckoutIntentFromStripe`, which stashes `stripeCustomerId` +
   `savedPaymentMethodId` on the checkout intent. A downstream mutation
   activates the subscription contract.
3. **Renewal / proration / dunning** —
   `chargeSubscriptionInvoice` (Node action) creates a PaymentIntent with
   `off_session: true, confirm: true, customer, payment_method`,
   `idempotencyKey: invoiceId`. Success writes back to our invoice via
   `handleInvoicePaymentResult`; failure enters our dunning ladder.
4. **Invoice numbering** — every generated invoice gets a sequential
   `invoiceNumber` allocated from a dedicated settings counter
   (`commerce.subscriptions.counters.invoiceCounter`). Displayed in the
   admin invoice list and portal.

## Billing intervals

`billingInterval` supports `day | week | month | year`. `day` was added
in Wave 10.5 for Stripe-Billing-daily parity. `addBillingPeriod` handles
all four in `internals.ts`, `checkout.ts`, and `proration.ts` identically.

## Event emission for customer communication

Wave 10.2 wires six lifecycle events through the Event Dispatcher to the
Email Notification System:

- `commerce.subscription_created` → `subscription-welcome` template
- `commerce.subscription_renewed` → `subscription-renewed`
- `commerce.subscription_past_due` → `subscription-payment-failed`
- `commerce.subscription_trial_ending` → `subscription-trial-ending` (cron-emitted 3 days before trial end)
- `commerce.subscription_cancelled` → `subscription-cancelled`
- `commerce.subscription_paused` → `subscription-paused`

Handler functions live in `commerceSubscriptions/emails.ts`; listener
registrations in `bootstrap/registerListeners.ts`.

## Role elevation from grants

Wave 10.4 adds `linkedRoleId` resolution via `pickHighestRole` —
active/grace membership grants on active plans whose `linkedRoleId`
points to an active role can elevate the user's effective role (max
level wins, base vs grants). See `helpers/permissions.ts:resolveUserRole`.
