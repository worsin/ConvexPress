import { mock } from "bun:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

const noop = () => async () => null;
const convex = await import("convex/react");
mock.module("convex/react", () => ({ ...convex, useMutation: noop, useAction: noop, useQuery: () => undefined }));
const router = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({
  ...router,
  Link: ({ to, children, ...props }) => createElement("a", { ...props, href: typeof to === "string" ? to : "#" }, children),
}));

const DAY = 24 * 60 * 60 * 1000;
const at = Date.UTC(2026, 10, 14, 12);
const contract = (overrides = {}) => ({
  _id: "contract_1",
  status: "active",
  currencyCode: "USD",
  recurringAmount: 59_900,
  billingInterval: "month",
  billingIntervalCount: 1,
  currentPeriodStartAt: at - 30 * DAY,
  currentPeriodEndAt: at,
  nextBillingAt: at,
  nextChargeAt: at,
  nextChargeAmount: 51_410,
  discounts: [
    { code: "TEN", discountType: "percent", amount: 10, remainingCharges: null },
    { code: "OFF25", discountType: "fixed", amount: 2_500, remainingCharges: 2 },
  ],
  createdAt: at - 60 * DAY,
  offer: { _id: "offer_1", title: "Growth", slug: "growth", recurringAmount: 59_900, currencyCode: "USD", features: [] },
  scheduledOffer: null,
  product: null,
  currentInvoice: { _id: "inv_1", invoiceNumber: "INV-000042", status: "paid", totalAmount: 51_410, currencyCode: "USD", createdAt: at - 30 * DAY },
  paymentMethod: { brand: "visa", last4: "4242", expMonth: 4, expYear: 2030 },
  billingIssue: null,
  actions: { pause: true, resume: false, keep: false, scheduleCancel: true, cancelNow: false, changePlan: true, applyCoupon: true, updatePaymentMethod: true },
  membershipGrants: [{ _id: "grant_1", planId: "plan_1", plan: { _id: "plan_1", name: "Doctor Portal", slug: "portal" }, status: "grace", startsAt: 0, graceEndsAt: at }],
  entitlements: [],
  ...overrides,
});

function text(element) {
  const dom = new JSDOM(renderToStaticMarkup(element));
  try {
    return dom.window.document.body.textContent.replace(/\s+/g, " ");
  } finally {
    dom.window.close();
  }
}

let cases = 0;
const { CustomerPortalCard } = await import("./CustomerPortalCard.tsx");

const active = text(createElement(CustomerPortalCard, { contract: contract() }));
assert.ok(active.includes("Plan$599.00 per month"), active);
assert.ok(active.includes("Next charge$514.10on Nov 14, 2026, with your discount"), active);
assert.ok(active.includes("TEN: 10% off every charge"), active);
assert.ok(active.includes("OFF25: $25.00 off your next 2 charges"), active);
assert.ok(active.includes("Grace period until Nov 14, 2026"), active);
assert.ok(active.includes("Last invoice INV-000042 · $514.10 · Paid"), active);
assert.ok(!active.includes("Included access"), active);
cases++;

const trial = text(createElement(CustomerPortalCard, { contract: contract({ status: "trialing", trialEndsAt: at, discounts: [], nextChargeAmount: 59_900 }) }));
assert.ok(trial.includes("First charge$599.00on Nov 14, 2026"), trial);
assert.ok(trial.includes("Your free trial ends Nov 14, 2026. Your first charge of $599.00 is that day"), trial);
assert.ok(!trial.includes("with your discount"), trial);
cases++;

const pastDue = text(
  createElement(CustomerPortalCard, {
    contract: contract({
      status: "past_due",
      nextChargeAt: undefined,
      billingIssue: { failedAttempts: 1, nextRetryAt: at + DAY, accessEndsAt: at + 7 * DAY, amountDue: 59_900, currencyCode: "USD" },
    }),
  }),
);
assert.ok(pastDue.includes("Payment due$599.00Next try Nov 15, 2026"), pastDue);
cases++;

const ending = text(createElement(CustomerPortalCard, { contract: contract({ status: "pending_cancel", nextChargeAt: undefined }) }));
assert.ok(ending.includes("Access untilNov 14, 2026No further charges"), ending);
cases++;

for (const pack of ["core", "journal", "depot", "aster-house"]) {
  const { default: Surface } = await import(`../../templates/packs/${pack}/surfaces/dashboard.subscription.tsx`);
  const detail = { ...contract(), invoices: [], history: [] };
  const page = text(createElement(Surface, { data: { subscriptionId: "contract_1", subscription: detail, hrefs: { subscriptions: "/dashboard/subscriptions" } } }));
  assert.ok(page.includes("$599.00 per month"), `${pack}: ${page.slice(0, 400)}`);
  assert.ok(page.includes("$514.10 on Nov 14, 2026"), `${pack}: ${page.slice(0, 400)}`);
  assert.ok(page.includes("TEN: 10% off every charge"), `${pack}: ${page.slice(0, 400)}`);
  cases++;
}

console.log(JSON.stringify({ passed: true, cases }));
