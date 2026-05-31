# PLAN: Form Commerce & Subscription Action

> Lean build plan for the PRD in this folder. **This is the money kernel — sandbox-only.**
> A concrete `subscription`/`payment` action type registered into the (host) Form Actions & Feeds framework.
> It drives the EXISTING `commerceSubscriptions` flow: `createCheckoutIntent → beginFirstCharge → activateFromIntent`.
> Paid activation is **WEBHOOK-owned, not synchronous**. The action's paid-path job is to START the charge and return a non-terminal `awaiting_payment` outcome.

---

## Ground truth (verified against real code — read before building)

| Fact | Source | Plan impact |
|---|---|---|
| `form_actions` + `form_action_runs` tables exist; `form_action_runs.status` union **already includes `"awaiting_payment"`** | `convex/extensions/forms/schema.ts:135-162` | No schema change. Use the existing `awaiting_payment` status as the non-terminal paid outcome. |
| **The Actions host framework is NOT built yet** — no `registerActionType`, `actionRegistry`, runner, or `dispatchAction` anywhere in the repo | grep: zero hits for `registerActionType`/`actionRegistry`/`dispatchAction` | **Hard dependency.** See Step 0 — define a thin local contract shim so this type compiles + unit-tests standalone, and registers cleanly once the framework lands. |
| `createCheckoutIntent(offerId, customerEmail?, couponCode?, returnUrl?)` recomputes `initialAmount = setupFee + (trial>0 ? 0 : recurring)` **server-side**, persists intent `status:"payment_pending"`, `sourceChannel:"direct_form"`, returns `{intentId, amount, recurringAmount, currency, trialDays, paymentProcessorData}` | `commerceSubscriptions/checkout.ts:133-326` | Trust the server amount. `paymentProcessorData.provider` is `"free"` when `initialAmount<=0`, else `"stripe"`. |
| `createCheckoutIntent` **hardcodes `formId: undefined` and `formSubmissionId: undefined`** (checkout.ts:275-276) and does **not** accept them as args | checkout.ts:265-307 | **Real gap.** Per-submission intent reuse (idempotency layer 2) requires a coordinated subscription-system addition. See Step 6 + Cross-system asks. |
| `activateFromIntent` is idempotent via intent-status guard: returns existing `contractId` once `"activated"`; throws `INTENT_ALREADY_PROCESSED` for any other non-`payment_pending`/`draft` status | checkout.ts:389-410 | Safe to re-enter. Never create a contract twice. |
| `activateFromIntent` **rejects `provider:"free"` AND `provider:"stub"` when `initialAmount>0 || recurringAmount>0`** | checkout.ts:429-448 | Paid path must NOT call activate from the action/browser. Webhook (`provider:"stripe"`) owns it. |
| `activateFromIntent` throws `USER_NOT_FOUND` for an anonymous intent whose email has no `users` row | checkout.ts:483-498 | Account-create is client-side Clerk on Website (no server-side anon signup). Treat `USER_NOT_FOUND` as recoverable. |
| Membership grant is auto-delegated INSIDE `activateFromIntent` via `internal.membership.internals.grantFromSubscription` per `offer.entitlementCodes`, gated by bridge | checkout.ts:642-671 | Action grants NOTHING. Just pass an offer whose `entitlementCodes` map to the plan. |
| `beginFirstCharge({checkoutIntentId})` is a public `"use node"` action → delegates to internal `stripeCharge.beginSubscriptionFirstCharge`; returns `{clientSecret, mode}`; throws `no_charge_needed_free_initial_amount` for zero-amount | `commerceSubscriptions/publicCharge.ts` | Action calls this for paid+live; catches the free sentinel. |
| `getLiveChargingStatus(): {live, publishableKey}` exists | `commerceSubscriptions/queries.ts:897-911` | Read to get the publishable key + gate the paid path. |
| Event API is **`emitEvent(ctx, code, system, payload)`** (mutation ctx, `system="forms"`) — **NOT** `internal.events.dispatch` as the PRD §9.1 sketch shows | `helpers/events.ts:84` | Correct the PRD sketch. Emit from a small internal **mutation** wrapper (Node action ctx can't call `emitEvent` directly). |
| Form event codes live in `FORM_EVENTS` (`events/constants.ts:336`); `form.subscription_started` is **not** in the catalog | constants.ts:336-344, aggregated into `ALL_EVENT_CODES`/`EVENT_CODE_SET` | Add `SUBSCRIPTION_STARTED: "form.subscription_started"` (additive, 1 line). Without it `emitEvent` only warns, but add it for correctness. |
| Client reference pattern is real and exact: `SignupForm.tsx` (signUp.create → setActive → createCheckoutIntent → beginFirstCharge → confirm) + `StripePaymentForm.tsx` props `{publishableKey, clientSecret, mode, returnUrl, onError}` | `ConvexPress-Website/.../components/subscriptions/{SignupForm,StripePaymentForm}.tsx` | Mirror these. No Website `apps/web/src/extensions/forms/` dir exists yet — create it. |

**Non-negotiable invariants (every step serves these):** never double-charge · never double-activate · server-authoritative price only · no card data server-side · paid activation is webhook-owned.

---

## File map (exact paths)

**Admin backend** (`ConvexPress-Admin/packages/backend/convex/`)
- `extensions/forms/actions/subscription.ts` — **NEW.** The `ActionTypeDefinition` (`validateConfig` + `run`) for `type:"subscription"`; field→offer mapping; 3-call orchestration; `awaiting_payment` outcome.
- `extensions/forms/actions/payment.ts` — **NEW (Phase 5).** One-time `type:"payment"` variant (offer with `recurringAmount:0`, reuses orchestration).
- `extensions/forms/actions/config.ts` — **NEW.** `SubscriptionActionConfig` type + the shared Zod `subscriptionConfigSchema` + `resolveInputs(config, values)`.
- `extensions/forms/actions/index.ts` — **NEW.** Action-type bootstrap: imports `./subscription` (+ `./payment`) so registration side-effects run; re-exports for the framework's loader.
- `extensions/forms/actions/events.ts` — **NEW.** Internal `mutation` `emitSubscriptionStarted({formId, submissionId, checkoutIntentId, offerId, customerEmail})` wrapping `emitEvent(ctx,"form.subscription_started","forms",…)` (Node action ctx cannot call `emitEvent`).
- `extensions/forms/actions/contract.ts` — **NEW (Step 0 shim).** Local `ActionTypeDefinition` / `ActionResult` / `ActionRunContext` types + a no-op `registerActionType` fallback, used ONLY until the host framework exports the real ones; swap the import in one place when it lands.
- `events/constants.ts` — **EDIT (additive).** Add `SUBSCRIPTION_STARTED: "form.subscription_started"` to `FORM_EVENTS`.

**Admin frontend** (`ConvexPress-Admin/apps/web/src/`)
- `extensions/forms/actions/SubscriptionActionConfigEditor.tsx` — **NEW.** Per-type config editor (offer fixed/fromField, email field, coupon mode, accountPolicy, returnUrl, maxInitialAmount) surfaced inside the Actions screen at `/admin/forms/$formId/actions`. **No standalone route.**

**Website** (`ConvexPress-Website/apps/web/src/`)
- `extensions/forms/payment/FormStripePaymentForm.tsx` — **NEW.** Mirror of `components/subscriptions/StripePaymentForm.tsx`. Mounted by the Form Renderer when `run()` returns `{needsPayment}`.
- `extensions/forms/payment/useFormSubscriptionPayment.ts` — **NEW.** Client orchestration hook: optional Clerk signup (anon + `create_on_website`) → consume `needsPayment` descriptor → confirm card → redirect to `returnUrl`. Mirrors `SignupForm.tsx`.

> **Forbidden (v2 additive-only):** never edit root `schema.ts`, `lib/plugins/registry.ts`, `lib/admin-shell/nav-config.ts`. Never edit `commerceSubscriptions/*` except the two tiny coordinated additions in Step 6 (which are the subscription system's to own; this plan only depends on them).

---

## Build steps (ordered)

### Step 0 — Dependency gate + contract shim (do FIRST)
- Verify whether the Actions framework exports `registerActionType` / `ActionTypeDefinition` / `ActionResult` / `ActionRunContext` (search `extensions/forms/` for an `actionRegistry`/`actions` runner). **It does not today.**
- If absent: create `actions/contract.ts` with the minimal interface this type needs (below) + a `registerActionType` that pushes into a local module-level array. This lets the type compile + unit-test in isolation and drop into the real registry by changing one import.
- Contract this action relies on (keep tiny, match PRD §9.1):
  - `ActionRunContext`: `{ runQuery, runMutation, runAction }` (internalAction ctx) + `{ formId, submissionId, values: Record<string,unknown> }` (the committed submission — server-trusted, NOT a fresh client payload).
  - `ActionResult`: `{ ok: boolean; data?: Record<string,unknown>; error?: string; retryable?: boolean }`.
  - `ActionTypeDefinition`: `{ type; label; validateConfig(config): {valid:true}|{valid:false,error}; run(ctx, rawConfig): Promise<ActionResult> }`.
- **Output of this step:** a one-line note in the file header stating "swap `./contract` → framework registry import when Form Actions & Feeds lands."

### Step 1 — Config + Zod boundary (`actions/config.ts`)
- Define `SubscriptionActionConfig` (PRD §4): `offerMode`, `offerId?`, `offerFieldName?`, `offerFieldMap?`, `emailFieldName`, `couponMode?`, `couponFieldName?`, `couponCode?`, `accountPolicy`, `returnUrl?`, `maxInitialAmount?`.
- `subscriptionConfigSchema` = the PRD §9.1 Zod object with both `.refine()`s (offerId required when fixed; offerFieldName required when fromField).
- `resolveInputs(config, values)` → `{offerId, customerEmail, couponCode}` exactly as PRD §9.1 (offerFieldMap lookup, else field value IS an offerId; email trimmed; coupon by mode).

### Step 2 — `validateConfig` + registration skeleton (`actions/subscription.ts`)
- `registerActionType({ type:"subscription", label:"Start Subscription", validateConfig, run })`.
- `validateConfig` = `subscriptionConfigSchema.safeParse` → `{valid}` / `{valid:false,error: issues[0].message}`.
- `run` stub returns `{ok:false, error:"not implemented", retryable:false}` (filled in next steps).

### Step 3 — `run()` Call 1: createCheckoutIntent + funnel event + cap (zero-money slice)
- `const config = subscriptionConfigSchema.parse(rawConfig)` (defensive re-validate).
- `resolveInputs`; if no `offerId` → `{ok:false, error:"Could not resolve an offer…", retryable:false}`.
- Call `api.commerceSubscriptions.checkout.createCheckoutIntent({offerId, customerEmail, couponCode, returnUrl})`.
- **Map ConvexError codes** (`err.data.code`): `OFFER_ARCHIVED` / `COUPON_INVALID` / `NOT_FOUND` / `VALIDATION_ERROR` → `{ok:false, retryable:false}` (permanent). Unknown → rethrow (framework default = transient retry).
- **`maxInitialAmount` cap:** if set and `intent.amount > maxInitialAmount` → `{ok:false, retryable:false}` (server amount only).
- After intent created: call internal `actions/events.ts → emitSubscriptionStarted` (NOT `emitEvent` directly — wrong ctx).

### Step 4 — Zero-amount path (free / no-initial-charge)
- `isZeroAmount = (intent.amount ?? 0) <= 0 && (intent.recurringAmount ?? 0) <= 0`.
- If zero: call `activateFromIntent({intentId, paymentResult:{provider:"free", providerTransactionId:`free_${Date.now()}`, status:"succeeded"}})`.
- On `ok:true` → return `{ok:true, data:{intentId, contractId, status, amount:0, recurringAmount, currency, paid:false}}` → framework marks run `completed`.
- On `ok:false` → `{ok:false, error:"Free activation failed.", retryable:true}`.

### Step 5 — Paid path → non-terminal `awaiting_payment` (the spiky core)
- Call `api.commerceSubscriptions.publicCharge.beginFirstCharge({checkoutIntentId})`; **catch** `no_charge_needed_free_initial_amount` → fall back to the Step 4 free path (pricing changed under us).
- If no `clientSecret` returned → `{ok:false, error:"Could not start payment.", retryable:true}`.
- Read `getLiveChargingStatus()` for `publishableKey`.
- **Return the non-terminal outcome** so the framework records the run as `awaiting_payment` (status already in the schema union) and does **NOT** mark failed and does **NOT** retry:
  - Shape per PRD §9.1: `{ ok:false, retryable:false, error:"AWAITING_PAYMENT", data:{ needsPayment:true, intentId, clientSecret, publishableKey, mode, amount, recurringAmount, currency } }`.
- **Do NOT call `activateFromIntent` here.** For live paid intents the **Stripe webhook** activates (`provider:"stripe"`). This is the single most important correctness rule.
- **Framework coordination (blocking, Open Question #1):** confirm the runner maps the `"AWAITING_PAYMENT"` sentinel → `form_action_runs.status="awaiting_payment"` (no retry, no `form.action_failed`). If the runner keys off status rather than a sentinel string, adapt the return shape to whatever the framework's `ActionResult` exposes for "pending payment." Land this contract with the Actions system before shipping paid.

### Step 6 — Idempotency layer 2: per-submission intent reuse (anti-double-charge)
- **Cross-system dependency (subscription system owns these — coordinate, do not silently fork checkout.ts):**
  1. `createCheckoutIntent` accepts + stamps `formId` / `formSubmissionId` onto the intent row (fields already exist at checkout.ts:275-276, currently hardcoded `undefined`).
  2. New internal query `internal.commerceSubscriptions.checkout.getIntentBySubmission({formSubmissionId})` → returns the existing `payment_pending`/`activated` intent or null (needs a `by_form_submission` index on `commerce_subscription_checkout_intents`).
- In `run()`, **before** Call 1: `const intent = await ctx.runQuery(getIntentBySubmission, {formSubmissionId: ctx.submissionId}).catch(()=>null)`. If found, reuse it (skip create) so a retry never mints a second intent → second PaymentIntent.
- **Fallback if the subscription team can't add these in time:** derive a deterministic `idempotencyKey` (e.g. `form_sub_<submissionId>`) and pass through the existing `idempotencyKey` field — but the `getIntentBySubmission` lookup is the preferred guard. Mark whichever is chosen in the file header.
- Activation idempotency (layer 3) is already free via `activateFromIntent`'s status guard — no work.

### Step 7 — Bootstrap (`actions/index.ts`)
- Import `./subscription` (and later `./payment`) for registration side-effects; re-export the registered definitions array for the framework's loader to pick up. This is the Forms extension's action-type entry per PRD §9.1.

### Step 8 — Admin config editor (`SubscriptionActionConfigEditor.tsx`)
- Base UI only (`@base-ui/react`), no Radix, no hardcoded colors (CSS vars). Full-page, no modal editor.
- Fields: offer mode toggle (fixed offer picker / field-name + optionValue→offerId map), email field name, coupon mode + field/code, `accountPolicy` (`require_existing` | `create_on_website`), `returnUrl`, `maxInitialAmount`.
- Validates via the same `subscriptionConfigSchema` (import from `config.ts`) before save; surfaces `validateConfig` errors inline. Gated by the framework's `form.manage_actions` (registers NO new capability).

### Step 9 — Website in-form payment surface
- `FormStripePaymentForm.tsx`: copy `StripePaymentForm.tsx` structure → `loadStripe(publishableKey)` → `<Elements options={{clientSecret}}>` → `<PaymentElement/>` → on confirm `mode==="setup" ? confirmSetup : confirmPayment` with `confirmParams:{return_url}`. **No secret key, no PaymentIntent creation, no activate — PCI boundary.**
- `useFormSubscriptionPayment.ts`: on Renderer submit, if `run()` returned `{needsPayment}`, mount the Elements step. For anon + `accountPolicy:"create_on_website"`: run Clerk `signUp.create → setActive` (or email-verify redirect persisting `intentId`) **before** confirm, mirroring `SignupForm.tsx:162-296`, so activation never hits `USER_NOT_FOUND`. On success the webhook activates; redirect to `returnUrl` (Confirmation system). **Client never calls `activateFromIntent` for the paid path.**
- Live-vs-free branch via `getLiveChargingStatus`; if paid + not live → show the production-style "live charging disabled" message (no fake success).

### Step 10 — Run finalization on webhook activation (reconcile the run log)
- The paid run sits at `awaiting_payment` until the webhook's `activateFromIntent` settles the intent. Pick ONE (coordinate w/ Actions + subscription systems — Open Question #1):
  - **(a)** subscription/webhook path calls an internal `finalizeSubscriptionRun({formSubmissionId})` hook that patches the matching `form_action_runs` row → `completed` with `result:{intentId, contractId, …}`; **or**
  - **(b)** Entry Management reconciles run status from the intent's `activated` status on read.
- Default to (a) if the subscription system can host the hook; otherwise (b). Document the choice; do not leave paid runs stuck at `awaiting_payment` with no resolution path.

### Step 11 — Account-create policy enforcement
- `require_existing`: at submit/`run()` confirm `createCheckoutIntent` captured `userId` (logged-in). If anon + `require_existing` + paid → surface a clear "must be signed in" error (do not start a charge that can't activate).
- `create_on_website`: handled by Step 9's client signup-then-pay sequence.

### Step 12 — `type:"payment"` one-time variant (Phase 5, last)
- `actions/payment.ts`: same `resolveInputs` + orchestration, targeting an offer with `recurringAmount:0` (default reuse path per Open Question #3). Register via `index.ts`. Confirm its `run()` is idempotent on `(submissionId, formActionId)` too.

---

## Cross-system asks (must be agreed before paid ships)
1. **Actions framework (host):** the `AWAITING_PAYMENT` → `awaiting_payment` non-terminal run contract (no retry, no `form.action_failed`) + where `run()` reads `formId/submissionId/values`. **Blocking for paid.**
2. **Subscription system:** (a) accept+stamp `formId`/`formSubmissionId` on `createCheckoutIntent`; (b) add `getIntentBySubmission` internal query + `by_form_submission` index; (c) host `finalizeSubscriptionRun` (or accept reconcile-on-read). **Blocking for the anti-double-charge guarantee.**
3. **Events:** add `form.subscription_started` to `FORM_EVENTS` (this plan does it; trivial).

---

## Verify checklist

**Static / build**
- [ ] `bun run typecheck` (or project's check) passes. Expect Convex TS2589 false positives on the `commerceSubscriptions` calls — suppress with scoped `@ts-expect-error`, do **not** disable typecheck.
- [ ] No imports from `@radix-ui/*` (Base UI only). No hardcoded color literals in the editor.
- [ ] No edits to root `schema.ts` / `registry.ts` / `nav-config.ts`. No new tables.

**Config / mapping**
- [ ] `validateConfig` rejects: fixed mode w/o `offerId`; fromField mode w/o `offerFieldName`; empty `emailFieldName`; negative `maxInitialAmount`.
- [ ] `resolveInputs` resolves offer via `offerFieldMap`, falls back to field-value-as-offerId, trims email, applies coupon by mode.

**Zero-amount (no money) — buildable without the host framework via the shim**
- [ ] Free offer → `run()` → `activateFromIntent(provider:"free")` → `{ok:true, contractId, paid:false}`; contract + entitlements created.
- [ ] Membership grant fires automatically (offer `entitlementCodes` → plan `grantMode∈{subscription,hybrid}`, bridge on) with **zero** grant code in this action.
- [ ] `form.subscription_started` emitted after intent creation (assert event row).

**Money safety (sandbox-only, live charging on)**
- [ ] Paid offer → `run()` returns `{needsPayment, intentId, clientSecret, publishableKey, mode}`; run row = `awaiting_payment`; **no `activateFromIntent` called by the action**; **no `form.action_failed`**.
- [ ] Card confirmed in Elements → Stripe webhook calls `activateFromIntent(provider:"stripe")` → contract created **once**; run finalized → `completed`.
- [ ] **Re-fired submission / scheduler retry / manual replay → exactly ONE intent, ONE PaymentIntent, ONE contract** (assert no second PaymentIntent created).
- [ ] **Payment-succeeded-then-activation-failed** (simulate webhook delay / transient error / `USER_NOT_FOUND`): re-run activation completes against the already-paid intent → **no re-charge**.
- [ ] Two paths race to activate one intent (webhook + stray retry) → second is a no-op returning existing `contractId`.
- [ ] `activateFromIntent(provider:"free")` on a **nonzero** intent throws (rejected) — confirms the action never takes the free path for paid.
- [ ] `maxInitialAmount` exceeded → permanent failure **before any charge**.
- [ ] Coupon invalid → `COUPON_INVALID` → permanent `failed` w/ reason; nothing charged. Offer archived → `OFFER_ARCHIVED` → permanent; nothing charged.
- [ ] Subscriptions enabled but live charging **off** + paid offer → refused with clear message, no fake success.

**Account branch**
- [ ] Signed-in → `createCheckoutIntent` captures `userId`; activation resolves directly.
- [ ] Anon + `create_on_website` → client Clerk signup runs before confirm; activation never throws `USER_NOT_FOUND`.
- [ ] Anon + `require_existing` + paid → clear "must be signed in" error; no charge started.

**PCI / security**
- [ ] No Stripe SDK instantiated server-side in this system; no PaymentIntent created here (only `beginFirstCharge` does); no PAN in logs/submission.
- [ ] Only the **publishable** key reaches the browser (via `getLiveChargingStatus`).
- [ ] All amounts originate server-side; no client-sent price is ever trusted.

---

## Phasing (maps to PRD §13)
1. **P1** — Steps 0-4, 7, 8: config + zero-amount activation (no money). Shippable behind the shim.
2. **P2** — Steps 5, 6, 10: `awaiting_payment` contract + intent reuse + run finalization (the spiky core). Requires cross-system asks #1, #2.
3. **P3** — Step 9: Website Stripe Elements surface.
4. **P4** — Step 11: account-create branch.
5. **P5** — Step 12: `type:"payment"` one-time + membership-grant verification.
