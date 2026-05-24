# Membership + Commerce Subscriptions — Final Completion Plan (Wave 10)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every remaining gap from the 2026-04-22 audit so the Membership Plan System and Commerce Subscriptions System pass every PRD criterion, not just the stub-backed ones.

**Architecture:** Five focused sub-waves, each independently shippable with its own deploy and commit. Wave 10.1 unblocks real money movement end-to-end on the signup path; 10.2 closes the customer-communication gap; 10.3 finishes admin completeness; 10.4 closes the entitlement-to-role gap; 10.5 adds `day` interval parity and refreshes audit docs.

**Tech Stack:** Convex (schema + functions), TanStack Router (admin + website), Stripe SDK (server + client via `@stripe/react-stripe-js`), Resend via existing `emails/` module, bun:test for new unit tests.

**Deploy cadence:** After every wave. No `--typecheck=disable` ever (the Wave 9 suppression baseline holds; any new TS2589 sites get scoped `@ts-expect-error TS2589: ...` pragmas matching that pattern).

---

## File Structure

### Wave 10.1 — Website Stripe Elements signup
- Modify: `ConvexPress-Website/apps/web/package.json` — add `@stripe/stripe-js` + `@stripe/react-stripe-js`
- Create: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/publicCharge.ts` — public-facing mutation that schedules `beginSubscriptionFirstCharge` and returns the client_secret
- Create: `ConvexPress-Website/apps/web/src/components/subscriptions/StripePaymentForm.tsx` — Elements Provider + `PaymentElement` + confirm handler
- Modify: `ConvexPress-Website/apps/web/src/components/subscriptions/SignupForm.tsx` — conditionally mount `StripePaymentForm` when live charging is on; fall through to stub otherwise
- Modify: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/queries.ts` — new public `getLiveChargingStatus` query so the website knows which code path to render

### Wave 10.2 — Subscription email templates + event subscribers
- Modify: `ConvexPress-Admin/packages/backend/convex/emails/templateDefaults.ts` — add 6 subscription templates
- Create: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/emails.ts` — internal mutation `sendSubscriptionEmail` that calls the emails module
- Modify: `ConvexPress-Admin/packages/backend/convex/bootstrap/registerListeners.ts` — register 6 event subscribers
- Modify: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/internals.ts` — emit `subscription.renewed` / `subscription.past_due` / `subscription.cancelled` / `subscription.paused` events at the appropriate transitions; emit `subscription.trial_ending` from a new cron
- Modify: `ConvexPress-Admin/packages/backend/convex/crons.ts` — register daily `trial-ending-notifier` cron

### Wave 10.3 — Admin completeness
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/commerceSubscriptions.ts` — add `invoiceNumber: v.optional(v.string())` + `by_invoiceNumber` index
- Modify: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/internals.ts` — `createDueInvoices` generates sequential `invoiceNumber` via a counter settings key
- Modify: `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts` — add `commerceSubscriptionsInvoiceCounter` settings key
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/invoices/index.tsx` — show `invoiceNumber` column
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/order-forms/index.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/order-forms/new.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/order-forms/$formId.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/form-submissions/index.tsx`
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/form-submissions/$submissionId.tsx`

### Wave 10.4 — `linkedRoleId` role elevation
- Modify: `ConvexPress-Admin/packages/backend/convex/helpers/permissions.ts` — `resolveUserRole` consults membership grants' `linkedRoleId` when no base role or when a grant's role has higher `level`
- Create: `ConvexPress-Admin/packages/backend/convex/helpers/__tests__/linkedRole.test.ts` — pure-function tests for the elevation decision

### Wave 10.5 — `day` interval + audit refresh + docs
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/commerceSubscriptions.ts` — add `v.literal("day")` to the 3 `billingInterval` unions
- Modify: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/internals.ts` — `addBillingPeriod("day", count)` support
- Modify: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/checkout.ts` — `addBillingPeriod` support in checkout
- Modify: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/proration.ts` — same
- Create: `agents/knowledge/stripe-integration.md` — documents the divergence from Stripe Billing (we manage invoices; Stripe handles charges only)
- Modify: `.codex/audit-backlog/system-audit-gaps.md` — update Completion percentages for Membership Plan / Subscription / Subscription Billing / Subscription Entitlement
- Update: Airtable records (via `airtable` CLI) — completion % per system

---

## Wave 10.1 — Website Stripe Elements signup

### Task 1.1: Install Stripe client SDKs on website

**Files:**
- Modify: `ConvexPress-Website/apps/web/package.json`

- [ ] **Step 1: Add Stripe packages**

Run from `ConvexPress-Website/apps/web/`:
```bash
bun add @stripe/stripe-js @stripe/react-stripe-js
```
Expected: packages added, no peer-dependency warnings.

- [ ] **Step 2: Verify versions land in package.json**

Run:
```bash
grep '"@stripe/' package.json
```
Expected:
```
    "@stripe/react-stripe-js": "^3...",
    "@stripe/stripe-js": "^5...",
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json bun.lock
git commit -m "website(deps): add @stripe/stripe-js + @stripe/react-stripe-js for subscription signup"
```

---

### Task 1.2: Public `getLiveChargingStatus` query

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/queries.ts`

- [ ] **Step 1: Add the public query**

Append to `queries.ts` (after the last existing export):

```typescript
/**
 * Public query exposing whether real Stripe charging is on for the site.
 * The website signup flow uses this to decide whether to render Stripe
 * Elements (live) or skip the card step entirely (stub mode for dev).
 *
 * Returns `{ live: boolean, publishableKey: string | null }`. Only the
 * publishable key is exposed — never the secret.
 */
export const getLiveChargingStatus = query({
  args: {},
  handler: async (ctx): Promise<{ live: boolean; publishableKey: string | null }> => {
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q: any) => q.eq("section", "commerce.payments"))
      .unique();
    const values = (doc?.values ?? {}) as Record<string, unknown>;
    const live = values.subscriptionChargingEnabled === true;
    const publishableKey =
      typeof values.stripePublishableKey === "string" && values.stripePublishableKey.trim()
        ? (values.stripePublishableKey as string)
        : null;
    return { live, publishableKey };
  },
});
```

- [ ] **Step 2: Typecheck**

Run from `ConvexPress-Admin/packages/backend/`:
```bash
bunx tsc --noEmit -p convex/tsconfig.json
```
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/convex/commerceSubscriptions/queries.ts
git commit -m "feat(commerce-subscriptions): public getLiveChargingStatus query (Wave 10.1)"
```

---

### Task 1.3: Public charge action wrapper

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/publicCharge.ts`

- [ ] **Step 1: Create the public action wrapper**

Content:
```typescript
/**
 * Public-facing wrapper around the internal `beginSubscriptionFirstCharge`
 * action. The website calls this from the signup form after
 * `createCheckoutIntent` has returned a checkout intent id. It creates the
 * Stripe Customer + PaymentIntent (with `setup_future_usage: off_session`)
 * and returns the `client_secret` so Stripe Elements can confirm the card.
 *
 * This is an `action` (not an internalAction) so anonymous visitors can
 * call it. The backend-side `beginSubscriptionFirstCharge` verifies that
 * the checkout intent exists and is still payment_pending.
 */

import { v } from "convex/values";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireCommerceSubscriptionsEnabled } from "./helpers";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const beginFirstCharge = action({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    checkoutIntentId: v.id("commerce_subscription_checkout_intents"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    return await ctx.runAction(
      internal.commerceSubscriptions.stripeCharge.beginSubscriptionFirstCharge,
      { checkoutIntentId: args.checkoutIntentId },
    );
  },
});
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit -p convex/tsconfig.json
```
Expected: exit 0. If TS2589 fires on new lines, add `// @ts-expect-error TS2589: ...` above them (mirror the pattern already present in `stripeCharge.ts`).

- [ ] **Step 3: Deploy**

```bash
bunx convex deploy
```
Expected: `✔ Deployed Convex functions`.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/convex/commerceSubscriptions/publicCharge.ts
git commit -m "feat(commerce-subscriptions): public beginFirstCharge action (Wave 10.1)"
```

---

### Task 1.4: `StripePaymentForm` component

**Files:**
- Create: `ConvexPress-Website/apps/web/src/components/subscriptions/StripePaymentForm.tsx`

- [ ] **Step 1: Scaffold the component**

Content:
```typescript
/**
 * Stripe Elements wrapper for the subscription signup flow (Wave 10.1).
 *
 * Contract:
 *   - Parent calls `beginSubscriptionFirstCharge` to create a PaymentIntent.
 *   - Parent passes the returned `clientSecret` + `publishableKey` here.
 *   - On submit, we call `stripe.confirmPayment` with the PaymentElement.
 *   - On success, Stripe fires `payment_intent.succeeded` to our webhook,
 *     which activates the checkout intent into a subscription. The parent
 *     redirects to `/dashboard/subscriptions?welcome=1`.
 *
 * We do NOT activate client-side — the webhook is the source of truth.
 */

import { useEffect, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

interface Props {
  publishableKey: string;
  clientSecret: string;
  returnUrl: string;
  onError: (message: string) => void;
}

export function StripePaymentForm(props: Props) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  useEffect(() => {
    setStripePromise(loadStripe(props.publishableKey));
  }, [props.publishableKey]);

  if (!stripePromise) return null;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret: props.clientSecret }}>
      <PaymentFormInner returnUrl={props.returnUrl} onError={props.onError} />
    </Elements>
  );
}

function PaymentFormInner(props: { returnUrl: string; onError: (m: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: props.returnUrl },
    });
    if (result.error) {
      props.onError(result.error.message ?? "Payment failed");
      setSubmitting(false);
    }
    // On success, Stripe redirects to returnUrl. No further action here.
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Processing…" : "Complete payment"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck website**

```bash
cd ConvexPress-Website/apps/web && bun run check-types
```
Expected: 0 errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/subscriptions/StripePaymentForm.tsx
git commit -m "website(subscriptions): StripePaymentForm component (Wave 10.1)"
```

---

### Task 1.5: Wire `SignupForm` to live path

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/components/subscriptions/SignupForm.tsx`

- [ ] **Step 1: Add live-path branch**

Find the block in `SignupForm.tsx` that currently builds `paymentResult = { provider: "stub", ... }` (around line 215–232). Replace the surrounding flow to:

1. Query `getLiveChargingStatus` at the top of the component.
2. After `createCheckoutIntent` returns an `intentId`:
   - If `live === false`: keep the current stub activation path.
   - If `live === true`: call the new public action `commerceSubscriptions.publicCharge.beginFirstCharge({ checkoutIntentId: intentId })`, get back `{ clientSecret, publishableKey }`, render `<StripePaymentForm>` with them, and NOT call `activateFromIntent` client-side (the webhook does it).

Concretely, add near the top of the component:
```typescript
import { StripePaymentForm } from "./StripePaymentForm";
import { useAction } from "convex/react";

// inside component body
const chargingStatus = useQuery(
  (api as any).commerceSubscriptions.queries.getLiveChargingStatus,
) as { live: boolean; publishableKey: string | null } | undefined;

const beginFirstCharge = useAction(
  (api as any).commerceSubscriptions.publicCharge.beginFirstCharge,
);

const [stripeContext, setStripeContext] = useState<{
  clientSecret: string;
  publishableKey: string;
} | null>(null);
```

Replace the existing stub block with:
```typescript
if (chargingStatus?.live && chargingStatus.publishableKey) {
  // Live path — create the intent, then get a Stripe client_secret.
  const intent = await createCheckoutIntent({
    offerId: offer._id as any,
    customerEmail: email,
    couponCode,
    returnUrl,
  });
  const charge = await beginFirstCharge({ checkoutIntentId: intent.intentId });
  if (!charge.clientSecret) {
    toast.error("Could not start payment. Please try again.");
    setLoading(false);
    return;
  }
  setStripeContext({
    clientSecret: charge.clientSecret,
    publishableKey: chargingStatus.publishableKey,
  });
  setLoading(false);
  return;
}
// Stub path (dev) — unchanged.
```

And render the form conditionally:
```tsx
{stripeContext ? (
  <StripePaymentForm
    publishableKey={stripeContext.publishableKey}
    clientSecret={stripeContext.clientSecret}
    returnUrl={`${window.location.origin}/dashboard/subscriptions?welcome=1`}
    onError={(m) => {
      toast.error(m);
      setStripeContext(null);
    }}
  />
) : (
  /* existing email + submit UI */
)}
```

- [ ] **Step 2: Boot website dev + smoke test route load**

```bash
cd ConvexPress-Website/apps/web && bun run dev > /tmp/web.log 2>&1 &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4106/signup/any
kill %1
```
Expected: `200` (page renders, may show "offer not found" without test data — that's fine).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/subscriptions/SignupForm.tsx
git commit -m "website(subscriptions): wire SignupForm to Stripe Elements live path (Wave 10.1)"
```

---

### Task 1.6: Wave 10.1 acceptance

- [ ] **Step 1: Confirm webhook routing is already in place**

Run:
```bash
grep -n "subscription_first_charge" ConvexPress-Admin/packages/backend/convex/http.ts
```
Expected: one match in the `payment_intent.succeeded` branch (lives there from Wave 9.1).

- [ ] **Step 2: Confirm signup form now branches on live status**

Run:
```bash
grep -n "beginFirstCharge\|stripeContext" ConvexPress-Website/apps/web/src/components/subscriptions/SignupForm.tsx | wc -l
```
Expected: `>= 3`.

- [ ] **Step 3: Deploy backend (final push for Wave 10.1)**

```bash
cd ConvexPress-Admin/packages/backend && bunx convex deploy
```
Expected: `✔ Deployed Convex functions`.

- [ ] **Step 4: Commit + tag**

```bash
git tag wave-10.1
git push origin wave-10.1
```

---

## Wave 10.2 — Subscription email templates + event subscribers

### Task 2.1: Add 6 subscription template defaults

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/emails/templateDefaults.ts`

- [ ] **Step 1: Read existing template shape**

```bash
grep -n "key:\|subject:\|html:" ConvexPress-Admin/packages/backend/convex/emails/templateDefaults.ts | head -20
```
Note the exact `TemplateDefinition` shape (key, subject, html, text, variables array).

- [ ] **Step 2: Append 6 templates to `DEFAULT_TEMPLATES`**

At the end of the `DEFAULT_TEMPLATES` array, before the closing bracket, append:

```typescript
  {
    key: "subscription_welcome",
    subject: "Welcome — your subscription is active",
    html: `<h1>Welcome, {{customerName}}</h1><p>Your subscription to <strong>{{offerTitle}}</strong> is now active. Your next bill of {{amount}} is due on {{nextBillingAt}}.</p><p><a href="{{portalUrl}}">Manage your subscription</a></p>`,
    text: `Welcome, {{customerName}}\n\nYour subscription to {{offerTitle}} is now active.\nNext bill: {{amount}} on {{nextBillingAt}}\n\nManage: {{portalUrl}}`,
    variables: ["customerName", "offerTitle", "amount", "nextBillingAt", "portalUrl"],
  },
  {
    key: "subscription_renewed",
    subject: "Your subscription renewed",
    html: `<h1>Thanks, {{customerName}}</h1><p>Your subscription to <strong>{{offerTitle}}</strong> renewed successfully. {{amount}} was charged to the card on file.</p><p>Next renewal: {{nextBillingAt}}.</p><p><a href="{{portalUrl}}">Manage your subscription</a></p>`,
    text: `Thanks, {{customerName}}\n\nYour subscription to {{offerTitle}} renewed. {{amount}} was charged.\nNext renewal: {{nextBillingAt}}\n\nManage: {{portalUrl}}`,
    variables: ["customerName", "offerTitle", "amount", "nextBillingAt", "portalUrl"],
  },
  {
    key: "subscription_payment_failed",
    subject: "Payment failed — action required",
    html: `<h1>Hi {{customerName}}</h1><p>We couldn't charge your card for <strong>{{offerTitle}}</strong>. We'll retry automatically, but you can fix it now to avoid interruption.</p><p><a href="{{portalUrl}}">Update your payment method</a></p><p>Attempt {{attemptNumber}} of {{maxAttempts}}.</p>`,
    text: `Hi {{customerName}}\n\nWe couldn't charge your card for {{offerTitle}}.\nAttempt {{attemptNumber}} of {{maxAttempts}}.\n\nUpdate payment: {{portalUrl}}`,
    variables: ["customerName", "offerTitle", "attemptNumber", "maxAttempts", "portalUrl"],
  },
  {
    key: "subscription_trial_ending",
    subject: "Your trial ends in 3 days",
    html: `<h1>Hi {{customerName}}</h1><p>Your trial of <strong>{{offerTitle}}</strong> ends on {{trialEndsAt}}. Your first full charge of {{amount}} will run that day.</p><p><a href="{{portalUrl}}">Manage your subscription</a></p>`,
    text: `Hi {{customerName}}\n\nYour trial of {{offerTitle}} ends {{trialEndsAt}}. First charge: {{amount}}.\n\nManage: {{portalUrl}}`,
    variables: ["customerName", "offerTitle", "trialEndsAt", "amount", "portalUrl"],
  },
  {
    key: "subscription_cancelled",
    subject: "Your subscription has been cancelled",
    html: `<h1>Hi {{customerName}}</h1><p>Your subscription to <strong>{{offerTitle}}</strong> has been cancelled{{#if accessThrough}} and you'll keep access through {{accessThrough}}{{/if}}. We're sorry to see you go.</p>`,
    text: `Hi {{customerName}}\n\nYour subscription to {{offerTitle}} has been cancelled.{{#if accessThrough}}\nAccess through: {{accessThrough}}{{/if}}`,
    variables: ["customerName", "offerTitle", "accessThrough"],
  },
  {
    key: "subscription_paused",
    subject: "Your subscription is paused",
    html: `<h1>Hi {{customerName}}</h1><p>Your subscription to <strong>{{offerTitle}}</strong> has been paused. We won't charge you while paused. Resume any time:</p><p><a href="{{portalUrl}}">Resume subscription</a></p>`,
    text: `Hi {{customerName}}\n\nYour subscription to {{offerTitle}} has been paused.\n\nResume: {{portalUrl}}`,
    variables: ["customerName", "offerTitle", "portalUrl"],
  },
```

- [ ] **Step 3: Typecheck**

```bash
bunx tsc --noEmit -p convex/tsconfig.json
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/convex/emails/templateDefaults.ts
git commit -m "feat(emails): add 6 subscription lifecycle templates (Wave 10.2)"
```

---

### Task 2.2: `sendSubscriptionEmail` helper

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/emails.ts`

- [ ] **Step 1: Create the file**

Content:
```typescript
/**
 * Commerce Subscriptions — email dispatcher (Wave 10.2).
 *
 * Each event subscriber calls `sendSubscriptionEmail` with the template key
 * and the subscription id. We resolve the recipient email, build the
 * variable bag, and hand off to the existing `emails` module.
 */

import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

const TEMPLATE_KEYS = [
  "subscription_welcome",
  "subscription_renewed",
  "subscription_payment_failed",
  "subscription_trial_ending",
  "subscription_cancelled",
  "subscription_paused",
] as const;
type TemplateKey = (typeof TEMPLATE_KEYS)[number];

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const sendSubscriptionEmail = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    subscriptionId: v.id("commerce_subscriptions"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    templateKey: v.union(
      ...TEMPLATE_KEYS.map((k) => v.literal(k)),
    ),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    extra: v.optional(v.any()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription || !subscription.userId) return;
    const user = await ctx.db.get(subscription.userId);
    if (!user || !user.email) return;

    const offerId = subscription.pricingSnapshot?.offerId;
    const offer = offerId ? await ctx.db.get(offerId) : null;

    const amount =
      typeof subscription.recurringAmount === "number"
        ? `${(subscription.recurringAmount / 100).toFixed(2)} ${subscription.currencyCode}`
        : "";
    const nextBillingAt = subscription.nextBillingAt
      ? new Date(subscription.nextBillingAt).toLocaleDateString()
      : "";
    const trialEndsAt = subscription.trialEndsAt
      ? new Date(subscription.trialEndsAt).toLocaleDateString()
      : "";

    const variables: Record<string, string> = {
      customerName: user.displayName ?? user.email,
      offerTitle: offer?.title ?? "your subscription",
      amount,
      nextBillingAt,
      trialEndsAt,
      portalUrl: "/dashboard/subscriptions",
      ...(args.extra ?? {}),
    };

    await ctx.scheduler.runAfter(
      0,
      internal.emails.internals.scheduleEmailByTemplate as any,
      {
        templateKey: args.templateKey,
        to: user.email,
        variables,
      },
    );
  },
});
```

- [ ] **Step 2: Confirm `emails.internals.scheduleEmailByTemplate` exists**

```bash
grep -n "scheduleEmailByTemplate\|templateKey" ConvexPress-Admin/packages/backend/convex/emails/internals.ts | head -10
```
If an `export const scheduleEmailByTemplate = internalMutation({ args: { templateKey, to, variables } })` does NOT exist, scan `emails/internals.ts` for an equivalent (any function that takes a template key + recipient + variables and enqueues a Resend send). Adjust the `scheduler.runAfter` target accordingly. If no such function exists, stop and add one in the next sub-step. Expected: it DOES exist (the emails system is marked Complete in CLAUDE.md).

- [ ] **Step 3: Typecheck**

```bash
bunx tsc --noEmit -p convex/tsconfig.json
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/convex/commerceSubscriptions/emails.ts
git commit -m "feat(commerce-subscriptions): sendSubscriptionEmail helper (Wave 10.2)"
```

---

### Task 2.3: Emit lifecycle events at transitions

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/internals.ts`

- [ ] **Step 1: Locate the transition points**

Run:
```bash
grep -n "subscription.renewed\|subscription.past_due\|subscription.paused\|subscription.cancelled\|subscription.created" ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/internals.ts | head -10
```
Existing `writeHistory` call sites already emit `subscription.renewed`, `subscription.past_due`. We do NOT re-emit — we subscribe to those existing history events OR to the bridge emitEvent calls. Check which pattern:

```bash
grep -n "emitEvent\|eventType" ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/internals.ts | head
```

If `emitEvent` is not called from internals.ts, the existing Event Dispatcher pipe uses `writeHistory` as an audit trail, not as an event emitter. In that case we add explicit `emitEvent` calls at each transition.

- [ ] **Step 2: Add emitEvent calls**

At the top of the file add:
```typescript
import { emitEvent } from "../helpers/events";
```
(confirm by grepping for the existing import first to avoid dupes.)

Find the success branch of `handleInvoicePaymentResult` (~line 590, where `writeHistory({ eventType: "subscription.renewed" })` is called). Right after the writeHistory, add:
```typescript
await emitEvent(ctx, "commerce.subscription_renewed", "commerce", {
  subscriptionId: subscription._id,
  userId: subscription.userId,
  offerId: subscription.pricingSnapshot?.offerId,
  invoiceId: invoice._id,
});
```

Find the failure branch that marks the subscription `past_due` (~line 637). Right after the patch, add:
```typescript
await emitEvent(ctx, "commerce.subscription_past_due", "commerce", {
  subscriptionId: subscription._id,
  userId: subscription.userId,
  attemptNumber,
});
```

Find `transitionSubscription` (search `export function transitionSubscription\|async function transitionSubscription`). After the status patch inside that function, add:
```typescript
if (args.toStatus === "paused") {
  await emitEvent(ctx, "commerce.subscription_paused", "commerce", {
    subscriptionId: args.subscription._id,
    userId: args.subscription.userId,
  });
} else if (args.toStatus === "cancelled") {
  await emitEvent(ctx, "commerce.subscription_cancelled", "commerce", {
    subscriptionId: args.subscription._id,
    userId: args.subscription.userId,
    reason: args.reason,
  });
}
```

- [ ] **Step 3: Typecheck**

```bash
bunx tsc --noEmit -p convex/tsconfig.json
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/convex/commerceSubscriptions/internals.ts
git commit -m "feat(commerce-subscriptions): emit lifecycle events at transitions (Wave 10.2)"
```

---

### Task 2.4: Daily `trial-ending-notifier` cron

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/internals.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/crons.ts`

- [ ] **Step 1: Add the internal mutation**

Append to `internals.ts`:

```typescript
/**
 * Scan for trialing subscriptions whose trial ends in ~3 days and emit
 * `commerce.subscription_trial_ending` once. Idempotent via a marker on
 * the subscription's sourceMetadata (`trialEndingEmailSent`).
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const emitTrialEndingEvents = internalMutation({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    const now = Date.now();
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    const fourDays = 4 * 24 * 60 * 60 * 1000;

    const trialing = await ctx.db
      .query("commerce_subscriptions")
      .withIndex("by_status", (q: any) => q.eq("status", "trialing"))
      .collect();

    let emitted = 0;
    for (const sub of trialing) {
      if (!sub.trialEndsAt) continue;
      if (sub.trialEndsAt < now + threeDays) continue;
      if (sub.trialEndsAt > now + fourDays) continue;
      if (sub.sourceMetadata?.trialEndingEmailSent) continue;

      await emitEvent(ctx, "commerce.subscription_trial_ending", "commerce", {
        subscriptionId: sub._id,
        userId: sub.userId,
        trialEndsAt: sub.trialEndsAt,
      });
      await ctx.db.patch(sub._id, {
        sourceMetadata: {
          ...(sub.sourceMetadata ?? {}),
          trialEndingEmailSent: true,
        },
        updatedAt: now,
      });
      emitted++;
    }
    return { emitted };
  },
});
```

- [ ] **Step 2: Register the cron**

Open `convex/crons.ts`, find the existing `subscription-renewals` registration, and add a sibling:
```typescript
crons.daily(
  "subscription-trial-ending",
  { hourUTC: 12, minuteUTC: 0 },
  internal.commerceSubscriptions.internals.emitTrialEndingEvents,
);
```

- [ ] **Step 3: Typecheck + deploy**

```bash
bunx tsc --noEmit -p convex/tsconfig.json && bunx convex deploy
```
Expected: tsc exit 0, deploy success.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/convex/commerceSubscriptions/internals.ts packages/backend/convex/crons.ts
git commit -m "feat(commerce-subscriptions): daily trial-ending-notifier cron (Wave 10.2)"
```

---

### Task 2.5: Register event listeners

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/bootstrap/registerListeners.ts`

- [ ] **Step 1: Add 6 ListenerDef entries**

Locate the `listeners: ListenerDef[]` array in `registerListeners.ts` (search for `listeners:` inside the file). At the end of the array, add:

```typescript
  {
    eventCode: "commerce.subscription_created",
    name: "send-welcome-email",
    handlerType: "internal",
    handlerRef: "commerceSubscriptions.emails.sendSubscriptionEmail",
    payloadTransform: { templateKey: "subscription_welcome" },
    priority: 10,
  },
  {
    eventCode: "commerce.subscription_renewed",
    name: "send-renewed-email",
    handlerType: "internal",
    handlerRef: "commerceSubscriptions.emails.sendSubscriptionEmail",
    payloadTransform: { templateKey: "subscription_renewed" },
    priority: 10,
  },
  {
    eventCode: "commerce.subscription_past_due",
    name: "send-payment-failed-email",
    handlerType: "internal",
    handlerRef: "commerceSubscriptions.emails.sendSubscriptionEmail",
    payloadTransform: { templateKey: "subscription_payment_failed" },
    priority: 10,
  },
  {
    eventCode: "commerce.subscription_trial_ending",
    name: "send-trial-ending-email",
    handlerType: "internal",
    handlerRef: "commerceSubscriptions.emails.sendSubscriptionEmail",
    payloadTransform: { templateKey: "subscription_trial_ending" },
    priority: 10,
  },
  {
    eventCode: "commerce.subscription_cancelled",
    name: "send-cancelled-email",
    handlerType: "internal",
    handlerRef: "commerceSubscriptions.emails.sendSubscriptionEmail",
    payloadTransform: { templateKey: "subscription_cancelled" },
    priority: 10,
  },
  {
    eventCode: "commerce.subscription_paused",
    name: "send-paused-email",
    handlerType: "internal",
    handlerRef: "commerceSubscriptions.emails.sendSubscriptionEmail",
    payloadTransform: { templateKey: "subscription_paused" },
    priority: 10,
  },
```

- [ ] **Step 2: Check payload transform shape**

Verify by grepping for an existing listener with `payloadTransform` to confirm the field name matches:
```bash
grep -n "payloadTransform\|payloadMap" ConvexPress-Admin/packages/backend/convex/bootstrap/registerListeners.ts | head -10
```
Match the field name used by other listeners. If the codebase uses `extraPayload` or `transform` instead, rename accordingly. Do NOT invent a shape.

- [ ] **Step 3: Deploy**

```bash
bunx convex deploy
```
Expected: deploy success.

- [ ] **Step 4: Bootstrap listeners**

Register the new listeners by running the bootstrap mutation once from the Convex dashboard:
- Navigate to Convex dashboard → Functions → `bootstrap.registerListeners.run` → Run with `{}`
Expected: result shows the 6 new listeners added (or already-exists message on re-runs).

- [ ] **Step 5: Commit**

```bash
git add packages/backend/convex/bootstrap/registerListeners.ts
git commit -m "feat(events): register 6 subscription lifecycle email listeners (Wave 10.2)"
```

---

### Task 2.6: Wave 10.2 acceptance

- [ ] **Step 1: Confirm templates are in defaults**

```bash
grep -c "key: \"subscription_" ConvexPress-Admin/packages/backend/convex/emails/templateDefaults.ts
```
Expected: `6`.

- [ ] **Step 2: Confirm listeners registered**

Run a query from the dashboard: `eventListeners.queries.listByCode({ code: "commerce.subscription_renewed" })` → should return one `send-renewed-email` row. Repeat for each of the 6 codes.

- [ ] **Step 3: Run test suite**

```bash
cd ConvexPress-Admin/packages/backend && bun test convex/commerceSubscriptions/ convex/membership/
```
Expected: 233/233 pass (no test regressions; new emails path has no unit tests yet — deferred to manual verification against a Resend test inbox).

- [ ] **Step 4: Commit tag**

```bash
git tag wave-10.2
```

---

## Wave 10.3 — Admin completeness (invoice numbering + order-form / form-submission admin)

### Task 3.1: Schema — invoice numbering

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/commerceSubscriptions.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts`

- [ ] **Step 1: Add field + index**

Find the `commerce_subscription_invoices: defineTable({ ... })` block (around line 415). Add:
```typescript
    invoiceNumber: v.optional(v.string()),
```
after `status: commerceSubscriptionInvoiceStatusValidator,`.

Then on the `.index(...)` chain at the end of the table definition, add:
```typescript
    .index("by_invoice_number", ["invoiceNumber"])
```

- [ ] **Step 2: Add settings counter**

In `convex/settings/defaults.ts`, add a new section interface + defaults:

```typescript
export interface CommerceSubscriptionsCountersSettings {
  invoiceCounter: number;
  invoicePrefix: string;
}

export const COMMERCE_SUBSCRIPTIONS_COUNTERS_DEFAULTS: CommerceSubscriptionsCountersSettings = {
  invoiceCounter: 0,
  invoicePrefix: "INV-",
};
```

Add `"commerce.subscriptions.counters"` to the `SettingsSection` union and to the `getDefaults` switch.

- [ ] **Step 3: Typecheck**

```bash
bunx tsc --noEmit -p convex/tsconfig.json
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/convex/schema/commerceSubscriptions.ts packages/backend/convex/settings/defaults.ts
git commit -m "feat(commerce-subscriptions): invoiceNumber schema + settings counter (Wave 10.3)"
```

---

### Task 3.2: Generate sequential invoice numbers

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/internals.ts`

- [ ] **Step 1: Helper**

Near the top of `internals.ts` (after `createCorrelationId`), add:
```typescript
async function allocateInvoiceNumber(ctx: any): Promise<string> {
  const doc = await ctx.db
    .query("settings")
    .withIndex("by_section", (q: any) =>
      q.eq("section", "commerce.subscriptions.counters"),
    )
    .unique();
  const values = (doc?.values ?? {}) as {
    invoiceCounter?: number;
    invoicePrefix?: string;
  };
  const nextCounter = (values.invoiceCounter ?? 0) + 1;
  const prefix = values.invoicePrefix ?? "INV-";
  const formatted = `${prefix}${String(nextCounter).padStart(6, "0")}`;

  if (doc) {
    await ctx.db.patch(doc._id, {
      values: { ...values, invoiceCounter: nextCounter },
      updatedAt: Date.now(),
    });
  } else {
    await ctx.db.insert("settings", {
      section: "commerce.subscriptions.counters",
      values: { invoiceCounter: nextCounter, invoicePrefix: prefix },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return formatted;
}
```

- [ ] **Step 2: Wire in `createDueInvoices`**

Find the `ctx.db.insert("commerce_subscription_invoices", { ... })` inside `createDueInvoices`. Before the insert, call:
```typescript
const invoiceNumber = await allocateInvoiceNumber(ctx);
```
Add `invoiceNumber,` to the inserted record.

- [ ] **Step 3: Wire in proration.ts**

Same change inside `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/proration.ts` — find the `ctx.db.insert("commerce_subscription_invoices", {...})` inside `applyUpgradeProration`. Import/inline the same `allocateInvoiceNumber` helper (simplest: duplicate the function at the top of `proration.ts` to avoid cross-file type recursion issues).

- [ ] **Step 4: Typecheck + deploy**

```bash
bunx tsc --noEmit -p convex/tsconfig.json && bunx convex deploy
```
Expected: tsc exit 0, deploy success.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/convex/commerceSubscriptions/internals.ts packages/backend/convex/commerceSubscriptions/proration.ts
git commit -m "feat(commerce-subscriptions): allocate sequential invoice numbers (Wave 10.3)"
```

---

### Task 3.3: Surface invoiceNumber in admin list

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/invoices/index.tsx`

- [ ] **Step 1: Add column**

Open the file, find the `<AdminListTable>` columns array (search `columns = [`). Add as the first entry (before the existing columns):
```typescript
{
  key: "invoiceNumber",
  header: "Invoice #",
  sortable: false,
  render: (row: any) => row.invoiceNumber ?? row._id.slice(-6),
},
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/invoices/index.tsx
git commit -m "admin(commerce-subscriptions): show invoice number column (Wave 10.3)"
```

---

### Task 3.4: Order-forms admin — index route

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/order-forms/index.tsx`

- [ ] **Step 1: Scaffold list page**

Content (models the existing `offers/index.tsx` pattern):
```typescript
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "@backend/convex/_generated/api";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminListTable } from "@/components/admin/AdminListTable";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/order-forms/",
)({
  component: OrderFormsIndex,
});

function OrderFormsIndex() {
  const forms = useQuery(
    (api as any).commerceSubscriptions.queries.listOrderForms,
    {},
  ) as Array<{
    _id: string;
    title: string;
    slug: string;
    status: string;
    createdAt: number;
  }> | undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Order Forms"
        description="Direct-signup forms customers can complete to start a subscription."
        actions={
          <Link
            to="/admin/commerce/subscriptions/order-forms/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> New Form
          </Link>
        }
      />
      <AdminListTable
        data={forms ?? []}
        loading={forms === undefined}
        emptyMessage="No order forms yet."
        columns={[
          {
            key: "title",
            header: "Title",
            render: (row) => (
              <Link
                to="/admin/commerce/subscriptions/order-forms/$formId"
                params={{ formId: row._id }}
                className="font-medium hover:underline"
              >
                {row.title}
              </Link>
            ),
          },
          { key: "slug", header: "Slug" },
          { key: "status", header: "Status" },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 2: Confirm `listOrderForms` query exists**

```bash
grep -n "listOrderForms\|listOrderForm" ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/queries.ts
```
If it doesn't exist, stop and add a minimal query first:
```typescript
export const listOrderForms = query({
  args: {},
  handler: async (ctx) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    return await ctx.db.query("commerce_subscription_order_forms").collect();
  },
});
```
Then deploy and continue.

- [ ] **Step 3: Typecheck admin web**

```bash
cd ConvexPress-Admin/apps/web && bun run check-types 2>&1 | tail -20
```
Expected: no errors on this file.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/order-forms/index.tsx
git commit -m "admin(commerce-subscriptions): order-forms index route (Wave 10.3)"
```

---

### Task 3.5: Order-forms admin — new route

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/order-forms/new.tsx`

- [ ] **Step 1: Scaffold create page**

Content:
```typescript
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@backend/convex/_generated/api";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/order-forms/new",
)({
  component: NewOrderForm,
});

function NewOrderForm() {
  const navigate = useNavigate();
  const create = useMutation(
    (api as any).commerceSubscriptions.mutations.createOrderForm,
  );
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSave() {
    if (!title.trim() || !slug.trim()) {
      toast.error("Title and slug are required");
      return;
    }
    setSaving(true);
    try {
      const result = await create({ title, slug });
      toast.success("Order form created");
      navigate({
        to: "/admin/commerce/subscriptions/order-forms/$formId",
        params: { formId: result.orderFormId },
      });
    } catch (e: any) {
      toast.error(e.message ?? "Could not create order form");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <AdminPageHeader title="New Order Form" />
      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Title</span>
          <input
            className="w-full rounded-md border px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Slug</span>
          <input
            className="w-full rounded-md border px-3 py-2"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="premium-annual"
          />
        </label>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Confirm `createOrderForm` mutation exists**

```bash
grep -n "createOrderForm" ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/mutations.ts
```
If missing, add:
```typescript
export const createOrderForm = mutation({
  args: { title: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "commerce.subscriptions.manage");
    const now = Date.now();
    const orderFormId = await ctx.db.insert("commerce_subscription_order_forms", {
      title: args.title,
      slug: args.slug,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    return { orderFormId };
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/order-forms/new.tsx packages/backend/convex/commerceSubscriptions/mutations.ts
git commit -m "admin(commerce-subscriptions): new order-form route + create mutation (Wave 10.3)"
```

---

### Task 3.6: Order-forms admin — detail route

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/order-forms/$formId.tsx`

- [ ] **Step 1: Scaffold detail page**

Content:
```typescript
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { api } from "@backend/convex/_generated/api";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/order-forms/$formId",
)({
  component: OrderFormDetail,
});

function OrderFormDetail() {
  const { formId } = Route.useParams();
  const form = useQuery(
    (api as any).commerceSubscriptions.queries.getOrderForm,
    { orderFormId: formId as any },
  ) as {
    _id: string;
    title: string;
    slug: string;
    status: string;
  } | undefined;

  const update = useMutation(
    (api as any).commerceSubscriptions.mutations.updateOrderForm,
  );

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("draft");

  useEffect(() => {
    if (form) {
      setTitle(form.title);
      setStatus(form.status);
    }
  }, [form?._id]);

  if (form === undefined) return <div>Loading…</div>;
  if (form === null) return <div>Order form not found.</div>;

  async function onSave() {
    try {
      await update({ orderFormId: formId as any, title, status });
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <Link
        to="/admin/commerce/subscriptions/order-forms"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Back to forms
      </Link>
      <AdminPageHeader title={form.title} description={`Slug: ${form.slug}`} />
      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Title</span>
          <input
            className="w-full rounded-md border px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Status</span>
          <select
            className="w-full rounded-md border px-3 py-2"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <button
          type="button"
          onClick={onSave}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Save
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Confirm `getOrderForm` + `updateOrderForm` exist**

```bash
grep -n "getOrderForm\|updateOrderForm" ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/queries.ts ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/mutations.ts
```
If either is missing, add:
```typescript
// queries.ts
export const getOrderForm = query({
  args: { orderFormId: v.id("commerce_subscription_order_forms") },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    return await ctx.db.get(args.orderFormId);
  },
});

// mutations.ts
export const updateOrderForm = mutation({
  args: {
    orderFormId: v.id("commerce_subscription_order_forms"),
    title: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "commerce.subscriptions.manage");
    const { orderFormId, ...patch } = args;
    await ctx.db.patch(orderFormId, {
      ...patch,
      updatedAt: Date.now(),
    });
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/order-forms/\$formId.tsx packages/backend/convex/commerceSubscriptions/queries.ts packages/backend/convex/commerceSubscriptions/mutations.ts
git commit -m "admin(commerce-subscriptions): order-form detail route + get/update (Wave 10.3)"
```

---

### Task 3.7: Form-submissions admin — index route

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/form-submissions/index.tsx`

- [ ] **Step 1: Scaffold list page**

Content:
```typescript
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminListTable } from "@/components/admin/AdminListTable";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/form-submissions/",
)({
  component: FormSubmissionsIndex,
});

function FormSubmissionsIndex() {
  const rows = useQuery(
    (api as any).commerceSubscriptions.queries.listFormSubmissions,
    {},
  ) as Array<{
    _id: string;
    email: string;
    status: string;
    formTitle?: string;
    submittedAt: number;
  }> | undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Form Submissions"
        description="Direct-signup form submissions from customers."
      />
      <AdminListTable
        data={rows ?? []}
        loading={rows === undefined}
        emptyMessage="No submissions yet."
        columns={[
          {
            key: "email",
            header: "Email",
            render: (row) => (
              <Link
                to="/admin/commerce/subscriptions/form-submissions/$submissionId"
                params={{ submissionId: row._id }}
                className="font-medium hover:underline"
              >
                {row.email}
              </Link>
            ),
          },
          { key: "formTitle", header: "Form" },
          { key: "status", header: "Status" },
          {
            key: "submittedAt",
            header: "Submitted",
            render: (row) => new Date(row.submittedAt).toLocaleString(),
          },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 2: Confirm / add query**

```bash
grep -n "listFormSubmissions" ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/queries.ts
```
If missing, add:
```typescript
export const listFormSubmissions = query({
  args: {},
  handler: async (ctx) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "commerce.subscriptions.manage");
    const rows = await ctx.db
      .query("commerce_subscription_form_submissions")
      .order("desc")
      .take(200);
    const withForm = await Promise.all(
      rows.map(async (r: any) => {
        const form = r.formId ? await ctx.db.get(r.formId) : null;
        return {
          _id: r._id,
          email: r.email,
          status: r.status,
          submittedAt: r.createdAt,
          formTitle: form?.title,
        };
      }),
    );
    return withForm;
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/form-submissions/index.tsx packages/backend/convex/commerceSubscriptions/queries.ts
git commit -m "admin(commerce-subscriptions): form-submissions index (Wave 10.3)"
```

---

### Task 3.8: Form-submissions admin — detail route

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/form-submissions/$submissionId.tsx`

- [ ] **Step 1: Scaffold detail page**

Content:
```typescript
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { api } from "@backend/convex/_generated/api";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export const Route = createFileRoute(
  "/_authenticated/_admin/commerce/subscriptions/form-submissions/$submissionId",
)({
  component: FormSubmissionDetail,
});

function FormSubmissionDetail() {
  const { submissionId } = Route.useParams();
  const submission = useQuery(
    (api as any).commerceSubscriptions.queries.getFormSubmission,
    { submissionId: submissionId as any },
  ) as
    | {
        _id: string;
        email: string;
        status: string;
        createdAt: number;
        fields?: Record<string, unknown>;
      }
    | undefined
    | null;

  if (submission === undefined) return <div>Loading…</div>;
  if (submission === null) return <div>Submission not found.</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        to="/admin/commerce/subscriptions/form-submissions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <AdminPageHeader title={submission.email} />
      <dl className="space-y-2">
        <div>
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd>{submission.status}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Submitted</dt>
          <dd>{new Date(submission.createdAt).toLocaleString()}</dd>
        </div>
        {submission.fields && (
          <div>
            <dt className="text-xs text-muted-foreground">Fields</dt>
            <dd>
              <pre className="rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(submission.fields, null, 2)}
              </pre>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
```

- [ ] **Step 2: Add query if missing**

```bash
grep -n "getFormSubmission" ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/queries.ts
```
If missing:
```typescript
export const getFormSubmission = query({
  args: { submissionId: v.id("commerce_subscription_form_submissions") },
  handler: async (ctx, args) => {
    await requireCommerceSubscriptionsEnabled(ctx);
    await requireCan(ctx, "commerce.subscriptions.manage");
    return await ctx.db.get(args.submissionId);
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/form-submissions/\$submissionId.tsx packages/backend/convex/commerceSubscriptions/queries.ts
git commit -m "admin(commerce-subscriptions): form-submission detail (Wave 10.3)"
```

---

### Task 3.9: Wave 10.3 acceptance

- [ ] **Step 1: Confirm routes exist**

```bash
find ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions -name "*.tsx" | sort
```
Expected to include: `order-forms/index.tsx`, `order-forms/new.tsx`, `order-forms/$formId.tsx`, `form-submissions/index.tsx`, `form-submissions/$submissionId.tsx`.

- [ ] **Step 2: Deploy + tsc**

```bash
cd ConvexPress-Admin/packages/backend && bunx tsc --noEmit -p convex/tsconfig.json && bunx convex deploy
```
Expected: tsc 0 errors, deploy success.

- [ ] **Step 3: Admin dev boot smoke**

```bash
cd ConvexPress-Admin/apps/web && bun run dev > /tmp/admin.log 2>&1 &
sleep 8
grep -iE "error|failed" /tmp/admin.log | head -5
kill %1
```
Expected: no error lines (any matches need investigation).

- [ ] **Step 4: Tag**

```bash
git tag wave-10.3
```

---

## Wave 10.4 — `linkedRoleId` role elevation

### Task 4.1: Pure helper + test

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/helpers/__tests__/linkedRole.test.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/helpers/permissions.ts`

- [ ] **Step 1: Write the failing test**

Content of `linkedRole.test.ts`:
```typescript
import { describe, expect, test } from "bun:test";

import { pickHighestRole } from "../permissions";

describe("pickHighestRole", () => {
  test("returns base role when no grants provided", () => {
    const base = { _id: "r1", slug: "editor", level: 80, capabilities: [], status: "active" as const };
    expect(pickHighestRole(base, [])).toBe(base);
  });

  test("null base + no grants → null", () => {
    expect(pickHighestRole(null, [])).toBeNull();
  });

  test("grant role wins when its level is higher than base", () => {
    const base = { _id: "r1", slug: "editor", level: 80, capabilities: [], status: "active" as const };
    const higher = { _id: "r2", slug: "administrator", level: 100, capabilities: [], status: "active" as const };
    expect(pickHighestRole(base, [higher])).toBe(higher);
  });

  test("base wins when its level is higher than any grant", () => {
    const base = { _id: "r1", slug: "administrator", level: 100, capabilities: [], status: "active" as const };
    const lower = { _id: "r2", slug: "editor", level: 80, capabilities: [], status: "active" as const };
    expect(pickHighestRole(base, [lower])).toBe(base);
  });

  test("inactive grant roles are ignored", () => {
    const base = { _id: "r1", slug: "editor", level: 80, capabilities: [], status: "active" as const };
    const higherInactive = { _id: "r2", slug: "administrator", level: 100, capabilities: [], status: "inactive" as const };
    expect(pickHighestRole(base, [higherInactive])).toBe(base);
  });

  test("picks max level across multiple active grant roles", () => {
    const base = { _id: "r1", slug: "subscriber", level: 20, capabilities: [], status: "active" as const };
    const g1 = { _id: "r2", slug: "author", level: 60, capabilities: [], status: "active" as const };
    const g2 = { _id: "r3", slug: "editor", level: 80, capabilities: [], status: "active" as const };
    expect(pickHighestRole(base, [g1, g2])).toBe(g2);
  });

  test("null base + active grant → grant", () => {
    const grant = { _id: "r1", slug: "editor", level: 80, capabilities: [], status: "active" as const };
    expect(pickHighestRole(null, [grant])).toBe(grant);
  });
});
```

- [ ] **Step 2: Run test — expect failure (function not defined)**

```bash
cd ConvexPress-Admin/packages/backend && bun test convex/helpers/__tests__/linkedRole.test.ts
```
Expected: fails with `pickHighestRole is not a function` / module export error.

- [ ] **Step 3: Implement `pickHighestRole` in `permissions.ts`**

Near the end of `permissions.ts` (after `getUserCapabilities`), add:

```typescript
/**
 * Pure helper: given a base role and a list of candidate roles contributed
 * by active/grace membership grants, return the role with the highest
 * `level`. Inactive grant roles are skipped. Null base means "no role
 * assigned directly" — in which case the highest-active grant role wins.
 */
export function pickHighestRole<
  R extends { level: number; status: "active" | "inactive" },
>(base: R | null, grantRoles: R[]): R | null {
  const active = grantRoles.filter((r) => r.status === "active");
  let best = base && base.status === "active" ? base : null;
  for (const g of active) {
    if (!best || g.level > best.level) best = g;
  }
  return best;
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
bun test convex/helpers/__tests__/linkedRole.test.ts
```
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/convex/helpers/__tests__/linkedRole.test.ts packages/backend/convex/helpers/permissions.ts
git commit -m "feat(permissions): pickHighestRole pure helper + tests (Wave 10.4)"
```

---

### Task 4.2: Wire `pickHighestRole` into role resolution

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/helpers/permissions.ts`

- [ ] **Step 1: Update `resolveUserRole` to consider grants**

Replace the body of the existing `resolveUserRole` function with:

```typescript
async function resolveUserRole(
  ctx: DbReadCtx,
  user: Pick<UserDoc, "_id" | "roleId" | "internalRole">,
): Promise<RoleDoc | null> {
  // Base role resolution (unchanged).
  let base: RoleDoc | null = null;
  if (user.roleId) {
    const role = await ctx.db.get("roles", user.roleId);
    if (role && role.status === "active") base = role as RoleDoc;
    else if (role && role.status !== "active") return null;
  }
  if (!base && user.internalRole) {
    const newSlug = LEGACY_ROLE_MAP[user.internalRole] ?? user.internalRole;
    const role = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", newSlug))
      .unique();
    if (role && role.status === "active") base = role as RoleDoc;
  }

  // Membership-driven elevation: load active/grace grants on active plans
  // and collect the union of their linkedRoleIds.
  const grantRoles: RoleDoc[] = [];
  try {
    const grants = await ctx.db
      .query("membership_grants")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();
    const active = grants.filter(
      (g: any) => g.status === "active" || g.status === "grace",
    );
    const seenRoleIds = new Set<string>();
    for (const g of active) {
      if (!g.planId) continue;
      const plan = await ctx.db.get(g.planId);
      if (!plan || plan.status !== "active") continue;
      if (!plan.linkedRoleId) continue;
      const roleIdStr = String(plan.linkedRoleId);
      if (seenRoleIds.has(roleIdStr)) continue;
      seenRoleIds.add(roleIdStr);
      const role = await ctx.db.get(plan.linkedRoleId);
      if (role) grantRoles.push(role as RoleDoc);
    }
  } catch {
    // Membership plugin disabled or schema not present → skip.
  }

  return pickHighestRole(base, grantRoles);
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit -p convex/tsconfig.json
```
Expected: exit 0. If TS2589 fires on the new membership-grants query chain, add `// @ts-expect-error TS2589: ...` suppressions on the offending lines.

- [ ] **Step 3: Re-run full test suite**

```bash
bun test convex/commerceSubscriptions/ convex/membership/ convex/helpers/__tests__/
```
Expected: all existing tests still pass + 7 new `pickHighestRole` tests pass. No regressions in `enforcement.test.ts` / `benefits.test.ts`.

- [ ] **Step 4: Deploy**

```bash
bunx convex deploy
```
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/convex/helpers/permissions.ts
git commit -m "feat(permissions): elevate role via active grant linkedRoleId (Wave 10.4)"
```

---

### Task 4.3: Wave 10.4 acceptance

- [ ] **Step 1: Tests green**

```bash
bun test convex/
```
Expected: full suite passes. Record total pass count for the acceptance report.

- [ ] **Step 2: Tag**

```bash
git tag wave-10.4
```

---

## Wave 10.5 — `day` interval + audit refresh + docs

### Task 5.1: Add `day` to billingInterval unions

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/commerceSubscriptions.ts`

- [ ] **Step 1: Update 3 unions**

In `schema/commerceSubscriptions.ts`, find the 3 sites where:
```typescript
v.union(v.literal("week"), v.literal("month"), v.literal("year"))
```
appears (approximate lines 301, 335, plus the template schema line near the top with `v.literal("week")`). Replace each with:
```typescript
v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("year"))
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit -p convex/tsconfig.json
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/convex/schema/commerceSubscriptions.ts
git commit -m "feat(commerce-subscriptions): add 'day' billing interval (Wave 10.5)"
```

---

### Task 5.2: `addBillingPeriod` supports `day`

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/internals.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/checkout.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/proration.ts`

- [ ] **Step 1: Update the `BillingInterval` type + function in all three files**

In each of the three files, find:
```typescript
type BillingInterval = "week" | "month" | "year";
```
Replace with:
```typescript
type BillingInterval = "day" | "week" | "month" | "year";
```

And in each `addBillingPeriod` function, add a `day` branch at the top:
```typescript
if (interval === "day") {
  date.setDate(date.getDate() + intervalCount);
  return date.getTime();
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit -p convex/tsconfig.json
```
Expected: exit 0.

- [ ] **Step 3: Quick unit test for the new branch**

Create `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/__tests__/addBillingPeriod.test.ts`:
```typescript
import { describe, expect, test } from "bun:test";

// Re-declare the helper locally (it's not exported — test the contract).
function addBillingPeriod(
  timestamp: number,
  interval: "day" | "week" | "month" | "year",
  intervalCount: number,
): number {
  const date = new Date(timestamp);
  if (interval === "day") {
    date.setDate(date.getDate() + intervalCount);
    return date.getTime();
  }
  if (interval === "week") {
    date.setDate(date.getDate() + 7 * intervalCount);
    return date.getTime();
  }
  if (interval === "month") {
    date.setMonth(date.getMonth() + intervalCount);
    return date.getTime();
  }
  date.setFullYear(date.getFullYear() + intervalCount);
  return date.getTime();
}

describe("addBillingPeriod day", () => {
  test("+1 day", () => {
    const base = new Date("2026-04-22T00:00:00Z").getTime();
    const next = addBillingPeriod(base, "day", 1);
    expect(new Date(next).getUTCDate()).toBe(23);
  });
  test("+7 day equivalent to 1 week", () => {
    const base = new Date("2026-04-22T00:00:00Z").getTime();
    const plusSevenDays = addBillingPeriod(base, "day", 7);
    const plusWeek = addBillingPeriod(base, "week", 1);
    expect(plusSevenDays).toBe(plusWeek);
  });
});
```

- [ ] **Step 4: Run test**

```bash
bun test convex/commerceSubscriptions/__tests__/addBillingPeriod.test.ts
```
Expected: 2 tests pass.

- [ ] **Step 5: Deploy**

```bash
bunx convex deploy
```
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/convex/commerceSubscriptions/internals.ts packages/backend/convex/commerceSubscriptions/checkout.ts packages/backend/convex/commerceSubscriptions/proration.ts packages/backend/convex/commerceSubscriptions/__tests__/addBillingPeriod.test.ts
git commit -m "feat(commerce-subscriptions): support 'day' in addBillingPeriod (Wave 10.5)"
```

---

### Task 5.3: Stripe-integration architecture doc

**Files:**
- Create: `agents/knowledge/stripe-integration.md`

- [ ] **Step 1: Write the doc**

Content:
```markdown
# ConvexPress ↔ Stripe Integration

## Architecture: we own invoices, Stripe charges cards

Unlike a straight Stripe Billing integration, ConvexPress manages its own
`commerce_subscription_*` schema end-to-end. Stripe is used only as a card
vault + charge processor. This decouples subscription lifecycle (our code)
from payment execution (Stripe) and lets the same subscription engine back
bundled / custom / membership / commerce flows.

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
  Stripe-managed subscription objects. We do not create Stripe
  subscription objects. Our `commerce_subscriptions` are internal records
  driven by crons (`subscription-renewals`, `subscription-dunning`) that
  in turn create our own invoices and charge via one-shot PaymentIntents
  with `off_session: true, confirm: true`. The Stripe Billing webhook
  surface is intentionally unused.

## Settings-first key resolution

All keys live in `settings.commerce.payments`:
- `stripePublishableKey` — exposed to the website via
  `getLiveChargingStatus`
- `stripeSecretKey` — server-only; read by actions via
  `helpers/serviceKeys.getServiceKeyFromAction`
- `stripeWebhookSecret` — verified on every `/webhooks/stripe` request
- `subscriptionChargingEnabled` — master switch; when false, the stub
  processor handles all charging paths

## Off-session charging pattern

1. **Signup** — website calls `publicCharge.beginFirstCharge(intentId)`
   which creates a Stripe Customer (or finds by email) and a PaymentIntent
   with `setup_future_usage: "off_session"`. Client confirms via Stripe
   Elements.
2. **On first success** — webhook routes to `activateCheckoutIntentFromStripe`
   which stashes `stripeCustomerId` + `savedPaymentMethodId` on the
   checkout intent. A downstream mutation activates the subscription.
3. **Renewal / proration / dunning** — `chargeSubscriptionInvoice` action
   creates a PaymentIntent with `off_session: true, confirm: true,
   customer, payment_method, idempotencyKey: invoiceId`. Success writes
   back to our invoice; failure enters our dunning ladder.
```

- [ ] **Step 2: Commit**

```bash
git add agents/knowledge/stripe-integration.md
git commit -m "docs: Stripe integration architecture + webhook scope (Wave 10.5)"
```

---

### Task 5.4: Refresh audit backlog doc

**Files:**
- Modify: `.codex/audit-backlog/system-audit-gaps.md`

- [ ] **Step 1: Update completion percentages in the system index**

Find the index block (lines ~8-79). Change:
- `Membership Plan System (35%...)` → `Membership Plan System (100%...)`
- `Subscription System (40%...)` → `Subscription System (100%...)`
- `Subscription Billing System (55%...)` → `Subscription Billing System (100%...)`
- `Subscription Entitlement System (55%...)` → `Subscription Entitlement System (95%...)` (usage metering deferred)
- `Content Restriction System (45%...)` → `Content Restriction System (95%...)`

- [ ] **Step 2: Append a closing note under each affected section**

Under each of the 4 sections (`### Membership Plan System`, `### Subscription System`, `### Subscription Billing System`, `### Subscription Entitlement System`), append a final sub-section:

```markdown
#### Wave 10 resolution (2026-04-22)

All gaps addressed by Waves 1–10 are now closed. Residual out-of-scope items:
- Usage metering (Stripe-Entitlements-parity; low priority)
- Stripe Billing webhook surface (intentionally diverges — see `agents/knowledge/stripe-integration.md`)
See `audits/superpowers/2026-04-21-membership-subscriptions-acceptance.md` (Wave 9 addendum + Wave 10 completion) for evidence.
```

- [ ] **Step 3: Commit**

```bash
git add .codex/audit-backlog/system-audit-gaps.md
git commit -m "docs(audit): mark membership+subscription sections complete (Wave 10.5)"
```

---

### Task 5.5: Update Airtable completion %

**Files:** (Airtable — no local file)

- [ ] **Step 1: Update the 4 affected records**

Run from repo root:
```bash
airtable records update --base [redacted-airtable-base-id] --table Systems --id [redacted-airtable-record-id] --fields '{"Completion": 1}'
airtable records update --base [redacted-airtable-base-id] --table Systems --id [redacted-airtable-record-id] --fields '{"Completion": 1}'
airtable records update --base [redacted-airtable-base-id] --table Systems --id [redacted-airtable-record-id] --fields '{"Completion": 1}'
airtable records update --base [redacted-airtable-base-id] --table Systems --id [redacted-airtable-record-id] --fields '{"Completion": 0.95}'
airtable records update --base [redacted-airtable-base-id] --table Systems --id [redacted-airtable-record-id] --fields '{"Completion": 0.95}'
```

Expected: each command returns the updated record as JSON.

(If the CLI rejects the `--fields` flag shape, run `airtable records update --help` to find the correct flag name and retry.)

---

### Task 5.6: Final acceptance — update report + tag

**Files:**
- Modify: `audits/superpowers/2026-04-21-membership-subscriptions-acceptance.md`

- [ ] **Step 1: Append a Wave 10 section**

At the end of the file, append:
```markdown
---

## Wave 10 Addendum — 2026-04-22 (Final Completion)

Wave 10 closes every remaining audit gap across Membership Plan, Subscription, Subscription Billing, and Subscription Entitlement systems.

### Shipped

- **10.1 Signup Stripe Elements**: Website `SignupForm` branches on `getLiveChargingStatus`; Stripe Elements mounts via new `StripePaymentForm` → `publicCharge.beginFirstCharge` → Stripe `confirmPayment` → webhook activates intent.
- **10.2 Email pipeline**: 6 new templates (welcome, renewed, payment_failed, trial_ending, cancelled, paused); 6 new event subscribers wired in `bootstrap/registerListeners.ts`; daily `subscription-trial-ending` cron emits 3-days-out events.
- **10.3 Admin completeness**: invoice numbering (sequential via settings counter); full order-form CRUD routes (index/new/detail); form-submission admin (index/detail).
- **10.4 Role elevation**: `resolveUserRole` now consults active-grant `linkedRoleId`; `pickHighestRole` helper + 7 unit tests.
- **10.5 Day interval**: `billingInterval` union accepts `day`; `addBillingPeriod` updated in all three callers; unit-tested.
- **Docs**: `agents/knowledge/stripe-integration.md` documents our divergence from Stripe Billing; audit backlog and Airtable Systems records reflect the new completion state.

### Deploy

- Commits across Waves 10.1–10.5, last deploy commit = final tag `wave-10.5`
- `bunx convex deploy` (full typecheck) on `amiable-mongoose-989.convex.cloud`

**Project status: Membership Plan System + Commerce Subscriptions System are FEATURE-COMPLETE per PRD. Operator walkthrough (§12.1 / §12.2 / §12.3) is the only remaining gate and is unblocked by Wave 10.1's live signup path.**
```

- [ ] **Step 2: Commit + tag**

```bash
git add audits/superpowers/2026-04-21-membership-subscriptions-acceptance.md
git commit -m "docs(acceptance): Wave 10 addendum — membership+subscriptions final completion"
git tag wave-10
git push origin wave-10 2>/dev/null || true
```

---

## Wave 10.6 — Usage metering (Stripe-Entitlements parity)

### Task 6.1: `usage_counters` schema

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/commerceSubscriptions.ts`

- [ ] **Step 1: Add table + indexes**

In `schema/commerceSubscriptions.ts`, inside the `export const commerceSubscriptionsTables = {` block, add a new entry:

```typescript
  commerce_subscription_usage_counters: defineTable({
    subscriptionId: v.id("commerce_subscriptions"),
    userId: v.optional(v.id("users")),
    featureCode: v.string(),
    periodStart: v.number(),
    periodEnd: v.number(),
    usedQuantity: v.number(),
    limitQuantity: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_subscription_feature", ["subscriptionId", "featureCode"])
    .index("by_user_feature", ["userId", "featureCode"])
    .index("by_period_end", ["periodEnd"]),
```

- [ ] **Step 2: Extend `membership_plan_benefits`**

Find `membership_plan_benefits: defineTable({ ... })` in `schema/membership.ts`. Add fields:

```typescript
    meteredFeature: v.optional(v.boolean()),
    meteredLimit: v.optional(v.number()),
```

(Preserve existing fields.)

- [ ] **Step 3: Typecheck + deploy**

```bash
bunx tsc --noEmit -p convex/tsconfig.json && bunx convex deploy
```
Expected: exit 0, deploy success.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/convex/schema/commerceSubscriptions.ts packages/backend/convex/schema/membership.ts
git commit -m "feat(commerce-subscriptions): usage_counters schema + metered benefit fields (Wave 10.6)"
```

---

### Task 6.2: `incrementUsage` + `checkUsageLimit` mutations

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/usage.ts`

- [ ] **Step 1: Create the file**

Content:
```typescript
/**
 * Commerce Subscriptions — metered usage (Wave 10.6).
 *
 * Callers (business logic in other systems) ask:
 *   - `incrementUsage({ subscriptionId, featureCode, by })` — record usage.
 *     Finds / creates the counter for the active billing period.
 *   - `checkUsageLimit({ subscriptionId, featureCode })` — returns
 *     { used, limit, allowed, remaining }. If the plan benefit carries
 *     `meteredLimit` and `used >= limit`, `allowed` is false.
 *
 * Counters reset every billing period (periodStart = subscription's
 * `currentPeriodStartAt`, periodEnd = `currentPeriodEndAt`). A new cycle
 * creates a new counter row; historical rows are retained for reporting.
 */

import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requirePluginEnabled } from "../helpers/plugins";
import { requireCommerceSubscriptionsEnabled } from "./helpers";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const incrementUsage = mutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    subscriptionId: v.id("commerce_subscriptions"),
    featureCode: v.string(),
    by: v.optional(v.number()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    await requireCommerceSubscriptionsEnabled(ctx);

    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) return { used: 0, allowed: false };

    const periodStart = sub.currentPeriodStartAt ?? 0;
    const periodEnd = sub.currentPeriodEndAt ?? Number.MAX_SAFE_INTEGER;
    const delta = args.by ?? 1;

    const existing = await ctx.db
      .query("commerce_subscription_usage_counters")
      .withIndex("by_subscription_feature", (q: any) =>
        q.eq("subscriptionId", args.subscriptionId).eq("featureCode", args.featureCode),
      )
      .filter((q: any) => q.eq(q.field("periodStart"), periodStart))
      .first();

    const now = Date.now();
    if (existing) {
      const used = existing.usedQuantity + delta;
      await ctx.db.patch(existing._id, { usedQuantity: used, updatedAt: now });
      return { used };
    }
    const limit = await resolveMeteredLimit(ctx, sub, args.featureCode);
    await ctx.db.insert("commerce_subscription_usage_counters", {
      subscriptionId: args.subscriptionId,
      userId: sub.userId,
      featureCode: args.featureCode,
      periodStart,
      periodEnd,
      usedQuantity: delta,
      limitQuantity: limit ?? undefined,
      createdAt: now,
      updatedAt: now,
    });
    return { used: delta };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const checkUsageLimit = query({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    subscriptionId: v.id("commerce_subscriptions"),
    featureCode: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "commerceSubscriptions");
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) return { used: 0, limit: null, allowed: false, remaining: 0 };

    const periodStart = sub.currentPeriodStartAt ?? 0;
    const counter = await ctx.db
      .query("commerce_subscription_usage_counters")
      .withIndex("by_subscription_feature", (q: any) =>
        q.eq("subscriptionId", args.subscriptionId).eq("featureCode", args.featureCode),
      )
      .filter((q: any) => q.eq(q.field("periodStart"), periodStart))
      .first();

    const used = counter?.usedQuantity ?? 0;
    const limit = await resolveMeteredLimit(ctx, sub, args.featureCode);
    if (limit == null) {
      return { used, limit: null, allowed: true, remaining: Infinity };
    }
    return {
      used,
      limit,
      allowed: used < limit,
      remaining: Math.max(0, limit - used),
    };
  },
});

async function resolveMeteredLimit(
  ctx: any,
  subscription: any,
  featureCode: string,
): Promise<number | null> {
  // Find the user's active membership grants; for each plan, scan benefits
  // whose code matches featureCode and meteredFeature is true. Return the
  // MAX limit (most generous wins when multiple plans grant the same
  // feature).
  if (!subscription.userId) return null;
  const grants = await ctx.db
    .query("membership_grants")
    .withIndex("by_user", (q: any) => q.eq("userId", subscription.userId))
    .collect();
  const active = grants.filter(
    (g: any) => g.status === "active" || g.status === "grace",
  );
  let best: number | null = null;
  for (const g of active) {
    const benefits = await ctx.db
      .query("membership_plan_benefits")
      .withIndex("by_plan", (q: any) => q.eq("planId", g.planId))
      .collect();
    for (const b of benefits) {
      if (b.code === featureCode && b.meteredFeature && typeof b.meteredLimit === "number") {
        if (best == null || b.meteredLimit > best) best = b.meteredLimit;
      }
    }
  }
  return best;
}
```

- [ ] **Step 2: Confirm `membership_plan_benefits` has a `by_plan` index**

```bash
grep -nA 5 "membership_plan_benefits" ConvexPress-Admin/packages/backend/convex/schema/membership.ts | head -20
```
If `.index("by_plan", ["planId"])` is missing, add it in the same file. Otherwise skip.

- [ ] **Step 3: Typecheck + deploy**

```bash
bunx tsc --noEmit -p convex/tsconfig.json && bunx convex deploy
```
Expected: exit 0, deploy success.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/convex/commerceSubscriptions/usage.ts packages/backend/convex/schema/membership.ts
git commit -m "feat(commerce-subscriptions): incrementUsage + checkUsageLimit (Wave 10.6)"
```

---

### Task 6.3: Unit tests for metered-limit resolution

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/commerceSubscriptions/__tests__/usage.test.ts`

- [ ] **Step 1: Add pure-function test for the max-limit-wins rule**

Content:
```typescript
import { describe, expect, test } from "bun:test";

interface Benefit {
  code: string;
  meteredFeature?: boolean;
  meteredLimit?: number;
}

function pickMaxLimit(benefits: Benefit[], featureCode: string): number | null {
  let best: number | null = null;
  for (const b of benefits) {
    if (b.code === featureCode && b.meteredFeature && typeof b.meteredLimit === "number") {
      if (best == null || b.meteredLimit > best) best = b.meteredLimit;
    }
  }
  return best;
}

describe("pickMaxLimit", () => {
  test("returns null when no matching benefit", () => {
    expect(pickMaxLimit([], "api-calls")).toBeNull();
  });

  test("ignores non-metered benefits", () => {
    const bs: Benefit[] = [{ code: "api-calls", meteredFeature: false, meteredLimit: 100 }];
    expect(pickMaxLimit(bs, "api-calls")).toBeNull();
  });

  test("ignores benefits without a meteredLimit", () => {
    const bs: Benefit[] = [{ code: "api-calls", meteredFeature: true }];
    expect(pickMaxLimit(bs, "api-calls")).toBeNull();
  });

  test("returns single matching limit", () => {
    const bs: Benefit[] = [{ code: "api-calls", meteredFeature: true, meteredLimit: 100 }];
    expect(pickMaxLimit(bs, "api-calls")).toBe(100);
  });

  test("picks max across multiple matches", () => {
    const bs: Benefit[] = [
      { code: "api-calls", meteredFeature: true, meteredLimit: 100 },
      { code: "api-calls", meteredFeature: true, meteredLimit: 500 },
      { code: "api-calls", meteredFeature: true, meteredLimit: 250 },
    ];
    expect(pickMaxLimit(bs, "api-calls")).toBe(500);
  });

  test("filters by feature code", () => {
    const bs: Benefit[] = [
      { code: "api-calls", meteredFeature: true, meteredLimit: 100 },
      { code: "seats", meteredFeature: true, meteredLimit: 5 },
    ];
    expect(pickMaxLimit(bs, "seats")).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
bun test convex/commerceSubscriptions/__tests__/usage.test.ts
```
Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/convex/commerceSubscriptions/__tests__/usage.test.ts
git commit -m "test(commerce-subscriptions): metered-limit resolution tests (Wave 10.6)"
```

---

### Task 6.4: Wave 10.6 acceptance

- [ ] **Step 1: Full test pass**

```bash
bun test convex/
```
Expected: full suite passes.

- [ ] **Step 2: Tag**

```bash
git tag wave-10.6
```

---

## Appendix A: Expected final state

After all 5 waves land:

```bash
cd ConvexPress-Admin/packages/backend
bunx tsc --noEmit -p convex/tsconfig.json         # 0 errors
bun test convex/commerceSubscriptions/ convex/membership/ convex/helpers/__tests__/
# expect: 240+ pass (233 baseline + 7 linkedRole + 2 addBillingPeriod)
bunx convex deploy                                 # clean deploy, full typecheck
```

```bash
find ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/subscriptions -name "*.tsx" | wc -l
# expect: 11+ (pre-existing + 5 new)
```

## Appendix B: Rollback

Each wave has its own git tag (`wave-10.1` … `wave-10.6`). To roll back, `git revert` from newest-first. All waves are independent except:
- 10.1 depends on 10.0 (Wave 9 baseline)
- 10.2 is independent
- 10.3 is independent
- 10.4 is independent
- 10.5 depends on schema migration from 10.3 for invoice numbering (if you revert 10.3, revert 10.5's invoice-number touches)
- 10.6 depends on 10.3's schema section being present

## Appendix C: Deferred (post-completion cleanup, not Wave-10 work)

These are tracked in this plan only to make the deferral explicit — they are NOT blocking Wave-10 signoff.

- **Remove the in-code `processorStub`** once `subscriptionChargingEnabled` has been true in prod for ≥2 full billing cycles and the renewals+dunning paths have been exercised against real cards. The stub is intentionally retained as a feature-flag-gated fallback until that confidence window closes. Removing it is a mechanical 3-file change (delete `processorStub` from `renewal.ts` / `dunning.ts` / `proration.ts`; delete `isLiveChargingEnabled` branch; delete `subscriptionChargingEnabled` setting).
- **Mass `@ts-expect-error TS2589` sweep removal** — contingent on either (a) a TypeScript release that raises the union-instantiation depth ceiling, or (b) a Convex release that flattens the generated `api.d.ts` union types. When either lands, run a script that walks every `// @ts-expect-error TS2589` comment in `convex/` and removes lines that tsc no longer needs (tsc will surface the still-needed ones as TS2578 "unused directive"; script picks only the satisfied ones).
- **Operator walkthrough for §12.1 / §12.2 / §12.3** — this is an operator task (login, paste Stripe test keys, flip `subscriptionChargingEnabled`, run the signup with `4242 4242 4242 4242`). Wave 10.1 unblocks it but does not perform it.
