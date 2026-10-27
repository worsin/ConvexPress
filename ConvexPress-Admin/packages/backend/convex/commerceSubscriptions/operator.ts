/**
 * Commerce Subscriptions — operator actions.
 *
 * What an operator (staff in this admin, or an integrating application acting
 * for its staff) can do to a customer's contract: cancel it now or at period
 * end, resume it, retry a past-due payment now, and refund an invoice's
 * payment. Internal functions: the caller has already authorised its operator.
 * Every action is recorded in the contract's history with `actorRef`, the
 * caller's own identifier for the operator, and moves the contract through
 * `lifecycle.transitionSubscription` like every other path.
 *
 * Refunds are two steps. `requestInvoiceRefund` reserves the amount on the
 * invoice (so concurrent requests can never refund more than was paid) and
 * schedules `refunds.processInvoiceRefund`, which asks Stripe under an
 * idempotency key unique to the request and records the outcome with
 * `completeInvoiceRefund`. A failed refund releases its reservation.
 */
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { SUBSCRIPTION_EVENTS } from "../events/constants";
import { emitEvent } from "../helpers/events";
import { requirePluginEnabled } from "../helpers/plugins";
import { createCorrelationId, isEnded, transitionSubscription, writeHistory, type SubscriptionDoc } from "./lifecycle";

type InvoiceDoc = Doc<"commerce_subscription_invoices">;
type InvoiceRefund = NonNullable<InvoiceDoc["refunds"]>[number];

async function loadContract(ctx: MutationCtx, subscriptionId: Id<"commerce_subscriptions">): Promise<SubscriptionDoc> {
	const contract = await ctx.db.get(subscriptionId);
	if (!contract) throw new ConvexError({ code: "NOT_FOUND", message: "Subscription not found." });
	return contract;
}

const operatorArgs = {
	subscriptionId: v.id("commerce_subscriptions"),
	actorRef: v.string(),
	reason: v.optional(v.string()),
};

/**
 * Cancel a contract: now (access ends, unpaid invoices are voided and retries
 * stop) or at the end of the paid period.
 */
export const cancelContract = internalMutation({
	args: { ...operatorArgs, immediate: v.boolean() },
	returns: v.object({ status: v.union(v.literal("cancelled"), v.literal("pending_cancel")), effectiveAt: v.optional(v.number()) }),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		const contract = await loadContract(ctx, args.subscriptionId);
		if (isEnded(contract.status)) {
			throw new ConvexError({ code: "INVALID_STATE", message: `The subscription is already ${contract.status}.` });
		}
		const correlationId = createCorrelationId();
		const now = Date.now();
		if (args.immediate) {
			await transitionSubscription(ctx, {
				subscription: contract,
				toStatus: "cancelled",
				reason: args.reason ?? "operator_cancel_now",
				correlationId,
				patch: { cancelAtPeriodEnd: false },
				eventData: { actorRef: args.actorRef },
			});
		} else {
			if (contract.status !== "active" && contract.status !== "trialing" && contract.status !== "paused" && contract.status !== "pending_cancel") {
				throw new ConvexError({
					code: "INVALID_STATE",
					message: `A ${contract.status} subscription can only be cancelled now.`,
				});
			}
			await transitionSubscription(ctx, {
				subscription: contract,
				toStatus: "pending_cancel",
				reason: args.reason ?? "operator_cancel_scheduled",
				correlationId,
				patch: { cancelAtPeriodEnd: true, cancelScheduledAt: now },
				eventData: { actorRef: args.actorRef, effectiveAt: contract.currentPeriodEndAt },
			});
		}
		await writeHistory(ctx, {
			subscriptionId: contract._id,
			eventType: args.immediate ? "subscription.operator_cancel_now" : "subscription.operator_cancel_scheduled",
			fromStatus: contract.status,
			toStatus: args.immediate ? "cancelled" : "pending_cancel",
			reason: args.reason,
			data: { actorRef: args.actorRef },
			correlationId,
		});
		return args.immediate
			? { status: "cancelled" as const }
			: { status: "pending_cancel" as const, effectiveAt: contract.currentPeriodEndAt };
	},
});

/**
 * Resume a paused contract, or withdraw a scheduled cancellation. A paid period
 * that already ended is not granted again: the renewal falls due now.
 */
export const resumeContract = internalMutation({
	args: operatorArgs,
	returns: v.object({ status: v.literal("active"), nextBillingAt: v.optional(v.number()) }),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		const contract = await loadContract(ctx, args.subscriptionId);
		if (contract.status !== "paused" && contract.status !== "pending_cancel") {
			throw new ConvexError({ code: "INVALID_STATE", message: `A ${contract.status} subscription cannot be resumed.` });
		}
		const now = Date.now();
		const periodRunning = contract.currentPeriodEndAt !== undefined && contract.currentPeriodEndAt > now;
		const nextBillingAt = periodRunning ? contract.nextBillingAt ?? contract.currentPeriodEndAt : now;
		const correlationId = createCorrelationId();
		await transitionSubscription(ctx, {
			subscription: contract,
			toStatus: "active",
			reason: args.reason ?? "operator_resume",
			correlationId,
			patch: {
				pausedAt: undefined,
				cancelAtPeriodEnd: false,
				cancelScheduledAt: undefined,
				nextBillingAt,
				...(periodRunning ? {} : { currentPeriodEndAt: now }),
			},
			eventData: { actorRef: args.actorRef },
		});
		await writeHistory(ctx, {
			subscriptionId: contract._id,
			eventType: "subscription.operator_resume",
			fromStatus: contract.status,
			toStatus: "active",
			reason: args.reason,
			data: { actorRef: args.actorRef },
			correlationId,
		});
		return { status: "active" as const, nextBillingAt };
	},
});

/** Retry a past-due contract's payment now (its next scheduled retry runs at once). */
export const retryPaymentNow = internalMutation({
	args: operatorArgs,
	returns: v.object({ scheduled: v.boolean() }),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		const contract = await loadContract(ctx, args.subscriptionId);
		if (contract.status !== "past_due") {
			throw new ConvexError({ code: "INVALID_STATE", message: "Only a past-due subscription has a payment to retry." });
		}
		const attempts = await ctx.db
			.query("commerce_subscription_dunning_attempts")
			.withIndex("by_subscription", (q) => q.eq("subscriptionId", contract._id))
			.collect();
		const next = attempts.find((attempt) => attempt.status === "scheduled");
		if (!next) return { scheduled: false };
		const now = Date.now();
		await ctx.db.patch("commerce_subscription_dunning_attempts", next._id, { scheduledAt: now, updatedAt: now });
		await ctx.scheduler.runAfter(0, internal.commerceSubscriptions.dunning.runDunningSweep, {});
		await writeHistory(ctx, {
			subscriptionId: contract._id,
			eventType: "subscription.operator_retry_now",
			fromStatus: contract.status,
			toStatus: contract.status,
			reason: args.reason,
			data: { actorRef: args.actorRef, attemptNumber: next.attemptNumber },
		});
		return { scheduled: true };
	},
});

// ─── Refunds ────────────────────────────────────────────────────────────────

function reservedRefunds(invoice: InvoiceDoc): number {
	return (invoice.refunds ?? []).reduce((sum, refund) => (refund.status === "failed" ? sum : sum + refund.amount), 0);
}

/**
 * Reserve a refund of `amount` (minor units; the whole remaining payment when
 * omitted) on a paid invoice and start it. Returns the refund's key.
 */
export const requestInvoiceRefund = internalMutation({
	args: {
		invoiceId: v.id("commerce_subscription_invoices"),
		amount: v.optional(v.number()),
		reason: v.optional(v.string()),
		actorRef: v.string(),
	},
	returns: v.object({ refundKey: v.string(), amount: v.number() }),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		const invoice = await ctx.db.get(args.invoiceId);
		if (!invoice) throw new ConvexError({ code: "NOT_FOUND", message: "Invoice not found." });
		if (invoice.status !== "paid" || !invoice.paymentTransactionId?.startsWith("pi_")) {
			throw new ConvexError({ code: "INVALID_STATE", message: "Only a paid card payment can be refunded." });
		}
		const refundable = invoice.totalAmount - reservedRefunds(invoice);
		const amount = args.amount ?? refundable;
		if (!Number.isInteger(amount) || amount <= 0) {
			throw new ConvexError({ code: "VALIDATION_ERROR", message: "The refund amount must be a positive number of cents." });
		}
		if (amount > refundable) {
			throw new ConvexError({ code: "VALIDATION_ERROR", message: "The refund is more than what remains of this payment." });
		}
		const now = Date.now();
		const refundKey = `${now.toString(36)}${(invoice.refunds ?? []).length}`;
		const entry: InvoiceRefund = {
			key: refundKey,
			amount,
			status: "pending",
			reason: args.reason,
			requestedBy: args.actorRef,
			requestedAt: now,
		};
		const refunds = [...(invoice.refunds ?? []), entry];
		await ctx.db.patch("commerce_subscription_invoices", invoice._id, {
			refunds,
			refundedAmount: reservedRefunds({ ...invoice, refunds }),
			updatedAt: now,
		});
		await writeHistory(ctx, {
			subscriptionId: invoice.subscriptionId,
			eventType: "subscription.refund_requested",
			reason: args.reason,
			data: { invoiceId: invoice._id, amount, refundKey, actorRef: args.actorRef },
		});
		await ctx.scheduler.runAfter(0, internal.commerceSubscriptions.refunds.processInvoiceRefund, {
			invoiceId: invoice._id,
			refundKey,
		});
		return { refundKey, amount };
	},
});

/** What the refund action needs: the payment to refund and the amount reserved. */
export const getInvoiceRefund = internalQuery({
	args: { invoiceId: v.id("commerce_subscription_invoices"), refundKey: v.string() },
	returns: v.union(
		v.null(),
		v.object({ paymentIntentId: v.string(), amount: v.number(), status: v.string(), currencyCode: v.string() }),
	),
	handler: async (ctx, args) => {
		const invoice = await ctx.db.get(args.invoiceId);
		const refund = invoice?.refunds?.find((entry) => entry.key === args.refundKey);
		if (!invoice || !refund || !invoice.paymentTransactionId) return null;
		return {
			paymentIntentId: invoice.paymentTransactionId,
			amount: refund.amount,
			status: refund.status,
			currencyCode: invoice.currencyCode,
		};
	},
});

/** Record Stripe's answer to a refund request. A failure releases the reservation. */
type RefundOutcome = "pending" | "succeeded" | "failed";

/**
 * Record what Stripe said about a reserved refund. Settled refunds stay as
 * they are (a webhook may repeat what the request already recorded). A failed
 * one releases its reservation and raises INVOICE_REFUND_FAILED, so staff hear
 * of it; a succeeded one raises INVOICE_REFUNDED.
 */
async function settleInvoiceRefund(
	ctx: MutationCtx,
	args: { invoiceId: Id<"commerce_subscription_invoices">; refundKey: string; status: RefundOutcome; providerRefundId?: string; error?: string },
): Promise<void> {
	const invoice = await ctx.db.get(args.invoiceId);
	if (!invoice) return;
	const current = invoice.refunds?.find((entry) => entry.key === args.refundKey);
	if (!current || current.status === "succeeded" || current.status === "failed") return;
	if (args.status === "pending" && (!args.providerRefundId || args.providerRefundId === current.providerRefundId)) return;
	const now = Date.now();
	const refunds = (invoice.refunds ?? []).map((entry) =>
		entry.key === args.refundKey
			? {
					...entry,
					status: args.status,
					providerRefundId: args.providerRefundId ?? entry.providerRefundId,
					error: args.error,
					completedAt: args.status === "pending" ? undefined : now,
				}
			: entry,
	);
	await ctx.db.patch("commerce_subscription_invoices", invoice._id, {
		refunds,
		refundedAmount: reservedRefunds({ ...invoice, refunds }),
		updatedAt: now,
	});
	if (args.status === "pending") return;
	await writeHistory(ctx, {
		subscriptionId: invoice.subscriptionId,
		eventType: args.status === "failed" ? "subscription.refund_failed" : "subscription.refunded",
		reason: args.error,
		data: { invoiceId: invoice._id, amount: current.amount, refundKey: args.refundKey, providerRefundId: args.providerRefundId },
	});
	await ctx.runMutation(internal.purchases.internals.syncSubscriptionInvoice, {
		invoiceId: invoice._id,
		eventType: args.status === "failed" ? "subscription_invoice_refund_failed" : "subscription_invoice_refunded",
		metadata: { refundKey: args.refundKey, amount: current.amount, providerRefundId: args.providerRefundId },
	});
	const contract = await ctx.db.get(invoice.subscriptionId);
	await emitEvent(ctx, args.status === "failed" ? SUBSCRIPTION_EVENTS.INVOICE_REFUND_FAILED : SUBSCRIPTION_EVENTS.INVOICE_REFUNDED, "commerce", {
		subscriptionId: invoice.subscriptionId,
		userId: contract?.userId,
		invoiceId: invoice._id,
		invoiceNumber: invoice.invoiceNumber,
		amount: current.amount,
		currencyCode: invoice.currencyCode,
		...(args.status === "failed" ? { error: args.error ?? "The payment provider refused the refund." } : {}),
	});
}

const refundOutcomeValidator = v.union(v.literal("pending"), v.literal("succeeded"), v.literal("failed"));

export const completeInvoiceRefund = internalMutation({
	args: {
		invoiceId: v.id("commerce_subscription_invoices"),
		refundKey: v.string(),
		status: refundOutcomeValidator,
		providerRefundId: v.optional(v.string()),
		error: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await settleInvoiceRefund(ctx, args);
		return null;
	},
});

/** A Stripe refund's state, as its status names it. */
export function refundOutcome(providerStatus: string): RefundOutcome {
	if (providerStatus === "succeeded") return "succeeded";
	if (providerStatus === "failed" || providerStatus === "canceled") return "failed";
	return "pending";
}

/**
 * A Stripe refund webhook for a subscription invoice refund (its metadata
 * names the invoice and the refund): a refund Stripe answered "pending"
 * settles here when Stripe settles it.
 */
export const reconcileInvoiceRefund = internalMutation({
	args: {
		invoiceId: v.string(),
		refundKey: v.string(),
		providerStatus: v.string(),
		providerRefundId: v.string(),
		error: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const invoiceId = ctx.db.normalizeId("commerce_subscription_invoices", args.invoiceId);
		if (!invoiceId) return null;
		const status = refundOutcome(args.providerStatus);
		await settleInvoiceRefund(ctx, {
			invoiceId,
			refundKey: args.refundKey,
			status,
			providerRefundId: args.providerRefundId,
			...(status === "failed" ? { error: args.error ?? `Refund ${args.providerStatus}` } : {}),
		});
		return null;
	},
});
