/**
 * Commerce Subscriptions — first-charge confirmation rules (pure).
 *
 * `publicCharge.confirmFirstCharge` retrieves a PaymentIntent or SetupIntent
 * from Stripe with the secret key and asks `decideFirstChargeConfirmation`
 * whether it settles the checkout intent. Nothing the browser says about the
 * payment is trusted: the browser only names the Stripe object and proves it
 * holds that object's client secret. Every fact checked here comes from Stripe
 * or from the intent row.
 *
 * Checks, in order:
 *   1. Proof of possession: the caller's client secret equals the one Stripe
 *      reports for the object (constant-time). Otherwise the caller is refused.
 *   2. The intent is still open (pending / draft) or already activated (a
 *      replay, answered with the existing contract).
 *   3. The object belongs to this intent: metadata kind matches the mode,
 *      metadata.checkoutIntentId is this intent, the object is the one the
 *      server created for it (`paymentTransactionId`), and its customer is the
 *      intent's Stripe customer.
 *   4. Stripe's status: `succeeded` settles; in-flight states are pending;
 *      `requires_payment_method` is a declined card; `canceled` closes it.
 *   5. Money: a PaymentIntent's amount and amount received equal the intent's
 *      initial amount, in its currency. A SetupIntent only settles a $0-now
 *      intent and must carry the saved payment method.
 *
 * The activation itself re-checks the settlement against the intent
 * (`checkout.verifyStripeSettlement`), exactly as for the webhook.
 */

import type { Doc } from "../_generated/dataModel";
import { timingSafeEquals } from "../helpers/timingSafe";

/** The checkout-intent facts a confirmation is verified against. */
export interface FirstChargeExpectation {
	checkoutIntentId: string;
	intentStatus: Doc<"commerce_subscription_checkout_intents">["status"];
	initialAmount: number;
	currencyCode: string;
	stripeCustomerId?: string;
	/** The PaymentIntent/SetupIntent id the server created for the intent. */
	paymentTransactionId?: string;
}

/** The fields read from the Stripe object the server retrieved. */
export type RetrievedFirstCharge =
	| {
			kind: "payment_intent";
			id: string;
			status: string;
			clientSecret: string | null;
			metadata: Record<string, string>;
			customerId?: string;
			paymentMethodId?: string;
			amount: number;
			amountReceived: number;
			currency: string;
	  }
	| {
			kind: "setup_intent";
			id: string;
			status: string;
			clientSecret: string | null;
			metadata: Record<string, string>;
			customerId?: string;
			paymentMethodId?: string;
	  };

/** The arguments of the activation path the webhook uses for each mode. */
export type FirstChargeSettlement =
	| {
			kind: "payment_intent";
			checkoutIntentRef: string;
			paymentIntentId: string;
			paymentIntentStatus: string;
			amountReceived: number;
			currency: string;
			paymentMethodId?: string;
			stripeCustomerId: string;
	  }
	| {
			kind: "setup_intent";
			checkoutIntentRef: string;
			setupIntentId: string;
			paymentMethodId: string;
			stripeCustomerId: string;
	  };

export type FirstChargeDecision =
	| { outcome: "forbidden" }
	| { outcome: "settle"; settlement: FirstChargeSettlement }
	| { outcome: "pending"; reason: "processing" }
	| {
			outcome: "failed";
			reason: "payment_failed" | "checkout_closed" | "verification_failed";
	  };

/** Stripe metadata `kind` the server writes for each first-charge mode. */
export const FIRST_CHARGE_METADATA_KIND = {
	payment_intent: "subscription_first_charge",
	setup_intent: "subscription_setup",
} as const;

/** Stripe states where the buyer or Stripe still has work to do. */
const IN_FLIGHT_STATUSES = new Set([
	"processing",
	"requires_action",
	"requires_confirmation",
	"requires_capture",
]);

/**
 * The Stripe object id a client secret belongs to (`pi_123_secret_abc` →
 * `pi_123`), or null when the secret is not shaped like one.
 */
export function clientSecretObjectId(clientSecret: string): string | null {
	const marker = clientSecret.indexOf("_secret_");
	if (marker <= 0) return null;
	return clientSecret.slice(0, marker);
}

export function decideFirstChargeConfirmation(
	expected: FirstChargeExpectation,
	observed: RetrievedFirstCharge,
	clientSecret: string,
): FirstChargeDecision {
	// 1. Proof of possession.
	if (!observed.clientSecret || !timingSafeEquals(observed.clientSecret, clientSecret)) {
		return { outcome: "forbidden" };
	}

	// 2. The intent can still be settled, or was already activated.
	const open =
		expected.intentStatus === "payment_pending" ||
		expected.intentStatus === "draft" ||
		expected.intentStatus === "activated";
	if (!open) return { outcome: "failed", reason: "checkout_closed" };

	// 3. The object belongs to this intent and its customer.
	const stripeCustomerId = expected.stripeCustomerId;
	if (
		stripeCustomerId === undefined ||
		observed.customerId !== stripeCustomerId ||
		expected.paymentTransactionId === undefined ||
		observed.id !== expected.paymentTransactionId ||
		observed.metadata.kind !== FIRST_CHARGE_METADATA_KIND[observed.kind] ||
		observed.metadata.checkoutIntentId !== expected.checkoutIntentId
	) {
		return { outcome: "failed", reason: "verification_failed" };
	}

	// 4. Stripe's status.
	if (IN_FLIGHT_STATUSES.has(observed.status)) {
		return { outcome: "pending", reason: "processing" };
	}
	if (observed.status === "requires_payment_method") {
		return { outcome: "failed", reason: "payment_failed" };
	}
	if (observed.status === "canceled") {
		return { outcome: "failed", reason: "checkout_closed" };
	}
	if (observed.status !== "succeeded") {
		return { outcome: "failed", reason: "verification_failed" };
	}

	// 5. Money (PaymentIntent) or the saved card (SetupIntent).
	if (observed.kind === "payment_intent") {
		const paidInFull =
			expected.initialAmount > 0 &&
			observed.amount === expected.initialAmount &&
			observed.amountReceived === expected.initialAmount &&
			observed.currency.toUpperCase() === expected.currencyCode.toUpperCase();
		if (!paidInFull) return { outcome: "failed", reason: "verification_failed" };
		return {
			outcome: "settle",
			settlement: {
				kind: "payment_intent",
				checkoutIntentRef: expected.checkoutIntentId,
				paymentIntentId: observed.id,
				paymentIntentStatus: observed.status,
				amountReceived: observed.amountReceived,
				currency: observed.currency,
				paymentMethodId: observed.paymentMethodId,
				stripeCustomerId,
			},
		};
	}
	if (expected.initialAmount !== 0 || !observed.paymentMethodId) {
		return { outcome: "failed", reason: "verification_failed" };
	}
	return {
		outcome: "settle",
		settlement: {
			kind: "setup_intent",
			checkoutIntentRef: expected.checkoutIntentId,
			setupIntentId: observed.id,
			paymentMethodId: observed.paymentMethodId,
			stripeCustomerId,
		},
	};
}
