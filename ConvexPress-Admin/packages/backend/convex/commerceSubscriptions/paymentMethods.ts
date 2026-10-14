"use node";
/**
 * Commerce Subscriptions — the card on file.
 *
 * Customers replace the card a subscription renews on from the account page,
 * on this site: `beginPaymentMethodUpdate` creates a Stripe SetupIntent and
 * returns only its client secret (and the publishable key) for the Payment
 * Element; after Stripe confirms it in the page, `confirmPaymentMethodUpdate`
 * retrieves the SetupIntent from Stripe and records the card only when Stripe
 * says it succeeded, for this customer and this contract. The browser's word
 * is never taken for it. Redirect-based confirmations, and a customer who
 * leaves before confirming, are recorded by the `setup_intent.succeeded`
 * webhook through `recordVerifiedSetupIntent`.
 *
 * Only the card's brand, last four digits and expiry are stored, to show which
 * card is on file. A past_due contract is retried on the new card at once.
 */

import Stripe from "stripe";
import { ConvexError, v } from "convex/values";

import { action, internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getStripeSecretKey } from "./stripeCharge";
import { PAYMENT_METHOD_SETUP_KIND } from "./stripeKinds";


type CardSummary = { brand: string; last4: string; expMonth: number; expYear: number };

async function stripeClient(ctx: Pick<ActionCtx, "runQuery">): Promise<Stripe> {
	const key = await getStripeSecretKey(ctx);
	if (!key) throw new ConvexError({ code: "PAYMENTS_UNAVAILABLE", message: "Card payments are not configured." });
	return new Stripe(key);
}

function refId(value: string | { id: string } | null | undefined): string | undefined {
	if (typeof value === "string") return value;
	return value?.id;
}

function cardSummary(paymentMethod: Stripe.PaymentMethod | string | null): CardSummary | undefined {
	if (!paymentMethod || typeof paymentMethod === "string" || !paymentMethod.card) return undefined;
	const card = paymentMethod.card;
	return { brand: card.brand, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year };
}

/**
 * Start a card change for one of my contracts. Returns the SetupIntent's client
 * secret for the on-site Payment Element; no card is recorded yet.
 */
export const beginPaymentMethodUpdate = action({
	args: { contractId: v.id("commerce_subscriptions") },
	returns: v.object({
		clientSecret: v.string(),
		setupIntentId: v.string(),
		publishableKey: v.string(),
	}),
	handler: async (ctx, args) => {
		const contract = await ctx.runQuery(internal.commerceSubscriptions.portal.getContractForPaymentMethodUpdate, {
			contractId: args.contractId,
		});
		if (!contract.publishableKey) {
			throw new ConvexError({ code: "PAYMENTS_UNAVAILABLE", message: "Card payments are not configured." });
		}
		const stripe = await stripeClient(ctx);

		let customerId = contract.stripeCustomerId;
		if (!customerId) {
			if (!contract.email) throw new ConvexError({ code: "VALIDATION_ERROR", message: "Your account has no email address." });
			customerId = (await stripe.customers.create({ email: contract.email })).id;
		}

		const setupIntent = await stripe.setupIntents.create({
			customer: customerId,
			usage: "off_session",
			automatic_payment_methods: { enabled: true },
			metadata: { kind: PAYMENT_METHOD_SETUP_KIND, contractId: String(args.contractId) },
		});
		if (!setupIntent.client_secret) {
			throw new ConvexError({ code: "PAYMENTS_UNAVAILABLE", message: "Stripe did not return a card form." });
		}
		return {
			clientSecret: setupIntent.client_secret,
			setupIntentId: setupIntent.id,
			publishableKey: contract.publishableKey,
		};
	},
});

/**
 * Record a SetupIntent Stripe reports as succeeded for this contract's
 * customer, with the card's display summary. Shared by the confirm action and
 * the webhook. Returns null when the SetupIntent is not a card change for the
 * contract or has not succeeded.
 */
async function recordSetupIntent(
	ctx: ActionCtx,
	stripe: Stripe,
	contractId: Id<"commerce_subscriptions">,
	setupIntentId: string,
): Promise<{ updated: boolean; retryScheduled: boolean; card: CardSummary | undefined } | null> {
	const setupIntent = await stripe.setupIntents.retrieve(setupIntentId, { expand: ["payment_method"] });
	if (setupIntent.status !== "succeeded") return null;
	if (setupIntent.metadata?.kind !== PAYMENT_METHOD_SETUP_KIND) return null;
	if (setupIntent.metadata?.contractId !== String(contractId)) return null;
	const customerId = refId(setupIntent.customer);
	const paymentMethodId = refId(setupIntent.payment_method);
	if (!customerId || !paymentMethodId) return null;
	const card = cardSummary(setupIntent.payment_method);
	const recorded = await ctx.runMutation(internal.commerceSubscriptions.portal.recordContractPaymentMethod, {
		contractId,
		stripeCustomerId: customerId,
		paymentMethodId,
		summary: card,
		setupIntentId: setupIntent.id,
	});
	return { ...recorded, card };
}

/**
 * Finish a card change after Stripe confirmed it in the page. The SetupIntent
 * is retrieved from Stripe and must have succeeded, for this contract.
 */
export const confirmPaymentMethodUpdate = action({
	args: {
		contractId: v.id("commerce_subscriptions"),
		setupIntentId: v.string(),
	},
	returns: v.object({
		ok: v.boolean(),
		retryScheduled: v.boolean(),
		card: v.optional(v.object({ brand: v.string(), last4: v.string(), expMonth: v.number(), expYear: v.number() })),
	}),
	handler: async (ctx, args) => {
		// Ownership: the same check that gated beginPaymentMethodUpdate.
		await ctx.runQuery(internal.commerceSubscriptions.portal.getContractForPaymentMethodUpdate, {
			contractId: args.contractId,
		});
		const stripe = await stripeClient(ctx);
		const recorded = await recordSetupIntent(ctx, stripe, args.contractId, args.setupIntentId);
		if (!recorded) {
			throw new ConvexError({
				code: "CARD_NOT_CONFIRMED",
				message: "Stripe has not confirmed this card. Please try again.",
			});
		}
		return { ok: true, retryScheduled: recorded.retryScheduled, card: recorded.card };
	},
});

/**
 * The `setup_intent.succeeded` webhook's entry for card changes. The event is
 * signature-verified; the SetupIntent is still retrieved from Stripe so the
 * recorded card comes from Stripe, not from the event body.
 */
export const recordVerifiedSetupIntent = internalAction({
	args: { contractRef: v.string(), setupIntentId: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const contractId = await ctx.runQuery(internal.commerceSubscriptions.portal.resolveContractRef, {
			contractRef: args.contractRef,
		});
		if (!contractId) return null;
		const stripe = await stripeClient(ctx);
		await recordSetupIntent(ctx, stripe, contractId, args.setupIntentId);
		return null;
	},
});

/**
 * Fill in the display summary for the card a contract was bought with (the
 * signup charge records only the PaymentMethod id).
 */
export const refreshPaymentMethodSummary = internalAction({
	args: { contractId: v.id("commerce_subscriptions") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const current = await ctx.runQuery(internal.commerceSubscriptions.portal.getContractPaymentMethod, {
			contractId: args.contractId,
		});
		if (!current) return null;
		const stripe = await stripeClient(ctx);
		const card = cardSummary(await stripe.paymentMethods.retrieve(current.paymentMethodId));
		if (!card) return null;
		await ctx.runMutation(internal.commerceSubscriptions.portal.recordPaymentMethodSummary, {
			contractId: args.contractId,
			paymentMethodId: current.paymentMethodId,
			summary: card,
		});
		return null;
	},
});
