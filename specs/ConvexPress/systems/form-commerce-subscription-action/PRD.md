# PRD: Form Commerce & Subscription Action

> **Origin:** Authored 2026-05-30 for the ConvexPress Forms extension (the form-builder build). The **money kernel** of the Forms tree — the single spiky, highest-risk system because it moves real money. It is not its own framework: it is a **concrete action type registered into the Form Actions & Feeds System**, wiring a form submission into the *existing* ConvexPress `commerceSubscriptions` signup flow.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce/content/forms are first-class layers, not separate apps.
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Public form surfaces serve guests + `Subscriber`.
> **Extensions — v2 (NOT the v1 commerce model):** Forms is the **first scanner-discovered v2 extension**. It lives at `apps/web/src/extensions/forms/` (manifest + nav) and `packages/backend/convex/extensions/forms/` (schema/queries/mutations), with admin routes at the canonical `apps/web/src/routes/_authenticated/_admin/forms/` path. v2 is **additive-only**: extensions never edit `schema.ts`, `lib/plugins/registry.ts`, or `lib/admin-shell/nav-config.ts` — scanners + codegen merge them in. See `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`.
> **Stack:** Bun. Base UI (not Radix). Tailwind v4. Zod for validation. Stripe for payments.

---

## Integration with ConvexPress

**Positioning:** The **form-to-commerce handoff**. This system is the concrete `subscription` (and one-time `payment`) action type the Form Actions & Feeds System (`specs/ConvexPress/systems/form-actions-feeds-system/PRD.md`) lists as *delegated* and owned here. It is **not a new framework** and declares **no new tables**: it plugs into the Actions registry via `registerActionType` and runs entirely on the Actions system's `form_actions` (config) + `form_action_runs` (idempotency/retry/audit) substrate. Its job is to translate a completed submission into a subscription contract + entitlements + (automatic) membership grant by driving the **already-shipping** `commerceSubscriptions` checkout flow — `createCheckoutIntent` → `beginFirstCharge` → (Stripe Elements client confirmation) → `activateFromIntent` — exactly as the production `ConvexPress-Website/apps/web/src/components/subscriptions/SignupForm.tsx` does today, but with the form's mapped field values as the input. Think "plug, not socket": Actions is the socket (this PRD's §3 in the Actions PRD); this is the highest-stakes plug.

**Why this is the spiky kernel:** every other Forms system can fail soft — a bad webhook retries, a CRM push that drops a lead is annoying. This one charges a customer's card. The entire design centers on one invariant: **a payment that succeeds while activation fails must be recoverable, and a card must never be double-charged.** Everything below — idempotency keyed on `submissionId`, server-authoritative pricing, the intent-status guard, the webhook-driven activation split — exists to protect that invariant.

**Code lives at:** `packages/backend/convex/extensions/forms/actions/subscription.ts` (the `ActionTypeDefinition` — `validateConfig` + `run()` — plus the field→offer mapping and the orchestration of the three `commerceSubscriptions` functions), registered into the Actions registry from the Forms extension's action-type bootstrap (`packages/backend/convex/extensions/forms/actions/index.ts`). The **in-form** Stripe Elements payment surface lives on the **Website** at `apps/web/src/extensions/forms/payment/FormStripePaymentForm.tsx` (mirrors the commerce `StripePaymentForm` + `SignupForm` client-confirmation pattern). **No admin route of its own** — it is configured inside the Actions screen at `/admin/forms/$formId/actions`.

**Consumes these ConvexPress systems:**

- **Form Actions & Feeds System** (`specs/ConvexPress/systems/form-actions-feeds-system/PRD.md`) — the host framework. Provides the `ActionTypeDefinition` interface, `registerActionType`, the `form_actions` config row (`type: "subscription"` / `"payment"`), the `form_action_runs` idempotency/retry/audit substrate, the `(submissionId, formActionId)` idempotency key, the isolated per-action dispatch envelope, and the retry-with-backoff loop this system's `run()` lives inside. This system **adds zero infrastructure**; it implements one interface.
- **Form Submission System** (`specs/ConvexPress/systems/form-submission-system/PRD.md`) — the trigger source (indirectly, via Actions). The `submissionId` is the idempotency anchor; the submission's parsed `values` (and the persisted pricing summary) are the action input. The respondent's account-creation state (Clerk on Website) is what determines whether activation can complete (see §3.4).
- **Form Calculation & Pricing System** (`specs/ConvexPress/systems/form-calculation-pricing-system/PRD.md`) — the **server-trusted price source**. This action **never trusts a client-sent amount**. It reads the offer's authoritative amounts from the `commerce_subscription_offers` row (the real `createCheckoutIntent` recomputes `initialAmount` / `recurringAmount` / `setupFeeAmount` server-side), and where a form computes its own pricing, it reads the **server-recomputed** pricing summary persisted by the Calculation system at submit — not the client figure. Pricing is recomputed server-side, always.
- **Commerce Subscriptions** (`commerceSubscriptions`, internal extension; `specs/ConvexPress/systems/subscription-system/PRD.md`) — the engine this action drives. The three verified public entry points (below) create the subscription contract + items + entitlements, and the membership grant happens *inside* `activateFromIntent` via the membership bridge. This action **orchestrates**; it does not reimplement subscription logic.
- **Payment System** (`specs/ConvexPress/systems/payment-system/PRD.md`) — Stripe primitives. `beginFirstCharge` creates the Stripe Customer + PaymentIntent (`setup_future_usage: off_session`) and returns a `client_secret`; the card is confirmed client-side via Stripe Elements. **No card data ever touches this system** (PCI: §10).
- **Membership Plan System** (`specs/ConvexPress/systems/membership-plan-system/PRD.md`) — the grant target. The grant is **automatic and delegated**: `activateFromIntent` calls `internal.membership.internals.grantFromSubscription` per entitlement code when the membership bridge is enabled (`membership` plugin on + `membership.general.acceptSubscriptionGrants !== false`) and a plan with `grantMode ∈ {"subscription","hybrid"}` is linked by entitlement code. This action does **not** grant membership itself; it triggers the flow that does.

**WooCommerce / WordPress analog:** Gravity Forms' **Stripe** + **User Registration** + **PayPal** feed add-ons working together — a form feed that registers/links a user, takes payment via Stripe Elements, and starts a recurring plan. Equivalent to WooCommerce "Subscriptions" signup via a product/checkout, but initiated from an arbitrary form and reusing ConvexPress's own subscription rails rather than a parallel checkout.

---

## 1. Overview

### 1.1 Purpose

Let a form **sell a subscription**. When a configured form is submitted, this action maps the submission's fields to a subscription **offer** (+ optional customer email + optional coupon), drives the existing `commerceSubscriptions` flow to create a subscription contract, entitlements, and an automatic membership grant, and — for paid plans — takes payment **in-form** via Stripe Elements with client-side card confirmation. It is the concrete, money-moving `subscription`/`payment` action type the Actions framework delegates to. The whole system is engineered around being **idempotent and recoverable**: payment is server-authoritative, the charge dedups on the checkout intent, activation dedups on the intent status, and the action run dedups on `(submissionId, formActionId)` — so a re-fired submission, a scheduler retry, or a manual replay can never double-charge or double-activate.

### 1.2 Scope

This is the **spiky / money kernel** of the Forms extension. Treat every rule in §9 as load-bearing.

**In scope:**
- A concrete **`ActionTypeDefinition`** for `type: "subscription"` (and the simpler `type: "payment"` one-time variant) registered into the Actions framework via `registerActionType` — `validateConfig(config)` + `run(ctx, submission, config)`.
- **Field → offer mapping**: config that resolves the submission's values to an `offerId` (fixed, or chosen by a form field), the `customerEmail` source field, and an optional `couponCode` source field.
- The **3-call orchestration** of the real `commerceSubscriptions` flow: `createCheckoutIntent({ offerId, customerEmail?, couponCode? })` → `beginFirstCharge({ checkoutIntentId })` → `activateFromIntent({ intentId, paymentResult })`.
- The **in-form Stripe Elements payment** surface on the Website, mirroring the commerce `SignupForm`/`StripePaymentForm` client-confirmation handoff (PaymentIntent/SetupIntent `client_secret` → Elements `confirmPayment`/`confirmSetup` → webhook-driven activation).
- The **membership grant + account-create branch** wiring: ensure the respondent's `users` row exists (Clerk/Convex Auth) **before** activation, and rely on the subscription system's automatic membership bridge inside `activateFromIntent`.
- The **failure / recovery + idempotency model**: payment-succeeded-but-activation-failed reconciliation, the intent-status idempotency guard, and the action-run idempotency key, so the Actions retry envelope is always safe.

**Out of scope:**
- The **Actions framework itself** — the registry, the runner, `form_actions`/`form_action_runs`, retry/backoff, ordering, conditional gating (the Form Actions & Feeds System PRD (`specs/ConvexPress/systems/form-actions-feeds-system/PRD.md`)). This system only *registers a type into it*.
- The **subscription engine internals** — contract/item/entitlement creation, billing cycles, proration, dunning, the checkout-intent schema, the Stripe webhook handler, the membership bridge logic (the Subscription System PRD (`specs/ConvexPress/systems/subscription-system/PRD.md`), the Membership Plan System PRD (`specs/ConvexPress/systems/membership-plan-system/PRD.md`)). This system **calls** the public entry points; it does not own them.
- **Stripe SDK calls / PaymentIntent creation / key resolution** — owned by the Payment System (`specs/ConvexPress/systems/payment-system/PRD.md`) and `commerceSubscriptions`' `beginSubscriptionFirstCharge`. This system never instantiates the Stripe SDK server-side.
- **Pricing computation** — owned by the Calculation & Pricing System (`specs/ConvexPress/systems/form-calculation-pricing-system/PRD.md`) + the offer row. This system consumes server-trusted amounts; it never computes or trusts a client price.
- The **submit pipeline, field validation, and `form.submitted`** (the Form Submission System PRD (`specs/ConvexPress/systems/form-submission-system/PRD.md`)).
- **Failure notifications** — emitted by the Actions framework (`form.action_failed`) and rendered by the Form Notification System; the subscription system emits its own `commerce.subscription_*` events independently (§7, §8).

---

## 2. Dependencies

### 2.1 Required before this system

| System | Why |
|---|---|
| Form Actions & Feeds System (`specs/ConvexPress/systems/form-actions-feeds-system/PRD.md`) | The host framework. Provides the `ActionTypeDefinition` interface, `registerActionType`, `form_actions`/`form_action_runs`, the `(submissionId, formActionId)` idempotency key, isolated dispatch, and the retry envelope this action's `run()` executes inside. |
| Form Submission System (`specs/ConvexPress/systems/form-submission-system/PRD.md`) | Owns `submissionId` (the idempotency anchor) and the parsed `values` / persisted pricing summary this action reads. |
| Form Calculation & Pricing System (`specs/ConvexPress/systems/form-calculation-pricing-system/PRD.md`) | Server-trusted pricing source. Where the form computes price, this action reads the server-recomputed summary, never the client value. |
| Commerce Subscriptions (`commerceSubscriptions`; `specs/ConvexPress/systems/subscription-system/PRD.md`) | The flow this action drives: `createCheckoutIntent` / `beginFirstCharge` / `activateFromIntent`. Gated by `commerce.subscriptions.commerceSubscriptionsEnabled` (+ `commerce.payments.subscriptionChargingEnabled` for live paid charging). |
| Payment System (`specs/ConvexPress/systems/payment-system/PRD.md`) | Stripe Customer/PaymentIntent creation + `client_secret` for in-form Elements confirmation; Stripe secret keys in ENV/Settings. |
| Membership Plan System (`specs/ConvexPress/systems/membership-plan-system/PRD.md`) | The automatic grant target (membership bridge inside `activateFromIntent`). |

### 2.2 Systems that depend on this

| System | Integration point |
|---|---|
| Form Actions & Feeds System | Registers + invokes this action type's `run()`; relies on its idempotency so the retry envelope never double-charges. |
| Form Entry Management System | Surfaces the `form_action_runs` row for the subscription action (status, resulting `contractId`) inside an entry's detail view. |
| Form Confirmation System | Shows the post-payment success/receipt to the respondent (the trusted total + contract reference). |

### 2.3 Verified `commerceSubscriptions` entry points (the real flow this action drives)

These are the production functions (see `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/checkout.ts` + `publicCharge.ts`, and the Website's `SignupForm.tsx`). Signatures are reproduced as-built so the action wires to reality, not a sketch.

```typescript
// 1) PUBLIC mutation — no auth required (logged-in OR anonymous).
//    Anonymous callers MUST pass customerEmail. Validates offer (rejects
//    archived) + optional coupon, persists a commerce_subscription_checkout_intents
//    row (status "payment_pending", sourceChannel "direct_form"), returns:
api.commerceSubscriptions.checkout.createCheckoutIntent({
  offerId: Id<"commerce_subscription_offers">,
  customerEmail?: string,      // required if anonymous
  couponCode?: string,
  returnUrl?: string,
}): Promise<{
  intentId: Id<"commerce_subscription_checkout_intents">,
  amount: number,              // initialAmount in minor units (setup fee + (recurring if no trial))
  recurringAmount: number,
  currency: string,
  trialDays: number,
  paymentProcessorData: { provider: "free" | "stripe", ready: boolean, message: string },
}>;

// 2) PUBLIC action ("use node") — anonymous-callable. Creates the Stripe
//    Customer + PaymentIntent (setup_future_usage: off_session) for the intent
//    and returns the client_secret for Stripe Elements. Delegates to the
//    internal beginSubscriptionFirstCharge. Throws
//    "no_charge_needed_free_initial_amount" for zero-amount intents.
api.commerceSubscriptions.publicCharge.beginFirstCharge({
  checkoutIntentId: Id<"commerce_subscription_checkout_intents">,
}): Promise<{ clientSecret: string | null, mode: "payment" | "setup" }>;

// 3) PUBLIC mutation — the ONE trusted activation path. Idempotent via the
//    intent status guard (re-call after "activated" returns the existing
//    contract; non-pending/draft throws INTENT_ALREADY_PROCESSED). Creates the
//    subscription contract + subscription_item + entitlements, seeds coupon
//    redemption, and (when the bridge is enabled) grants membership per
//    entitlement code via internal.membership.internals.grantFromSubscription.
//    Resolves the user from intent.userId or by email; throws USER_NOT_FOUND if
//    no users row exists for an anonymous intent's email (signup must complete
//    first). For LIVE paid intents, activation is driven by the Stripe webhook;
//    provider "free" is accepted only for zero-amount intents; provider "stub"
//    only for zero-amount intents.
api.commerceSubscriptions.checkout.activateFromIntent({
  intentId: Id<"commerce_subscription_checkout_intents">,
  paymentResult: {
    provider: string,                  // "stripe" (webhook) | "free" | "stub"
    providerTransactionId: string,
    status: "succeeded" | "pending_settlement" | "failed",
    paymentMethodId?: string,
    stripeCustomerId?: string,
  },
}): Promise<
  | { ok: true,  contractId: Id<"commerce_subscriptions">, status: string, trialDays: number, currentPeriodEndAt?: number }
  | { ok: false, reason: "payment_failed" }
>;

// Helper the in-form payment surface reads to decide live vs free path:
api.commerceSubscriptions.queries.getLiveChargingStatus(): Promise<{ live: boolean, publishableKey: string | null }>;
```

---

## 3. Architecture

### 3.1 An action type registered into the Actions framework (not a new framework)

This system is one `ActionTypeDefinition` (two, counting the simpler `payment`) handed to the Actions registry. It owns **no runner, no schema, no event loop**. The framework loads it, stores its config in `form_actions`, and — after `form.submitted` — invokes its `run()` inside an isolated, retryable, idempotency-guarded dispatch (Actions PRD §3).

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Form Actions & Feeds framework  (owns runner + tables + retry)            │
│    form.submitted → runActions → (per action, ordered, conditional) →      │
│    dispatchAction(runId) → registry["subscription"].run(ctx, submission,   │
│                                                          config)           │
│                                       │                                    │
│                                       ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ THIS SYSTEM: subscription action run()  (the plug)                 │    │
│  │  1. resolve offerId / customerEmail / couponCode from config+values│    │
│  │  2. server-trusted pricing (offer row + Calc summary; never client)│    │
│  │  3. createCheckoutIntent({ offerId, customerEmail?, couponCode? })  │    │
│  │  4. branch on paymentProcessorData / live charging:                 │    │
│  │       • zero-amount  → activateFromIntent(provider:"free")          │    │
│  │       • paid + live  → return { needsPayment, intentId, ... } so the│    │
│  │                        Website renders Stripe Elements; webhook     │    │
│  │                        activates (NOT the action)                   │    │
│  │  5. (account-create branch) ensure users row exists pre-activation  │    │
│  │  6. membership grant happens INSIDE activateFromIntent (delegated)  │    │
│  │  7. return ActionResult { ok, data:{ intentId, contractId? }, retry}│    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                       │                                    │
│   framework records form_action_runs row, emits form.action_completed /   │
│   form.action_failed; idempotency on (submissionId, formActionId)         │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 The 3-call subscription orchestration

The action drives the *exact* production flow (verified against `checkout.ts` / `publicCharge.ts` / `SignupForm.tsx`):

1. **`createCheckoutIntent`** — resolve the offer + email + coupon from the submission, call the public mutation. It validates the offer (throws `OFFER_ARCHIVED` for archived), validates the coupon (throws `COUPON_INVALID` with a `reason`), recomputes `initialAmount`/`recurringAmount`/`setupFeeAmount` **server-side**, and persists a `payment_pending` intent (`sourceChannel: "direct_form"`). Returns `{ intentId, amount, recurringAmount, currency, trialDays, paymentProcessorData }`. **The intentId is the second idempotency anchor** (after `submissionId`).

2. **`beginFirstCharge`** — for a paid intent on a live-charging site, create the Stripe Customer + PaymentIntent (`setup_future_usage: off_session`) and return `{ clientSecret, mode }`. Throws `no_charge_needed_free_initial_amount` for zero-amount intents — the signal to take the free path instead.

3. **`activateFromIntent`** — create the contract + item + entitlements + membership grant. **This is the only trusted activation path and is itself idempotent** (intent status guard: a second call after `"activated"` returns the existing `contractId`; a non-`payment_pending`/`draft` status throws `INTENT_ALREADY_PROCESSED`).

### 3.3 In-form payment flow (Stripe Elements + client confirmation) — the hard part

Money cannot be confirmed server-side from a Convex action: card confirmation is a **client** operation (PCI; §10). So the in-form paid path is intrinsically two-phase and mirrors the production `SignupForm` exactly:

**Phase A (server, inside `run()`):** the action calls `createCheckoutIntent`, then `beginFirstCharge`, obtaining `{ clientSecret, mode }`. It **cannot** confirm the card. So for a **paid + live** plan it returns an `ActionResult` whose `data` carries `{ needsPayment: true, intentId, clientSecret, publishableKey, mode }`, records the run as `pending` (a payment-awaiting state, not `failed`), and **does not** attempt activation. The framework treats this as a non-terminal outcome (no `action_failed`).

**Phase B (client, Website):** the Form Renderer, on submit, receives the `needsPayment` descriptor and mounts `FormStripePaymentForm` (Stripe Elements) with the `clientSecret` + `publishableKey`. The respondent confirms the card (`stripe.confirmPayment` / `confirmSetup` with a `return_url`). On success, **the Stripe webhook activates the intent** (`activateFromIntent` with `provider: "stripe"`), exactly as the commerce `SignupForm` relies on the webhook — the client does **not** call `activateFromIntent` for the paid path. The respondent lands on the confirmation route once the webhook has run.

> **Critical correctness note (verified):** for **live paid** subscriptions the *webhook* owns activation, not this action and not the browser. `activateFromIntent` explicitly rejects `provider: "stub"`/`"free"` for non-zero amounts. The action's only paid-path job is to *start* the charge and hand the client a `clientSecret`; activation is the subscription system's webhook responsibility. This split is the single most important thing to get right and is the source of the idempotency guarantee (the intent can be activated exactly once).

**Zero-amount path (free / trial-with-no-initial-charge):** no Elements. The action (or the client, matching `SignupForm`) calls `activateFromIntent` with `{ provider: "free", providerTransactionId: "free_<ts>", status: "succeeded" }`. `activateFromIntent` accepts `"free"` only when both `initialAmount` and `recurringAmount` are zero.

### 3.4 Membership grant + account-create branch

**Membership grant is delegated and automatic.** It is **not** done by this action. Inside `activateFromIntent`, after the contract + entitlements are written, the subscription system iterates the offer's `entitlementCodes` and, when the **membership bridge** is enabled, calls `internal.membership.internals.grantFromSubscription({ userId, entitlementCode, subscriptionId, endsAt })` per code. The bridge is enabled when: the `membership` plugin is on, `membership.general.acceptSubscriptionGrants !== false`, and a membership plan exists with `grantMode ∈ {"subscription","hybrid"}` linked by that entitlement code. This action's only obligation is to pass an offer whose `entitlementCodes` map to the intended plan(s); the grant then happens for free.

**Account creation is the genuinely awkward branch — surfaced honestly.** `activateFromIntent` resolves the user from `intent.userId` (set if the caller was logged in) or by `intent.email`, and **throws `USER_NOT_FOUND` if no `users` row exists** for an anonymous intent's email. A `users` row is created by the **Website's Clerk signup** (synced to `users` via the Clerk webhook) — there is **no server-side, anonymous Clerk signup** a Convex action can perform. Therefore:

- **Signed-in respondent:** `createCheckoutIntent` captures `userId`; activation resolves it directly. Trivial.
- **Anonymous respondent (the form is the signup):** account creation must happen **client-side on the Website before activation**, mirroring `SignupForm` (`signUp.create(...)` → `setActive(...)` → then checkout). The action-type `run()` (server, post-submit) **cannot** create the Clerk account. So when the configured offer's flow requires a *new* account, this system's design is: the **in-form payment surface** (Phase B) is also where account creation lands — the Website collects email/password, runs Clerk signup, and only then is the intent activated (webhook for paid, explicit `free` for zero-amount). If the respondent is anonymous, the offer is non-zero, and no account is created, `activateFromIntent` will throw `USER_NOT_FOUND`; the action records this as a **recoverable** failure (the charge may have already succeeded — see §3.5 / §9), and the framework surfaces it for replay once the account exists.

> **Account-registration ordering.** The Actions framework runs actions in explicit `order`; the `account_registration` action type (owned by the Actions system, P2) is intended to run **before** this one so the `users` row exists. But because Clerk signup for an anonymous respondent is a client operation, the robust path for "form-as-signup with payment" is the client-side signup-then-pay flow above; the server-side `account_registration` action is for the *signed-in or admin-provisioned* cases. This PRD documents both and treats `USER_NOT_FOUND` as a first-class recoverable state rather than a hard failure.

### 3.5 Failure / recovery + idempotency model (the reason this system exists)

Three independent idempotency layers stack so that **no path double-charges and no path double-activates**:

1. **Action run** — keyed `(submissionId, formActionId)` by the Actions framework. A `completed` run is never re-run; a re-fired `form.submitted`, a scheduler retry, or a manual replay all converge here first.
2. **Checkout intent** — `createCheckoutIntent` is the second anchor. To make the action idempotent *across retries before the run is marked completed*, the action **derives a deterministic lookup** for an existing `payment_pending`/`activated` intent for this `submissionId` (the intent records `sourceChannel: "direct_form"` and can carry the `formSubmissionId`; see §4) so a retry reuses the same intent rather than minting a new one (and thus a new charge).
3. **Activation** — `activateFromIntent` is itself idempotent: once the intent is `"activated"` it returns the existing `contractId`; a `"failed"`/other status throws `INTENT_ALREADY_PROCESSED`. So even if two paths race (webhook + a stray retry), the contract is created **once**.

**The cardinal failure case — payment succeeded, activation failed — is recoverable by construction:**

- The **charge** is tied to the **intent** (one PaymentIntent per intent). A retry reuses the same intent (layer 2), so it never creates a *second* PaymentIntent → **never double-charges.**
- If the Stripe payment succeeds but activation hasn't completed (webhook delayed, transient DB error, or `USER_NOT_FOUND` because the account wasn't created yet), the intent remains `payment_pending` with a real `paymentTransactionId`. Re-running `activateFromIntent` (via webhook redelivery, framework retry, or admin replay) **completes activation against the already-paid intent** — no new charge. The `run()` is required to be safe to re-enter for exactly this reason.
- If activation **permanently** can't complete (e.g. offer deleted between charge and activate), the run goes terminal `failed`; the Notification System alerts the admin (highest-signal: money was taken), and the recovery is a **refund + manual reconciliation**, never a silent re-charge.

This is why the action's `run()` is structured as: *find-or-create intent → ensure charge started/settled → attempt activate → classify the outcome as completed / awaiting-payment / retryable / terminal*, with the charge always anchored to the reused intent.

---

## 4. Action Config (the `form_actions` config shape)

No new table — this is the `config: v.any()` blob on the Actions framework's `form_actions` row when `type: "subscription"` (or `"payment"`). It is validated by this type's `validateConfig` (Zod at the boundary) at save time (Actions PRD §10.1). The config maps form fields → the three `createCheckoutIntent` inputs.

```typescript
// Stored in form_actions.config for a row with type: "subscription".
// Validated by registry["subscription"].validateConfig(config).
interface SubscriptionActionConfig {
  // ── Offer resolution (one of the two modes) ──────────────────────────────
  offerMode: "fixed" | "fromField";
  // fixed: every submission buys this offer.
  offerId?: Id<"commerce_subscription_offers">;     // required when offerMode = "fixed"
  // fromField: the offer is chosen by a form field whose value is an offerId
  // (or maps to one via offerFieldMap). The field is a select/radio of offers.
  offerFieldName?: string;                           // required when offerMode = "fromField"
  offerFieldMap?: Record<string, Id<"commerce_subscription_offers">>; // optionValue -> offerId

  // ── Customer email source ────────────────────────────────────────────────
  // The submission field holding the respondent's email. Falls back to the
  // signed-in user's email server-side (createCheckoutIntent prefers it).
  emailFieldName: string;

  // ── Coupon (optional) ────────────────────────────────────────────────────
  couponMode?: "none" | "fromField" | "fixed";
  couponFieldName?: string;                          // when couponMode = "fromField"
  couponCode?: string;                               // when couponMode = "fixed"

  // ── Account-create policy (drives the §3.4 branch) ───────────────────────
  // "require_existing": respondent must already have an account (signed-in);
  //   USER_NOT_FOUND is a hard config error surfaced at submit.
  // "create_on_website": form-as-signup; the Website collects credentials and
  //   runs Clerk signup before activation (paid → webhook; free → explicit).
  accountPolicy: "require_existing" | "create_on_website";

  // ── Return URL after in-form payment (Stripe return_url) ─────────────────
  returnUrl?: string;                                // default: the form's confirmation route

  // ── Safety rails (server-enforced; never trust client price) ─────────────
  // Optional max charge guard: reject if the offer's server-computed initial
  // amount exceeds this (defense against a misconfigured/swapped offer).
  maxInitialAmount?: number;                         // minor units
}

// type: "payment" (one-time) reuses the same offer/email/coupon mapping but
// targets a one-time PaymentIntent rather than a recurring offer. v1 ships the
// subscription type; payment is the same orchestration minus the recurring
// schedule (see §11 phasing).
```

> **`form_action_runs.result` (this action's success summary):** `{ intentId, contractId?, status, amount, recurringAmount, currency, paid: boolean }`. Stored by the framework on the run row; surfaced in Entry Management. The `intentId` is the audit/reconciliation key linking the run to the subscription + Stripe charge.

---

## 5. Data Model

**No new tables.** This system is pure behavior over two existing substrates:

- **Config** rides the Actions framework's `form_actions` row (`type: "subscription"` | `"payment"`, `config` = §4 shape). Owned by the Actions system; this system only defines the `config` schema + `validateConfig`.
- **Runs / idempotency / audit** ride the Actions framework's `form_action_runs` (`status`, `attempts`, `error`, `result`, keyed `(submissionId, formActionId)`). Owned by the Actions system; this system only writes its `ActionResult` into it via the framework.
- **Subscription state** (intent, contract, items, entitlements, coupon redemption, membership grant) lives entirely in the `commerceSubscriptions` + `membership` tables — `commerce_subscription_checkout_intents`, `commerce_subscriptions`, `commerce_subscription_items`, `commerce_subscription_entitlements`, etc. This system **reads/writes none of them directly**; it calls the public functions that do.

**One additive linkage (optional, for idempotency robustness):** the `commerce_subscription_checkout_intents` row already has nullable `formId` / `formSubmissionId` fields (see `checkout.ts` — they default `undefined` for direct-form signups). This action **populates `formId` + `formSubmissionId`** on the intent (via a thin internal helper or by passing them through, coordinated with the subscription system) so a retry can look up "is there already an intent for this submission?" (§3.5 layer 2) without inventing a Forms-side table. This is a *use* of an existing field, not a schema change owned here; if the subscription system needs to expose a `getIntentBySubmission` internal query, that is a small cross-system addition tracked in Open Questions (§12).

---

## 6. Routes / Actions

**No new routes.** This action is configured inside the Actions screen the Actions framework owns:

| Surface | Path | App | Notes |
|---|---|---|---|
| Subscription action config | `/admin/forms/$formId/actions` | Admin | Configured **as an action** in the Actions list (Actions PRD §6). This system contributes only the per-type config editor for `type: "subscription"`/`"payment"`, driven by `validateConfig` + the §4 shape. No standalone route. |
| In-form payment surface | (rendered inside the public form) `/forms/$slug` | Website | Stripe Elements mount (`FormStripePaymentForm`) appears within the Form Renderer's route when `run()` returns `needsPayment`. Not a new route — part of the Renderer's existing public form route. |

**No new capabilities.** Authoring this action uses the Actions framework's existing **`form.manage_actions`** (Administrator, Editor). This system registers **no** new capability into the Role & Capability registry. The public submit + in-form payment path is unauthenticated (it is a public form; abuse control is the Spam system's job, money safety is the idempotency model's job) — exactly as the public `commerceSubscriptions` checkout is anonymous-callable.

---

## 7. Events

**This system emits one Forms-tree event; everything else is delegated.**

| Event | Code | Trigger | Payload |
|---|---|---|---|
| Form Subscription Started | `form.subscription_started` | The action successfully creates a checkout intent for a submission (the subscription flow has begun) | `{ formId, submissionId, checkoutIntentId, offerId, customerEmail }` |

`form.subscription_started` is scheduled via the dispatcher **after** the intent is created (mirrors the Forms-tree convention: event after the durable write). It marks "this submission entered the subscription funnel," distinct from "the subscription was activated."

**Delegated / cross-referenced events (NOT emitted here):**

- The **Actions framework** emits `form.action_completed` (on `run()` returning `ok:true`) and `form.action_failed` (terminal failure) for this action like any other (Actions PRD §8). This system does not emit those.
- The **subscription system** emits `commerce.subscription_created` (and the rest of `commerce.subscription_*`) from inside `activateFromIntent` — independently, best-effort. This system relies on those for downstream subscription notifications; it does not re-emit them.

---

## 8. Notifications

**None owned.** This system sends nothing. Two delegated channels cover it:

- **Action failure** → the **Form Notification System** renders the "Form Action Failed" admin email + site notification off the framework's `form.action_failed` (Actions PRD §9). A failed **money** action is the highest-signal case (a charge may have succeeded); the Notification System specializes copy by `actionType`.
- **Subscription lifecycle** (welcome / payment succeeded / payment failed / trial ending / etc.) → the **subscription system's** own notifications, keyed off its `commerce.subscription_*` events (Subscription System PRD §16). The respondent's "you're subscribed" email comes from there, not here.

The respondent's immediate post-payment confirmation UX is the **Form Confirmation System**'s concern (it shows the trusted total + success state once the webhook activates).

---

## 9. API Design

### 9.1 The action type — `registerActionType` + `run()` — `actions/subscription.ts`

```typescript
// packages/backend/convex/extensions/forms/actions/subscription.ts
import { z } from "zod";
import { ConvexError } from "convex/values";
import { internal, api } from "../../../_generated/api";
import { registerActionType, type ActionResult, type ActionRunContext }
  from "../actionRegistry";

// Zod boundary for the §4 config shape (validateConfig wraps this).
const subscriptionConfigSchema = z.object({
  offerMode: z.enum(["fixed", "fromField"]),
  offerId: z.string().optional(),
  offerFieldName: z.string().optional(),
  offerFieldMap: z.record(z.string(), z.string()).optional(),
  emailFieldName: z.string().min(1),
  couponMode: z.enum(["none", "fromField", "fixed"]).default("none"),
  couponFieldName: z.string().optional(),
  couponCode: z.string().optional(),
  accountPolicy: z.enum(["require_existing", "create_on_website"]),
  returnUrl: z.string().optional(),
  maxInitialAmount: z.number().int().nonnegative().optional(),
}).refine(
  (c) => c.offerMode !== "fixed" || !!c.offerId,
  { message: "offerId is required when offerMode is 'fixed'." },
).refine(
  (c) => c.offerMode !== "fromField" || !!c.offerFieldName,
  { message: "offerFieldName is required when offerMode is 'fromField'." },
);

// Resolve the offer/email/coupon from config + the submission's parsed values.
// SERVER-TRUSTED inputs only — values come from the committed submission, never
// a fresh client payload; pricing is recomputed by createCheckoutIntent.
function resolveInputs(config: z.infer<typeof subscriptionConfigSchema>,
                       values: Record<string, unknown>) {
  const offerId =
    config.offerMode === "fixed"
      ? config.offerId!
      : (config.offerFieldMap?.[String(values[config.offerFieldName!])] ??
         String(values[config.offerFieldName!]));        // field value IS an offerId
  const customerEmail = String(values[config.emailFieldName] ?? "").trim() || undefined;
  const couponCode =
    config.couponMode === "fixed" ? config.couponCode
    : config.couponMode === "fromField"
      ? (String(values[config.couponFieldName ?? ""] ?? "").trim() || undefined)
      : undefined;
  return { offerId, customerEmail, couponCode };
}

registerActionType({
  type: "subscription",
  label: "Start Subscription",

  // Pure config validation at save time (Zod at the boundary).
  validateConfig: (config) => {
    const parsed = subscriptionConfigSchema.safeParse(config);
    return parsed.success
      ? { valid: true }
      : { valid: false, error: parsed.error.issues[0]?.message ?? "Invalid config" };
  },

  // The side effect. MUST be idempotent w.r.t. (submissionId, formActionId).
  // Runs inside an internalAction ctx (can runQuery/runMutation/runAction/fetch).
  run: async (ctx: ActionRunContext, rawConfig): Promise<ActionResult> => {
    const config = subscriptionConfigSchema.parse(rawConfig); // re-validate defensively
    const { offerId, customerEmail, couponCode } = resolveInputs(config, ctx.values);

    if (!offerId) {
      return { ok: false, error: "Could not resolve an offer for this submission.",
               retryable: false }; // config/data problem — permanent
    }

    // ── Idempotency layer 2: reuse an existing intent for this submission ──
    // (avoids a second PaymentIntent on retry → never double-charges). Reads an
    // internal subscription query keyed on formSubmissionId; falls through to
    // create if none. See §5 / §12.
    let intent = await ctx.runQuery(
      internal.commerceSubscriptions.checkout.getIntentBySubmission,
      { formSubmissionId: ctx.submissionId },
    ).catch(() => null);

    // ── Call 1: createCheckoutIntent (server recomputes the price) ─────────
    if (!intent) {
      try {
        intent = await ctx.runMutation(
          api.commerceSubscriptions.checkout.createCheckoutIntent,
          { offerId: offerId as any, customerEmail, couponCode,
            returnUrl: config.returnUrl,
            // formId/formSubmissionId stamped onto the intent for idempotency:
            // passed through a thin internal variant if the public mutation
            // doesn't accept them (coordination point, §12).
          },
        );
      } catch (err: any) {
        // Map known ConvexError codes to retry semantics.
        const code = err?.data?.code ?? err?.code;
        if (code === "OFFER_ARCHIVED" || code === "COUPON_INVALID" ||
            code === "VALIDATION_ERROR") {
          return { ok: false, error: err?.data?.message ?? code, retryable: false };
        }
        throw err; // unknown → transient by framework default
      }

      // Safety rail: never charge more than the configured cap (defense vs a
      // swapped/misconfigured offer). Server amount only — client never trusted.
      if (config.maxInitialAmount != null && intent.amount > config.maxInitialAmount) {
        return { ok: false,
          error: `Initial amount ${intent.amount} exceeds cap ${config.maxInitialAmount}.`,
          retryable: false };
      }

      // Mark "subscription funnel started".
      await ctx.runMutation(internal.events.dispatch, {
        eventCode: "form.subscription_started",
        payload: { formId: ctx.formId, submissionId: ctx.submissionId,
                   checkoutIntentId: intent.intentId, offerId, customerEmail },
      });
    }

    const isZeroAmount = (intent.amount ?? 0) <= 0 && (intent.recurringAmount ?? 0) <= 0;

    // ── Zero-amount path: activate now with the explicit "free" provider ───
    if (isZeroAmount) {
      const activation = await ctx.runMutation(
        api.commerceSubscriptions.checkout.activateFromIntent,
        { intentId: intent.intentId as any,
          paymentResult: { provider: "free",
                           providerTransactionId: `free_${Date.now()}`,
                           status: "succeeded" } },
      );
      if (activation.ok) {
        return { ok: true, data: { intentId: intent.intentId,
          contractId: activation.contractId, status: activation.status,
          amount: 0, recurringAmount: intent.recurringAmount, currency: intent.currency,
          paid: false } };
      }
      // ok:false here is payment_failed semantics — for free this is unexpected.
      return { ok: false, error: "Free activation failed.", retryable: true };
    }

    // ── Paid path: start the charge, hand the client a client_secret. ──────
    // Activation for live paid intents is the Stripe WEBHOOK's job, NOT this
    // action and NOT the browser. We return a non-terminal "needs payment"
    // result so the framework records the run as awaiting payment (no
    // action_failed) and the Website mounts Stripe Elements.
    const charge = await ctx.runAction(
      api.commerceSubscriptions.publicCharge.beginFirstCharge,
      { checkoutIntentId: intent.intentId as any },
    ).catch((err: any) => {
      // Zero-amount races to here only if pricing changed; tolerate the signal.
      const msg = String(err?.data?.message ?? err?.message ?? "");
      if (msg.includes("no_charge_needed_free_initial_amount")) return null;
      throw err;
    });

    if (!charge?.clientSecret) {
      // Either it became free (handled above) or charging is misconfigured.
      return { ok: false, error: "Could not start payment.", retryable: true };
    }

    const liveStatus = await ctx.runQuery(
      api.commerceSubscriptions.queries.getLiveChargingStatus, {},
    );

    // Non-terminal: the run is "awaiting payment". The framework should NOT
    // mark this failed and should NOT retry-charge; the webhook will activate.
    return {
      ok: false,                 // not completed yet …
      retryable: false,          // … but DO NOT retry (would not re-charge, but
                                 //     is pointless; webhook owns completion)
      error: "AWAITING_PAYMENT", // sentinel the framework maps to a pending run
      data: {
        needsPayment: true,
        intentId: intent.intentId,
        clientSecret: charge.clientSecret,
        publishableKey: liveStatus.publishableKey,
        mode: charge.mode,
        amount: intent.amount,
        recurringAmount: intent.recurringAmount,
        currency: intent.currency,
      },
    };
  },
});
```

> **The `AWAITING_PAYMENT` outcome is the one place this action bends the `ActionResult` contract:** a paid in-form subscription cannot *complete* inside `run()` — it must hand off to the client + webhook. The Actions framework treats this sentinel as a terminal-but-not-failed "pending payment" run (no retry, no `action_failed`); the run is later finalized to `completed` by the **same `activateFromIntent` path the webhook drives** (which can patch the matching `form_action_runs` row via an internal hook, or Entry Management reconciles it from the intent's `activated` status). Settling this contract detail with the Actions system is the top Open Question (§12).

### 9.2 The client confirmation handoff — `FormStripePaymentForm` (Website)

```tsx
// apps/web/src/extensions/forms/payment/FormStripePaymentForm.tsx (Website)
// Mirrors ConvexPress-Website .../subscriptions/StripePaymentForm + SignupForm.
// Mounted by the Form Renderer when submit() returns { needsPayment, ... }.
//
//  1. loadStripe(publishableKey)  →  <Elements options={{ clientSecret }}>
//  2. respondent enters card in <PaymentElement/> (card data → Stripe only)
//  3. on confirm:
//       mode === "payment"  → stripe.confirmPayment({ elements, confirmParams:{ return_url }})
//       mode === "setup"    → stripe.confirmSetup({   elements, confirmParams:{ return_url }})
//  4. SUCCESS → Stripe redirects to return_url; the WEBHOOK calls
//     activateFromIntent(provider:"stripe"). The client does NOT activate.
//  5. (anonymous + accountPolicy "create_on_website") Clerk signup runs BEFORE
//     this step (SignupForm pattern) so activation can resolve the user.
//
// No secret key, no PaymentIntent creation, no activation here — PCI boundary.
```

### 9.3 Account-create (anonymous, form-as-signup) — client sequence

For `accountPolicy: "create_on_website"` with an anonymous respondent, the Website sequence is the `SignupForm` flow, adapted to the form: collect email/password in the payment step → `signUp.create(...)` → `setActive(...)` (or email-verification redirect, persisting the intent id) → then the Phase-B card confirmation → webhook activation. This guarantees the `users` row exists before `activateFromIntent`, avoiding `USER_NOT_FOUND`.

---

## 10. Business Rules & Constraints

- **Idempotency keyed on `submissionId`.** The action is at-most-once-to-completion per submission. Three stacked layers (run `(submissionId, formActionId)` → checkout **intent** reused per submission → `activateFromIntent` intent-status guard) guarantee a re-fired submission / retry / replay converges on a single intent, a single charge, and a single contract.
- **Never double-charge.** A retry **reuses the existing intent** (and thus its single PaymentIntent); it never mints a second intent or a second charge. The charge is anchored to the intent, not to the run attempt.
- **Money operations are server-authoritative.** The amount is whatever `createCheckoutIntent` recomputes server-side from the offer row (and, for form-computed pricing, the Calculation system's server-recomputed summary). The client never supplies, and is never trusted for, a price. An optional `maxInitialAmount` cap is a server-side defense against a swapped/misconfigured offer.
- **Pricing is trusted from the Calculation system's server recompute, not the client.** Per the Calculation & Pricing PRD §8, the submit mutation overwrites computed values server-side; this action reads those, never the client figure. Money math is in integer minor units (cents) end-to-end.
- **Activation is single-pathed and webhook-owned for paid plans.** `activateFromIntent` is the only trusted activation path and is idempotent. For **live paid** intents, activation is driven by the **Stripe webhook** (`provider: "stripe"`), not by this action or the browser; `activateFromIntent` rejects `"free"`/`"stub"` for non-zero amounts. Zero-amount intents activate via explicit `provider: "free"`.
- **No card data server-side.** Card confirmation is a client Stripe Elements operation against a `client_secret`. This system never sees a PAN, never instantiates the Stripe SDK server-side, and never stores card details. (§11 Security.)
- **Membership grant is delegated and automatic.** This action does not grant membership; `activateFromIntent` does, via the membership bridge (`grantFromSubscription`), gated by the bridge settings + plan `grantMode ∈ {"subscription","hybrid"}` linked by entitlement code. The action's responsibility is to choose an offer whose `entitlementCodes` map to the intended plan.
- **Account must exist before activation.** `activateFromIntent` throws `USER_NOT_FOUND` for an anonymous intent with no `users` row. The signed-in path resolves trivially; the form-as-signup path runs Clerk signup client-side first. `USER_NOT_FOUND` is treated as a **recoverable** state (the charge may have succeeded — replay activation once the account exists), never a silent re-charge.
- **Failure isolation (inherited).** This action runs in its own isolated dispatch (Actions PRD §3.3); a failure here never aborts sibling actions, and a sibling never rolls back a successful charge. There is no cross-action transaction — by design.
- **Config validated through the type.** `validateConfig` (Zod) rejects an invalid mapping at save time (`requireCan("form.manage_actions")`), never at charge time.
- **Gated by the commerce flags.** The flow no-ops/blocks unless `commerce.subscriptions.commerceSubscriptionsEnabled` (and `commerce.payments.subscriptionChargingEnabled` for live paid charging) are on — the same gates the production `createCheckoutIntent`/`activateFromIntent` enforce. Paid checkout on a site without live charging is refused with a clear message (never a silent fake success).
- **Additive-only (v2).** This system declares **no tables** and edits no hub files. It registers an action type into the Actions framework and (optionally) populates the subscription system's existing `formId`/`formSubmissionId` intent fields. It never edits root `schema.ts`, `registry.ts`, or `nav-config.ts`.

---

## 11. Edge Cases

| Scenario | Handling |
|---|---|
| **Payment fails (card declined)** | Live paid path: the webhook calls `activateFromIntent(status:"failed")` → intent marked `failed`, `{ ok:false, reason:"payment_failed" }`, **no contract created**. The respondent retries the card client-side; the same intent is reused. The action run reflects awaiting/failed payment; no double-charge. |
| **Activation fails AFTER a successful charge** (webhook delayed, transient DB error, `USER_NOT_FOUND`) | Intent stays `payment_pending` with a real `paymentTransactionId`. Re-running `activateFromIntent` (webhook redelivery / framework replay / admin replay) completes activation against the already-paid intent — **no new charge** (idempotency layer 2+3). This is the cardinal recoverable case the system is built for. If permanently unactivatable (e.g. offer deleted), terminal `failed` → admin alert → **refund + manual reconciliation**, never silent re-charge. |
| **Duplicate / double submit** (redelivered `form.submitted`, double-click) | Layer 1: a `completed` run for `(submissionId, formActionId)` is skipped. Layer 2: a pending/activated intent already exists for this `submissionId` → reused, not re-created. Net: one charge, one contract. |
| **Coupon invalid / expired** | `createCheckoutIntent` throws `COUPON_INVALID` with a `reason`; the action classifies it **permanent** (`retryable:false`) → terminal `failed` with the reason; admin sees it; respondent can resubmit with a valid/no coupon. (If the coupon becomes invalid *between* intent creation and activation, the subscription system silently drops it and still activates — the customer keeps the subscription, coupon just not applied; a history row records it.) |
| **Offer archived** | `createCheckoutIntent` throws `OFFER_ARCHIVED` → permanent failure; nothing charged. For `offerMode:"fromField"`, a field value resolving to an archived/unknown offer is the same path. |
| **Offer archived/deleted between charge and activation** | Charge tied to the intent already succeeded; `activateFromIntent` may throw `NOT_FOUND` for the offer → terminal `failed` → refund + reconcile. Rare; surfaced loudly (money taken). |
| **Anonymous respondent, paid offer, no account created** | `activateFromIntent` throws `USER_NOT_FOUND`. With `accountPolicy:"create_on_website"`, the Website runs Clerk signup before activation so this doesn't occur. If it still occurs, recoverable: replay activation once the `users` row exists; charge not duplicated. |
| **Site has subscriptions enabled but live charging disabled** | Paid path is refused with the production message ("Live subscription charging is disabled…"); only zero-amount/free offers activate. No fake success. |
| **Two paths race to activate one intent** (webhook + stray retry) | `activateFromIntent` intent-status guard makes the second a no-op returning the existing `contractId`. Contract created exactly once. |
| **Zero-amount but `beginFirstCharge` called** | Throws `no_charge_needed_free_initial_amount`; the action catches the sentinel and takes the free `activateFromIntent` path. |
| **`maxInitialAmount` exceeded** (offer swapped to a pricier one) | Server amount exceeds the cap → permanent failure before any charge; protects against misconfiguration moving real money. |
| **Submission trashed/deleted before the paid handoff completes** | The intent + charge are independent of the submission row; activation still resolves via the intent. Entry-side display degrades gracefully; reconciliation uses the intent. |
| **`form.subscription_started` dispatch fails after intent creation** | Intent is the source of truth; the event is rescheduled by the dispatcher. Funnel analytics may lag; the subscription flow is unaffected. |

---

## 12. Security Considerations

- **PCI via Stripe Elements.** Card entry + confirmation happen exclusively in Stripe-hosted Elements on the client against a `client_secret`. The PAN never reaches ConvexPress servers, logs, or the form submission. This keeps the integration in Stripe's SAQ-A scope (the same posture as the Checkout System §13.2 and the commerce `SignupForm`).
- **No card data server-side.** The action never instantiates the Stripe SDK, never creates a PaymentIntent itself (it calls `beginFirstCharge`, which does), and never persists card details. `paymentMethodId`/`stripeCustomerId` (opaque references, not card data) flow only through `activateFromIntent` from the webhook.
- **Secret keys in ENV/Settings.** Stripe secret keys are resolved by the Payment System via `helpers/serviceKeys.ts` from the `commerce.payments` Settings section / environment — never embedded in form config, never shipped to the client. Only the **publishable** key reaches the browser (via `getLiveChargingStatus`).
- **Server-authoritative money.** All amounts originate server-side (`createCheckoutIntent` recompute + offer row + Calc summary). A tampered client payload cannot change what is charged; the `maxInitialAmount` cap is a second server-side guard.
- **Public endpoints, abuse-controlled elsewhere.** The submit + checkout-intent + charge path is anonymous-callable by design (public forms; anonymous commerce checkout). Authorization is the wrong tool; rate-limit/honeypot/CAPTCHA is the Spam & Security system's job, and money-safety is the idempotency model's job. Authoring the action is gated by `form.manage_actions` (Admin/Editor).
- **Idempotency as a security control.** The stacked idempotency (run key → intent reuse → activation guard) is not just correctness — it is the defense against replay-driven double-charging. Treat any change that could mint a second intent per submission as a security regression.

---

## 13. Implementation Checklist

**Phase 1 — action type + config (no money yet, signed-in/zero-amount first)**
- [ ] Implement `actions/subscription.ts`: the `ActionTypeDefinition` (`validateConfig` via the §4 Zod schema + `run()`), registered via `registerActionType` from the Forms extension's action bootstrap.
- [ ] Implement `resolveInputs` (offer fixed/fromField, email field, coupon mode) against the committed submission `values`.
- [ ] Wire `createCheckoutIntent` (Call 1); map `OFFER_ARCHIVED`/`COUPON_INVALID`/`VALIDATION_ERROR` ConvexError codes to permanent failures; emit `form.subscription_started`.
- [ ] Zero-amount path: `activateFromIntent(provider:"free")`; return a `completed` `ActionResult` with `{ intentId, contractId, ... }`.
- [ ] `maxInitialAmount` server-side cap.

**Phase 2 — idempotency + recovery (the spiky core)**
- [ ] Coordinate the per-submission **intent reuse** lookup with the subscription system (populate `formId`/`formSubmissionId` on the intent; add `getIntentBySubmission` internal query) — §5/§12.
- [ ] Define + agree the `AWAITING_PAYMENT` non-terminal `ActionResult` contract with the Actions framework (no retry, no `action_failed`, run marked pending-payment) — §9.1 note.
- [ ] Reconciliation: ensure the `form_action_runs` row is finalized to `completed` when the webhook's `activateFromIntent` settles the matching intent (internal hook or Entry-Management reconcile from intent status).
- [ ] Tests: re-fired submission / scheduler retry / manual replay all → one intent, one charge, one contract (assert no second PaymentIntent).
- [ ] Test: payment-succeeded-activation-failed → replay completes activation, **no re-charge**.

**Phase 3 — in-form Stripe Elements payment (Website)**
- [ ] Build `FormStripePaymentForm` mirroring `StripePaymentForm`/`SignupForm`: `loadStripe(publishableKey)` → `<Elements clientSecret>` → `confirmPayment`/`confirmSetup` with `return_url`.
- [ ] Form Renderer: on submit, detect `run()`'s `{ needsPayment }` descriptor and mount the Elements step; route to the Confirmation system on return.
- [ ] Live-vs-free branch via `getLiveChargingStatus`; refuse paid checkout (clear message) when live charging is off.

**Phase 4 — account-create branch**
- [ ] Signed-in path: confirm `createCheckoutIntent` captures `userId`; activation resolves it.
- [ ] `accountPolicy:"create_on_website"`: client-side Clerk signup before the Phase-B confirmation (SignupForm sequence, incl. the email-verification redirect persisting the intent id); ensure activation never hits `USER_NOT_FOUND`.
- [ ] `accountPolicy:"require_existing"`: surface a clear "must be signed in" error at submit.

**Phase 5 — membership grant verification + `payment` (one-time) type**
- [ ] Verify the automatic membership grant fires (offer `entitlementCodes` → plan `grantMode ∈ {subscription,hybrid}` linked by code; bridge settings on) with **no** grant code in this action.
- [ ] Implement the simpler `type: "payment"` (one-time) variant reusing the offer/email/coupon mapping + Elements handoff, minus the recurring schedule.
- [ ] Confirm the Actions retry envelope never double-charges the `payment` type either (its `run()` is idempotent on `(submissionId, formActionId)`).

---

## 14. Open Questions

- **`AWAITING_PAYMENT` contract with the Actions framework.** A paid in-form subscription can't *complete* inside `run()` (client + webhook own confirmation). How exactly does the framework model "started a charge, awaiting client + webhook" — a new non-terminal run status, or this sentinel mapped to `pending` with no retry? And who patches `form_action_runs` to `completed` on webhook activation: an internal hook the subscription system calls, or Entry-Management reconciliation from the intent's `activated` status? **Top priority** — it is the seam between the money flow and the run log. Default sketch: sentinel → pending-payment run; webhook's `activateFromIntent` calls an internal `finalizeSubscriptionRun(submissionId)` hook.
- **Per-submission intent reuse.** Reusing one checkout intent per `submissionId` is the anti-double-charge guard (§3.5 layer 2). It needs the subscription system to (a) accept `formId`/`formSubmissionId` on `createCheckoutIntent` (the fields already exist on the row) and (b) expose `getIntentBySubmission`. Confirm the subscription team owns those two small additions. Fallback if not: a deterministic idempotency key on the intent.
- **Server-side account creation for anonymous respondents.** There is no Convex-side anonymous Clerk signup, so form-as-signup-with-payment *must* create the account client-side (SignupForm flow). Is that acceptable as the only anonymous path, or do we want an admin-side invite/magic-link variant for back-office-driven subscription forms? Default: client-side signup only for anonymous; `require_existing` otherwise.
- **One-time `payment` vs subscription offer reuse.** Does the one-time `payment` type ride a zero-recurring subscription offer (reusing this whole flow) or a separate one-time PaymentIntent + order path? Default: model one-time as an offer with `recurringAmount: 0` to maximize reuse; revisit if a true one-time order (no contract) is needed.
- **Form-computed pricing → offer amounts.** When a form's Calculation system computes a bespoke price (not a fixed offer amount), how is that reconciled with the offer row's server-recomputed amount? Options: dynamic/parameterized offers, or a server-side check that the form total matches the offer. Default v1: fixed offers only (price comes from the offer row); dynamic form-priced subscriptions are a later phase. (Cross-ref Calculation & Pricing §3.5 two-channel total.)
- **Refund automation on terminal activation failure.** When a charge succeeds but activation is permanently impossible, v1 alerts the admin for a manual Stripe refund. Should we auto-refund after N failed activation attempts? Parked pending real failure data; manual + alert is the safe v1.

---

## 15. Cross-References

- Host framework (registers into; idempotency/retry/run-log substrate): Form Actions & Feeds System (`specs/ConvexPress/systems/form-actions-feeds-system/PRD.md`)
- Trigger source + idempotency anchor (`submissionId`, `values`): Form Submission System (`specs/ConvexPress/systems/form-submission-system/PRD.md`)
- Server-trusted pricing source (recompute, never client): Form Calculation & Pricing System (`specs/ConvexPress/systems/form-calculation-pricing-system/PRD.md`)
- Subscription flow this action drives (`createCheckoutIntent`/`beginFirstCharge`/`activateFromIntent`): Subscription System (`specs/ConvexPress/systems/subscription-system/PRD.md`)
- Stripe primitives + key resolution (no card data here): Payment System (`specs/ConvexPress/systems/payment-system/PRD.md`)
- Automatic grant target (membership bridge inside `activateFromIntent`): Membership Plan System (`specs/ConvexPress/systems/membership-plan-system/PRD.md`)
- Failure notification rendered by: Form Notification System (`specs/ConvexPress/systems/form-notification-system/PRD.md`)
- Reference implementation (the production pattern this mirrors): `ConvexPress-Website/apps/web/src/components/subscriptions/SignupForm.tsx` + `.../StripePaymentForm.tsx`; backend `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/checkout.ts` + `publicCharge.ts`
- Kit: `ConvexPress-Admin/extension-kit/ARCHITECTURE.md`

---

**PRD Version:** 1.0 · **Created:** 2026-05-30 · **System:** Form Commerce & Subscription Action · **Plugin:** ConvexPress Forms (v2) · **Airtable:** Billing & Payments / Full Stack / Complex / P1 - High
