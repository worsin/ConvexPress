"use node";
/**
 * Commerce Subscriptions — refund processing (Stripe).
 *
 * Runs a refund `operator.requestInvoiceRefund` reserved: asks Stripe to refund
 * the invoice's PaymentIntent under an idempotency key unique to the request
 * (a retried run never refunds twice) and records the answer with
 * `operator.completeInvoiceRefund`.
 */
import Stripe from "stripe";
import { v } from "convex/values";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getStripeSecretKey } from "./stripeCharge";

function describe(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

export const processInvoiceRefund = internalAction({
	args: { invoiceId: v.id("commerce_subscription_invoices"), refundKey: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const refund = await ctx.runQuery(internal.commerceSubscriptions.operator.getInvoiceRefund, args);
		if (!refund || refund.status !== "pending") return null;
		const fail = async (error: string) => {
			await ctx.runMutation(internal.commerceSubscriptions.operator.completeInvoiceRefund, {
				...args,
				status: "failed",
				error,
			});
			return null;
		};
		const key = await getStripeSecretKey(ctx);
		if (!key) return await fail("Stripe is not configured.");
		try {
			const stripe = new Stripe(key);
			const created = await stripe.refunds.create(
				{
					payment_intent: refund.paymentIntentId,
					amount: refund.amount,
					metadata: { kind: "subscription_invoice_refund", invoiceId: String(args.invoiceId), refundKey: args.refundKey },
				},
				{ idempotencyKey: `sub_refund_${String(args.invoiceId)}_${args.refundKey}` },
			);
			const status = created.status === "succeeded" ? "succeeded" : created.status === "failed" || created.status === "canceled" ? "failed" : "pending";
			await ctx.runMutation(internal.commerceSubscriptions.operator.completeInvoiceRefund, {
				...args,
				status,
				providerRefundId: created.id,
				...(status === "failed" ? { error: created.failure_reason ?? `Refund ${created.status}` } : {}),
			});
		} catch (err) {
			return await fail(describe(err));
		}
		return null;
	},
});
