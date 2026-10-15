import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mock } from "bun:test";

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://example.org/signup/offer_1" });
const assigned = [];
mock.module("@/lib/browser/navigate", () => ({ goTo: (url) => assigned.push(url) }));
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { getFunctionName } = await import("convex/server");
const { ConvexError } = await import("convex/values");
const { createElement, act } = await import("react");

const calls = [];
let checkoutError = null;
mock.module("@/lib/auth/clerk", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  useUser: () => ({ isLoaded: true, user: null }),
  useClerk: () => ({ signOut: async () => {} }),
  useSignIn: () => ({ isLoaded: false }),
  useSignUp: () => ({ isLoaded: false }),
  clerkErrorCode: () => undefined,
  clerkErrorMessage: (_error, fallback) => fallback,
}));
mock.module("@/hooks/useEnsureCustomerAccount", () => ({ useEnsureCustomerAccount: () => ({ status: "ready" }) }));
mock.module("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ user: { email: "casey@example.invalid" }, isLoading: false }) }));
mock.module("@/hooks/useDashboardConfig", () => ({ useDashboardPath: () => ({ basePath: "/account", to: (path = "") => `/account${path}` }) }));
mock.module("@/extensions/forms/payment/FormStripePaymentForm", () => ({
  FormStripePaymentForm: (props) =>
    createElement("button", { type: "button", "data-testid": "pay", "data-return": props.returnUrl, onClick: () => props.onConfirmed({}) }, props.submitLabel),
}));
const summary = {
  planTitle: "Growth", billingInterval: "month", billingIntervalCount: 1, recurringAmount: 29_900, setupFeeAmount: 0, trialDays: 0,
  couponCode: "SAVE20", firstChargeDiscount: 5_980, nextChargeAt: Date.UTC(2026, 10, 14, 12),
};
mock.module("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
  useQuery: (ref) => {
    const name = getFunctionName(ref);
    if (name.endsWith("getLiveChargingStatus")) return { live: true, publishableKey: "pk_test_signup" };
    if (name.endsWith("getMyCheckout")) return { status: "pending", amount: 23_920, recurringAmount: 29_900, currency: "USD", summary };
    return undefined;
  },
  useMutation: (ref) => async (args) => {
    const name = getFunctionName(ref);
    calls.push([name, args]);
    if (name.endsWith("createCheckoutIntent")) {
      if (checkoutError) throw checkoutError;
      if (args.couponCode === "BAD") throw new ConvexError({ code: "COUPON_INVALID", message: "That code isn't valid." });
      return { intentId: "intent_1", amount: 23_920, recurringAmount: 29_900, currency: "USD" };
    }
    return null;
  },
  useAction: (ref) => async (args) => {
    const name = getFunctionName(ref);
    calls.push([name, args]);
    if (name.endsWith("beginFirstCharge")) return { clientSecret: "pi_1_secret_x", mode: "payment", paymentIntentId: "pi_1", amount: 23_920, currency: "usd", stripeCustomerId: "cus_1" };
    if (name.endsWith("confirmFirstCharge")) return { status: "active", contractId: "contract_1" };
    return null;
  },
}));

const { createRoot } = await import("react-dom/client");
const { fireEvent } = await import("@testing-library/dom");
const { SignupForm } = await import("./SignupForm.tsx");

const offer = { _id: "offer_1", title: "Growth", recurringAmount: 29_900, currencyCode: "USD", template: { billingInterval: "month", billingIntervalCount: 1 } };
const text = () => document.body.textContent.replace(/\s+/g, " ");
const button = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(label));
const settle = async () => {
  for (let i = 0; i < 5; i++) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
};
let checks = 0;

async function mount() {
  const root = createRoot(document.querySelector("#root"));
  await act(async () => root.render(createElement(SignupForm, { offer })));
  await settle();
  return root;
}

// 1. Signed in: the plan, who is subscribing, a refused coupon said inline, then pay and land on the account page.
{
  const root = await mount();
  assert.ok(text().includes("Subscribing as casey@example.invalid"), text());
  assert.ok(text().includes("$299.00per month"), text());
  await act(async () => button("Have a coupon code?").click());
  const coupon = document.querySelector("#signup-coupon");
  await act(async () => fireEvent.change(coupon, { target: { value: "BAD" } }));
  await act(async () => button("Continue to payment").click());
  await settle();
  assert.ok(text().includes("That code isn't valid."), text());
  assert.equal(document.querySelector("#signup-coupon").getAttribute("aria-invalid"), "true");
  await act(async () => fireEvent.change(document.querySelector("#signup-coupon"), { target: { value: "SAVE20" } }));
  await act(async () => button("Continue to payment").click());
  await settle();
  assert.ok(text().includes("Due today$239.20"), text());
  assert.ok(text().includes("Coupon SAVE20"), text());
  const pay = document.querySelector('[data-testid="pay"]');
  assert.equal(pay.textContent, "Pay $239.20 and subscribe");
  assert.equal(pay.getAttribute("data-return"), "/signup/offer_1?subscription_return=intent_1");
  await act(async () => pay.click());
  await settle();
  const confirm = calls.find(([name]) => name.endsWith("confirmFirstCharge"));
  assert.deepEqual(confirm?.[1], { checkoutIntentId: "intent_1", clientSecret: "pi_1_secret_x", paymentIntentId: "pi_1" });
  assert.deepEqual(assigned, ["/account/subscriptions?welcome=1"]);
  await act(async () => root.unmount());
  checks++;
}

// 2. Already subscribed: nothing is charged; the page says so and links to the account.
{
  checkoutError = new ConvexError({ code: "ALREADY_SUBSCRIBED", message: "You already have an active subscription." });
  calls.length = 0;
  const root = await mount();
  await act(async () => button("Continue to payment").click());
  await settle();
  assert.ok(text().includes("You already have a subscription that includes this plan"), text());
  assert.equal(document.querySelector('a[href="/account/subscriptions"]')?.textContent, "Manage my subscription");
  assert.equal(calls.some(([name]) => name.endsWith("beginFirstCharge")), false);
  checkoutError = null;
  await act(async () => root.unmount());
  checks++;
}

// 3. Back from a Stripe redirect: confirm what Stripe returned, then finish.
{
  calls.length = 0;
  assigned.length = 0;
  dom.window.history.replaceState(null, "", "/signup/offer_1?subscription_return=intent_9&payment_intent=pi_9&payment_intent_client_secret=pi_9_secret_y");
  const root = await mount();
  const confirm = calls.find(([name]) => name.endsWith("confirmFirstCharge"));
  assert.deepEqual(confirm?.[1], { checkoutIntentId: "intent_9", clientSecret: "pi_9_secret_y", paymentIntentId: "pi_9" });
  assert.deepEqual(assigned, ["/account/subscriptions?welcome=1"]);
  assert.equal(dom.window.location.search, "", "the return parameters are cleared");
  await act(async () => root.unmount());
  checks++;
}

dom.window.close();
console.log(JSON.stringify({ passed: true, checks }));
