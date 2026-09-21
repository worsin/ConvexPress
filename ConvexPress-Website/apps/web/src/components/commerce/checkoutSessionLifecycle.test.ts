import { expect, test } from "bun:test";
import { needsNewCheckoutSession } from "./checkoutSessionLifecycle";
test("a second checkout starts a new session after the earlier checkout closed", () => {
 for (const status of ["completed", "failed", "abandoned"]) expect(needsNewCheckoutSession({status})).toBe(true);
 expect(needsNewCheckoutSession(null)).toBe(true);
});
test("loading and an active checkout do not create competing sessions", () => {
 expect(needsNewCheckoutSession(undefined)).toBe(false);
 for (const status of ["draft", "collecting_shipping", "payment_pending"]) expect(needsNewCheckoutSession({status})).toBe(false);
});
