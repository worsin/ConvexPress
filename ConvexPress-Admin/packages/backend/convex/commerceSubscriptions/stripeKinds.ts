/**
 * `metadata.kind` values on the Stripe objects subscriptions create, shared by
 * the Node actions that create them and the V8 webhook that routes them.
 */

/** A SetupIntent changing the card on an existing subscription contract. */
export const PAYMENT_METHOD_SETUP_KIND = "subscription_payment_method";
