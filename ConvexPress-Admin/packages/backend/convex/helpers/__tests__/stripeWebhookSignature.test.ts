import { describe, expect, test } from "bun:test";
import Stripe from "stripe";

import { StripeSignatureError, verifyStripeWebhook } from "../stripeWebhookSignature";

const SECRET = "whsec_test_signing_secret_value";
const stripe = new Stripe("sk_test_unused_by_signature_helpers");
const event = {
  id: "evt_test_1",
  object: "event",
  type: "payment_intent.succeeded",
  data: { object: { id: "pi_test_1", object: "payment_intent", amount: 29900, currency: "usd" } },
};
const payload = JSON.stringify(event);
// Signed by Stripe's own SDK, so the helper is checked against Stripe, not itself.
const sign = (body: string, options: { secret?: string; timestamp?: number } = {}) =>
  stripe.webhooks.generateTestHeaderStringAsync({ payload: body, secret: options.secret ?? SECRET, timestamp: options.timestamp });

describe("Stripe webhook signatures in the V8 runtime", () => {
  test("accepts a delivery signed the way Stripe's SDK signs it", async () => {
    const verified = await verifyStripeWebhook(payload, await sign(payload), SECRET);
    expect(verified.id).toBe("evt_test_1");
    expect(verified.type).toBe("payment_intent.succeeded");
  });

  test("accepts any matching v1 signature (secret rotation)", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const current = await sign(payload, { timestamp });
    const rotated = await sign(payload, { timestamp, secret: "whsec_previous_secret" });
    const header = `${current},${rotated.split(",").find((part) => part.startsWith("v1="))}`;
    await expect(verifyStripeWebhook(payload, header, SECRET)).resolves.toMatchObject({ id: "evt_test_1" });
  });

  test("refuses tampered bodies, wrong secrets, stale timestamps and malformed headers", async () => {
    const header = await sign(payload);
    const tampered = payload.replace("29900", "1");
    await expect(verifyStripeWebhook(tampered, header, SECRET)).rejects.toBeInstanceOf(StripeSignatureError);
    await expect(verifyStripeWebhook(payload, header, "whsec_other")).rejects.toBeInstanceOf(StripeSignatureError);
    const stale = await sign(payload, { timestamp: Math.floor(Date.now() / 1000) - 3600 });
    await expect(verifyStripeWebhook(payload, stale, SECRET)).rejects.toThrow(/tolerance/);
    for (const bad of ["", "t=abc,v1=00", "v1=" + "a".repeat(64), "t=1700000000"]) {
      await expect(verifyStripeWebhook(payload, bad, SECRET)).rejects.toThrow(/Malformed/);
    }
  });

  test("refuses an authentic payload that is not a Stripe event", async () => {
    const notEvent = JSON.stringify({ hello: "world" });
    await expect(verifyStripeWebhook(notEvent, await sign(notEvent), SECRET)).rejects.toThrow(/not a Stripe event/);
  });
});
