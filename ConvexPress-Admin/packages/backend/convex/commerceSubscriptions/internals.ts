/**
 * Commerce Subscriptions — internal functions.
 *
 * Not client-callable: invoked by the renewal and dunning sweeps, the charging
 * action, the Stripe webhook and other internal functions. Contract status
 * changes go through `lifecycle.ts`.
 *
 *   - createDueInvoices            Renewal invoices for contracts whose period ended
 *   - handleInvoicePaymentResult   Apply one charge outcome to an invoice (idempotent)
 *   - recordStripeInvoicePayment   The Stripe webhook's entry to the same
 *   - getRetryableDunningAttempts  Retries due now (and stalled claims)
 *   - claimDunningAttempt          Claim one retry for charging
 *   - expirePendingCancellations   End contracts whose scheduled cancellation is due
 */
import type { RegisteredQuery } from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { SUBSCRIPTION_EVENTS } from "../events/constants";
import { applyCouponToInvoice } from "../helpers/coupons";
import { emitEvent } from "../helpers/events";
import { getCurrentUser } from "../helpers/auth";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { readMergedSettingsSection } from "../settings/read";
import { commerceSubscriptionInvoiceStatusValidator } from "../schema/commerceSubscriptions";
import { commerceSubscriptionsDocs } from "../schema/commerceSubscriptions.docs.generated";
import { allocateSubscriptionInvoiceNumber } from "./invoiceNumbers";
import { assertNotAlreadySubscribed } from "./ownership";
import {
	addBillingPeriod,
	addDays,
	canTransition,
	createCorrelationId,
	isEnded,
	resolveLifecycleTerms,
	swapToOffer,
	syncEntitlementsForStatus,
	transitionSubscription,
	writeHistory,
	type SubscriptionDoc,
	type SubscriptionStatus,
} from "./lifecycle";
import { activationResultValidator, type ActivationResult } from "./validators";

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL QUERIES
// ═══════════════════════════════════════════════════════════════════════════

export const checkEntitlementForUser = internalQuery({
	args: {
		userId: v.id("users"),
		entitlementCode: v.string(),
	},
	returns: v.object({
		hasEntitlement: v.boolean(),
		entitlement: v.union(v.null(), commerceSubscriptionsDocs.commerce_subscription_entitlements),
		inGracePeriod: v.optional(v.boolean()),
	}),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) {
			return { hasEntitlement: false, entitlement: null };
		}

		const activeEntitlements = await ctx.db
			.query("commerce_subscription_entitlements")
			.withIndex("by_user_status", (q) =>
				q.eq("userId", args.userId).eq("status", "active"),
			)
			.collect();

		const active = activeEntitlements.find(
			(e) => e.entitlementCode === args.entitlementCode,
		);
		if (active) {
			return { hasEntitlement: true, entitlement: active };
		}

		const graceEntitlements = await ctx.db
			.query("commerce_subscription_entitlements")
			.withIndex("by_user_status", (q) =>
				q.eq("userId", args.userId).eq("status", "grace"),
			)
			.collect();

		const grace = graceEntitlements.find(
			(e) => e.entitlementCode === args.entitlementCode,
		);
		if (!grace) {
			return { hasEntitlement: false, entitlement: null };
		}

		const stillInGrace = !grace.graceEndsAt || grace.graceEndsAt > Date.now();
		return {
			hasEntitlement: stillInGrace,
			inGracePeriod: true,
			entitlement: grace,
		};
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// RENEWAL INVOICES
// ═══════════════════════════════════════════════════════════════════════════

type InvoiceDoc = Doc<"commerce_subscription_invoices">;
type AttemptDoc = Doc<"commerce_subscription_dunning_attempts">;

/** Contracts the renewal sweep invoices when their period has ended. */
const RENEWABLE: readonly SubscriptionStatus[] = ["active", "trialing"];

/**
 * An invoice that still has a charge coming: open (being charged now) or
 * failed with dunning in progress. A contract with one gets no new renewal
 * invoice, so one period is never invoiced twice.
 */
function isUnsettled(invoice: InvoiceDoc): boolean {
	return invoice.status === "draft" || invoice.status === "open" || invoice.status === "failed";
}

/**
 * Coupon redemptions with applications left discount the invoice, each using
 * one application. A redemption that can no longer apply (its coupon was
 * deleted) is skipped and recorded rather than failing the renewal.
 */
async function applyRedemptions(
	ctx: MutationCtx,
	subscriptionId: Id<"commerce_subscriptions">,
	invoiceId: Id<"commerce_subscription_invoices">,
	subtotal: number,
): Promise<void> {
	const redemptions = await ctx.db
		.query("commerce_subscription_coupon_redemptions")
		.withIndex("by_contract", (q) => q.eq("contractId", subscriptionId))
		.collect();
	let current = subtotal;
	for (const redemption of redemptions) {
		if (redemption.remainingApplications <= 0) continue;
		try {
			current = (await applyCouponToInvoice(ctx, invoiceId, redemption._id, current)).newSubtotal;
		} catch (err) {
			await writeHistory(ctx, {
				subscriptionId,
				eventType: "subscription.coupon_skipped",
				reason: err instanceof Error ? err.message : String(err),
				data: { invoiceId, redemptionId: redemption._id },
			});
		}
	}
}

async function insertRenewalInvoice(
	ctx: MutationCtx,
	subscription: SubscriptionDoc,
	now: number,
): Promise<Id<"commerce_subscription_invoices">> {
	const terms = await resolveLifecycleTerms(ctx, subscription);
	const periodStartAt = subscription.currentPeriodEndAt ?? now;
	const periodEndAt = addBillingPeriod(periodStartAt, terms.billingInterval, terms.billingIntervalCount);
	const subtotalAmount = subscription.recurringAmount;

	const invoiceId = await ctx.db.insert("commerce_subscription_invoices", {
		subscriptionId: subscription._id,
		checkoutIntentId: subscription.sourceCheckoutIntentId,
		sourceChannel: subscription.sourceChannel,
		status: "open",
		invoiceNumber: await allocateSubscriptionInvoiceNumber(ctx),
		currencyCode: subscription.currencyCode,
		subtotalAmount,
		taxAmount: 0,
		totalAmount: subtotalAmount,
		paymentProvider: subscription.paymentProvider,
		savedPaymentMethodId: subscription.defaultPaymentMethodId,
		manualBilling: subscription.manualBilling,
		kind: "renewal",
		periodStartAt,
		periodEndAt,
		dueAt: now,
		createdAt: now,
		updatedAt: now,
	});

	const items = await ctx.db
		.query("commerce_subscription_items")
		.withIndex("by_subscription", (q) => q.eq("subscriptionId", subscription._id))
		.collect();
	for (const item of items) {
		if (item.status !== "active" && item.status !== "pending_cancel") continue;
		await ctx.db.insert("commerce_subscription_invoice_items", {
			invoiceId,
			subscriptionItemId: item._id,
			description: item.titleSnapshot ?? "Recurring subscription charge",
			quantity: item.quantity,
			unitAmount: item.unitAmount,
			lineType: "recurring",
			currencyCode: item.currencyCode,
			lineTotalAmount: item.unitAmount * item.quantity,
			metadata: {
				sourceOfferId: item.sourceOfferId,
				sourceOfferItemId: item.sourceOfferItemId,
				productId: item.productId,
				variantId: item.variantId,
				bundleId: item.bundleId,
			},
			createdAt: now,
		});
	}

	await applyRedemptions(ctx, subscription._id, invoiceId, subtotalAmount);

	await ctx.runMutation(internal.purchases.internals.syncSubscriptionInvoice, {
		invoiceId,
		eventType: "subscription_invoice_created",
	});
	return invoiceId;
}

/**
 * Create the renewal invoice for each contract whose paid period has ended.
 * Called by the renewal sweep, which charges each invoice it gets back.
 */
export const createDueInvoices = internalMutation({
	args: {
		limit: v.optional(v.number()),
	},
	returns: v.object({ createdCount: v.number(), invoiceIds: v.array(v.id("commerce_subscription_invoices")) }),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		await applyDueOfferChanges(ctx);
		const now = Date.now();
		const limit = args.limit ?? 50;

		const due: SubscriptionDoc[] = [];
		for (const status of RENEWABLE) {
			const rows = await ctx.db
				.query("commerce_subscriptions")
				.withIndex("by_status", (q) => q.eq("status", status))
				.collect();
			for (const row of rows) {
				if (row.nextBillingAt !== undefined && row.nextBillingAt <= now) due.push(row);
			}
		}

		const invoiceIds: Id<"commerce_subscription_invoices">[] = [];
		for (const subscription of due) {
			if (invoiceIds.length >= limit) break;
			const invoices = await ctx.db
				.query("commerce_subscription_invoices")
				.withIndex("by_subscription", (q) => q.eq("subscriptionId", subscription._id))
				.collect();
			if (invoices.some(isUnsettled)) continue;
			invoiceIds.push(await insertRenewalInvoice(ctx, subscription, now));
		}

		return { createdCount: invoiceIds.length, invoiceIds };
	},
});

/** How long an open invoice may wait for its charge before the sweep re-drives it. */
const CHARGE_STALE_AFTER_MS = 15 * 60 * 1000;
/**
 * Re-drives reuse the charge's idempotency key, which Stripe honours for at
 * least 24 hours. Past that window a re-drive could charge twice, so an older
 * stuck invoice is left for an operator.
 */
const CHARGE_REPLAY_WINDOW_MS = 23 * 60 * 60 * 1000;

/**
 * Open invoices whose charge never reported back (the charging action failed
 * before recording a result). The renewal sweep charges them again with the
 * same idempotency key, so a charge Stripe already made is returned, not
 * repeated.
 */
export const getStalledInvoiceCharges = internalQuery({
	args: { limit: v.optional(v.number()) },
	returns: v.array(v.object({ invoiceId: v.id("commerce_subscription_invoices"), stalledSince: v.number() })),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];
		const now = Date.now();
		const open = await ctx.db
			.query("commerce_subscription_invoices")
			.withIndex("by_status", (q) => q.eq("status", "open"))
			.collect();
		return open
			.filter(
				(invoice) =>
					!invoice.manualBilling &&
					invoice.updatedAt <= now - CHARGE_STALE_AFTER_MS &&
					invoice.updatedAt > now - CHARGE_REPLAY_WINDOW_MS,
			)
			.slice(0, args.limit ?? 25)
			.map((invoice) => ({ invoiceId: invoice._id, stalledSince: invoice.updatedAt }));
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// PRORATION ITEM SWAP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply the plan change a paid upgrade proration invoice bought. The proration
 * charged the price difference for the rest of the current period, so the
 * period itself is unchanged: the next renewal bills the new price when it ends.
 */
async function applyProrationItemSwap(
	ctx: MutationCtx,
	invoice: InvoiceDoc,
	subscription: SubscriptionDoc,
	paymentTransactionId: string | undefined,
	correlationId: string,
	now: number,
): Promise<void> {
	await ctx.db.patch("commerce_subscription_invoices", invoice._id, {
		status: "paid",
		paidAt: now,
		paymentTransactionId,
		dueAt: undefined,
		updatedAt: now,
	});

	const prorationEvent = invoice.prorationEventId ? await ctx.db.get(invoice.prorationEventId) : null;
	const toOffer = prorationEvent ? await ctx.db.get(prorationEvent.toOfferId) : null;
	const fromOffer = prorationEvent ? await ctx.db.get(prorationEvent.fromOfferId) : null;
	if (!prorationEvent || !toOffer || !fromOffer) {
		await writeHistory(ctx, {
			subscriptionId: subscription._id,
			eventType: "subscription.proration_swap_skipped",
			reason: "proration_event_or_offer_missing",
			data: { invoiceId: invoice._id, prorationEventId: invoice.prorationEventId },
			correlationId,
		});
		return;
	}

	await swapToOffer(ctx, subscription, toOffer, "upgrade_proration", now);
	const updated = await ctx.db.get(subscription._id);
	if (updated) {
		await ctx.db.patch("commerce_subscriptions", updated._id, { lastInvoiceId: invoice._id });
	}

	await writeHistory(ctx, {
		subscriptionId: subscription._id,
		eventType: "subscription.upgraded_via_proration",
		actorUserId: prorationEvent.triggeredBy,
		fromStatus: subscription.status,
		toStatus: subscription.status,
		reason: "upgrade",
		data: {
			fromOfferId: fromOffer._id,
			toOfferId: toOffer._id,
			invoiceId: invoice._id,
			prorationEventId: prorationEvent._id,
			chargeTransactionId: paymentTransactionId,
		},
		correlationId,
	});
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT RESULTS
// ═══════════════════════════════════════════════════════════════════════════

async function attemptsForInvoice(
	ctx: MutationCtx,
	invoiceId: Id<"commerce_subscription_invoices">,
): Promise<AttemptDoc[]> {
	return await ctx.db
		.query("commerce_subscription_dunning_attempts")
		.withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
		.collect();
}

const paymentResultValidator = v.object({
	applied: v.boolean(),
	outcome: v.union(v.literal("paid"), v.literal("failed"), v.literal("ignored")),
	reason: v.optional(v.string()),
});
type PaymentResult = Infer<typeof paymentResultValidator>;

const ignored = (reason: string): PaymentResult => ({ applied: false, outcome: "ignored", reason });

type ChargeOutcome = {
	paymentTransactionId?: string;
	failureCode?: string;
	failureReason?: string;
};

async function recordPaidInvoice(
	ctx: MutationCtx,
	invoice: InvoiceDoc,
	subscription: SubscriptionDoc,
	charge: ChargeOutcome,
	correlationId: string,
	now: number,
): Promise<PaymentResult> {
	// Any retry still waiting for this invoice is done: it was paid.
	for (const attempt of await attemptsForInvoice(ctx, invoice._id)) {
		if (attempt.status !== "scheduled" && attempt.status !== "processing") continue;
		const own = attempt.status === "processing";
		await ctx.db.patch("commerce_subscription_dunning_attempts", attempt._id, {
			status: own ? "succeeded" : "aborted",
			processedAt: now,
			paymentTransactionId: own ? charge.paymentTransactionId : attempt.paymentTransactionId,
			errorMessage: own ? undefined : "invoice_paid",
			updatedAt: now,
		});
	}

	if (invoice.prorationEventId) {
		await applyProrationItemSwap(ctx, invoice, subscription, charge.paymentTransactionId, correlationId, now);
		await ctx.runMutation(internal.purchases.internals.syncSubscriptionInvoice, {
			invoiceId: invoice._id,
			eventType: "subscription_invoice_paid",
			metadata: { paymentTransactionId: charge.paymentTransactionId, prorationEventId: invoice.prorationEventId },
		});
		return { applied: true, outcome: "paid" };
	}

	await ctx.db.patch("commerce_subscription_invoices", invoice._id, {
		status: "paid",
		paidAt: now,
		paymentTransactionId: charge.paymentTransactionId,
		dueAt: undefined,
		updatedAt: now,
	});
	await ctx.runMutation(internal.purchases.internals.syncSubscriptionInvoice, {
		invoiceId: invoice._id,
		eventType: "subscription_invoice_paid",
		metadata: { paymentTransactionId: charge.paymentTransactionId },
	});

	if (isEnded(subscription.status)) {
		// Money arrived for a contract that has since ended (a late payment on a
		// voided invoice). It is recorded, not used to revive the contract; an
		// operator decides between reinstating and refunding.
		await writeHistory(ctx, {
			subscriptionId: subscription._id,
			eventType: "subscription.payment_after_close",
			fromStatus: subscription.status,
			toStatus: subscription.status,
			data: { invoiceId: invoice._id, paymentTransactionId: charge.paymentTransactionId },
			correlationId,
		});
		return { applied: true, outcome: "paid", reason: "contract_ended" };
	}

	// The invoice pays for the period it was issued for. When the contract has
	// already moved past that period, the payment settles the invoice and
	// nothing else.
	const terms = await resolveLifecycleTerms(ctx, subscription);
	const periodStartAt = invoice.periodStartAt ?? subscription.currentPeriodEndAt ?? now;
	const periodEndAt =
		invoice.periodEndAt ?? addBillingPeriod(periodStartAt, terms.billingInterval, terms.billingIntervalCount);
	const advances = subscription.currentPeriodEndAt === undefined || periodEndAt > subscription.currentPeriodEndAt;
	if (advances) {
		await ctx.db.patch("commerce_subscriptions", subscription._id, {
			currentPeriodStartAt: periodStartAt,
			currentPeriodEndAt: periodEndAt,
			nextBillingAt: periodEndAt,
			lastInvoiceId: invoice._id,
			updatedAt: now,
		});
	}

	const current = await ctx.db.get(subscription._id);
	if (!current) return { applied: true, outcome: "paid" };
	if (current.status === "past_due" || current.status === "trialing") {
		await transitionSubscription(ctx, {
			subscription: current,
			toStatus: "active",
			reason: current.status === "past_due" ? "payment_recovered" : "trial_converted",
			correlationId,
		});
	} else {
		await syncEntitlementsForStatus(ctx, current, now, terms.gracePeriodDays);
	}

	await writeHistory(ctx, {
		subscriptionId: subscription._id,
		eventType: "subscription.renewed",
		fromStatus: subscription.status,
		toStatus: current.status === "past_due" || current.status === "trialing" ? "active" : current.status,
		data: { invoiceId: invoice._id, paymentTransactionId: charge.paymentTransactionId, periodEndAt, advanced: advances },
		correlationId,
	});
	await emitEvent(ctx, SUBSCRIPTION_EVENTS.RENEWED, "commerce", {
		subscriptionId: subscription._id,
		userId: subscription.userId,
		invoiceId: invoice._id,
		amount: invoice.totalAmount,
		currencyCode: invoice.currencyCode,
		periodEndAt,
		// A payment that ends a past-due spell: the customer hears "it went through".
		recovered: subscription.status === "past_due",
	});
	return { applied: true, outcome: "paid" };
}

async function recordFailedCharge(
	ctx: MutationCtx,
	invoice: InvoiceDoc,
	subscription: SubscriptionDoc,
	charge: ChargeOutcome,
	correlationId: string,
	now: number,
): Promise<PaymentResult> {
	if (invoice.status === "void") return ignored("invoice_closed");
	const attempts = await attemptsForInvoice(ctx, invoice._id);
	// Stripe reports a declined charge both to the charging action and by
	// webhook. The PaymentIntent id makes the second report a no-op.
	if (charge.paymentTransactionId && attempts.some((a) => a.paymentTransactionId === charge.paymentTransactionId)) {
		return ignored("already_recorded");
	}

	if (invoice.prorationEventId) {
		// A plan change the customer asked for: the change does not happen, and
		// the contract is not put into dunning over it.
		await ctx.db.patch("commerce_subscription_invoices", invoice._id, {
			status: "void",
			paymentTransactionId: charge.paymentTransactionId,
			dueAt: undefined,
			updatedAt: now,
		});
		await writeHistory(ctx, {
			subscriptionId: subscription._id,
			eventType: "subscription.proration_charge_failed",
			fromStatus: subscription.status,
			toStatus: subscription.status,
			reason: charge.failureReason,
			data: { invoiceId: invoice._id, prorationEventId: invoice.prorationEventId },
			correlationId,
		});
		await ctx.runMutation(internal.purchases.internals.syncSubscriptionInvoice, {
			invoiceId: invoice._id,
			eventType: "subscription_invoice_payment_failed",
			metadata: {
				paymentTransactionId: charge.paymentTransactionId,
				prorationEventId: invoice.prorationEventId,
				failureCode: charge.failureCode,
				failureReason: charge.failureReason,
			},
		});
		return { applied: true, outcome: "failed", reason: "plan_change_not_applied" };
	}

	if (isEnded(subscription.status)) return ignored("contract_ended");

	// The charge that failed: the dunning retry that claimed it, or the renewal
	// charge itself (attempt 1).
	const claimed = attempts.find((a) => a.status === "processing");
	if (claimed) {
		await ctx.db.patch("commerce_subscription_dunning_attempts", claimed._id, {
			status: "failed",
			processedAt: now,
			errorMessage: charge.failureReason,
			paymentTransactionId: charge.paymentTransactionId,
			updatedAt: now,
		});
	} else {
		await ctx.db.insert("commerce_subscription_dunning_attempts", {
			subscriptionId: subscription._id,
			invoiceId: invoice._id,
			attemptNumber: attempts.length + 1,
			status: "failed",
			scheduledAt: now,
			processedAt: now,
			errorMessage: charge.failureReason,
			paymentTransactionId: charge.paymentTransactionId,
			createdAt: now,
			updatedAt: now,
		});
	}

	const terms = await resolveLifecycleTerms(ctx, subscription);
	const policy = terms.dunningPolicy;
	const failedCharges = (await attemptsForInvoice(ctx, invoice._id)).filter((a) => a.status === "failed").length;
	const retryInDays = policy.retryIntervalsDays[failedCharges - 1];
	const nextRetryAt = retryInDays === undefined ? undefined : addDays(now, retryInDays);
	const hasScheduled = attempts.some((a) => a.status === "scheduled");
	if (nextRetryAt !== undefined && !hasScheduled) {
		await ctx.db.insert("commerce_subscription_dunning_attempts", {
			subscriptionId: subscription._id,
			invoiceId: invoice._id,
			attemptNumber: failedCharges + 1,
			status: "scheduled",
			scheduledAt: nextRetryAt,
			createdAt: now,
			updatedAt: now,
		});
	}

	await ctx.db.patch("commerce_subscription_invoices", invoice._id, {
		status: "failed",
		paymentTransactionId: charge.paymentTransactionId,
		dueAt: nextRetryAt,
		updatedAt: now,
	});
	await ctx.runMutation(internal.purchases.internals.syncSubscriptionInvoice, {
		invoiceId: invoice._id,
		eventType: "subscription_invoice_payment_failed",
		metadata: {
			paymentTransactionId: charge.paymentTransactionId,
			failureCode: charge.failureCode,
			failureReason: charge.failureReason,
		},
	});

	let current = subscription;
	if (current.status !== "past_due" && canTransition(current.status, "past_due")) {
		current = await transitionSubscription(ctx, {
			subscription: current,
			toStatus: "past_due",
			reason: charge.failureReason ?? "payment_failed",
			correlationId,
		});
	}

	await writeHistory(ctx, {
		subscriptionId: subscription._id,
		eventType: "subscription.payment_failed",
		fromStatus: subscription.status,
		toStatus: current.status,
		reason: charge.failureReason,
		data: { invoiceId: invoice._id, failureCode: charge.failureCode, attemptNumber: failedCharges, nextRetryAt },
		correlationId,
	});
	await emitEvent(ctx, SUBSCRIPTION_EVENTS.PAST_DUE, "commerce", {
		subscriptionId: subscription._id,
		userId: subscription.userId,
		invoiceId: invoice._id,
		attemptNumber: failedCharges,
		maxAttempts: policy.retryIntervalsDays.length + 1,
		nextRetryAt,
	});

	if (nextRetryAt === undefined && policy.cancelAfterFinalFailure) {
		await transitionSubscription(ctx, {
			subscription: current,
			toStatus: "cancelled",
			reason: "dunning_exhausted",
			correlationId,
			patch: { cancelAtPeriodEnd: false },
			eventData: { invoiceId: invoice._id, attemptNumber: failedCharges },
		});
	}
	return { applied: true, outcome: "failed" };
}

/**
 * Record the outcome of one charge of a subscription invoice. Every path that
 * learns an outcome reports here (the charging action, the Stripe webhook, the
 * disabled-provider fallback), and the same charge may be reported more than
 * once, so this is idempotent: a paid invoice stays paid and a declined charge
 * is counted once by its PaymentIntent id.
 *
 * Success pays the invoice, advances the contract one period (once) and
 * restores access. Failure records the attempt, schedules the next retry from
 * the dunning policy, moves the contract to `past_due` (access to grace) and,
 * when retries are exhausted, cancels it.
 */
export const handleInvoicePaymentResult = internalMutation({
	args: {
		invoiceId: v.id("commerce_subscription_invoices"),
		succeeded: v.boolean(),
		paymentTransactionId: v.optional(v.string()),
		failureCode: v.optional(v.string()),
		failureReason: v.optional(v.string()),
		correlationId: v.optional(v.string()),
	},
	returns: paymentResultValidator,
	handler: async (ctx, args): Promise<PaymentResult> => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		return await applyPaymentResult(ctx, args);
	},
});

async function applyPaymentResult(
	ctx: MutationCtx,
	args: {
		invoiceId: Id<"commerce_subscription_invoices">;
		succeeded: boolean;
		paymentTransactionId?: string;
		failureCode?: string;
		failureReason?: string;
		correlationId?: string;
	},
): Promise<PaymentResult> {
	const now = Date.now();
	const correlationId = args.correlationId ?? createCorrelationId();
	const invoice = await ctx.db.get(args.invoiceId);
	if (!invoice) return ignored("invoice_not_found");
	const subscription = await ctx.db.get(invoice.subscriptionId);
	if (!subscription) return ignored("subscription_not_found");
	if (invoice.status === "paid") return ignored("already_paid");

	const charge: ChargeOutcome = {
		paymentTransactionId: args.paymentTransactionId,
		failureCode: args.failureCode,
		failureReason: args.failureReason,
	};
	return args.succeeded
		? await recordPaidInvoice(ctx, invoice, subscription, charge, correlationId, now)
		: await recordFailedCharge(ctx, invoice, subscription, charge, correlationId, now);
}

/**
 * The Stripe webhook's entry point for `subscription_invoice` PaymentIntents.
 * The invoice reference comes from PaymentIntent metadata, so it is resolved
 * here; a reference that names no invoice is acknowledged and ignored.
 */
export const recordStripeInvoicePayment = internalMutation({
	args: {
		invoiceRef: v.string(),
		succeeded: v.boolean(),
		paymentTransactionId: v.string(),
		failureCode: v.optional(v.string()),
		failureReason: v.optional(v.string()),
	},
	returns: paymentResultValidator,
	handler: async (ctx, args): Promise<PaymentResult> => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return ignored("plugin_disabled");
		const invoiceId = ctx.db.normalizeId("commerce_subscription_invoices", args.invoiceRef);
		if (!invoiceId) return ignored("invoice_not_found");
		return await applyPaymentResult(ctx, {
			invoiceId,
			succeeded: args.succeeded,
			paymentTransactionId: args.paymentTransactionId,
			failureCode: args.failureCode,
			failureReason: args.failureReason,
		});
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPIRATION SWEEP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * End contracts whose scheduled cancellation has been reached: pending_cancel
 * contracts whose paid period is over move to cancelled.
 */
export const expirePendingCancellations = internalMutation({
	args: {
		limit: v.optional(v.number()),
	},
	returns: v.object({ cancelledCount: v.number() }),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		const now = Date.now();
		const limit = args.limit ?? 100;

		const pendingCancel = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_status", (q) => q.eq("status", "pending_cancel"))
			.collect();

		let cancelledCount = 0;
		for (const subscription of pendingCancel) {
			if (cancelledCount >= limit) break;
			if (subscription.currentPeriodEndAt === undefined || subscription.currentPeriodEndAt > now) continue;
			await transitionSubscription(ctx, {
				subscription,
				toStatus: "cancelled",
				reason: "period_end_reached",
				correlationId: createCorrelationId(),
			});
			cancelledCount++;
		}

		return { cancelledCount };
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// GRACE EXPIRY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Persist the end of grace: entitlements whose `graceEndsAt` has passed move
 * from `grace` to `expired`, so the stored row says what access is and
 * reactive readers update when the window closes. A contract that recovers
 * reactivates them (`syncEntitlementsForStatus`); one that ends revokes them.
 * Bounded and indexed; registered in crons.ts.
 */
export const expireLapsedGrace = internalMutation({
	args: { limit: v.optional(v.number()) },
	returns: v.object({ expired: v.number() }),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return { expired: 0 };
		const now = Date.now();
		const lapsed = await ctx.db
			.query("commerce_subscription_entitlements")
			.withIndex("by_status_grace_ends", (q) => q.eq("status", "grace").lte("graceEndsAt", now))
			.take(args.limit ?? 200);
		for (const entitlement of lapsed) {
			await ctx.db.patch("commerce_subscription_entitlements", entitlement._id, {
				status: "expired",
				endsAt: entitlement.graceEndsAt,
				updatedAt: now,
			});
			await writeHistory(ctx, {
				subscriptionId: entitlement.subscriptionId,
				eventType: "subscription.entitlement_expired",
				reason: "grace_ended",
				data: { entitlementId: entitlement._id, entitlementCode: entitlement.entitlementCode, graceEndsAt: entitlement.graceEndsAt },
			});
			await emitEvent(ctx, SUBSCRIPTION_EVENTS.ENTITLEMENT_EXPIRED, "commerce", {
				subscriptionId: entitlement.subscriptionId,
				userId: entitlement.userId,
				entitlementCode: entitlement.entitlementCode,
				graceEndsAt: entitlement.graceEndsAt,
			});
		}
		return { expired: lapsed.length };
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// DUNNING RETRIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A claimed retry whose charging action died without reporting back is
 * claimable again after this long. The retry reuses its idempotency key.
 */
const CLAIM_STALE_AFTER_MS = 30 * 60 * 1000;

/** Retries due now, plus claimed retries that never reported back. */
export const getRetryableDunningAttempts = internalQuery({
	args: {
		limit: v.optional(v.number()),
	},
	returns: v.array(
		v.object({
			attemptId: v.id("commerce_subscription_dunning_attempts"),
			subscriptionId: v.id("commerce_subscriptions"),
			invoiceId: v.optional(v.id("commerce_subscription_invoices")),
			attemptNumber: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];
		const now = Date.now();
		const limit = args.limit ?? 100;

		const due = await ctx.db
			.query("commerce_subscription_dunning_attempts")
			.withIndex("by_status_scheduled_at", (q) => q.eq("status", "scheduled").lte("scheduledAt", now))
			.take(limit);
		const claimed = await ctx.db
			.query("commerce_subscription_dunning_attempts")
			.withIndex("by_status_scheduled_at", (q) => q.eq("status", "processing"))
			.take(limit);
		const stalled = claimed.filter((a) => (a.processedAt ?? a.updatedAt) <= now - CLAIM_STALE_AFTER_MS);

		return [...due, ...stalled].slice(0, limit).map((a) => ({
			attemptId: a._id,
			subscriptionId: a.subscriptionId,
			invoiceId: a.invoiceId,
			attemptNumber: a.attemptNumber,
		}));
	},
});

/**
 * Claim a retry for charging. Returns what to charge, or null when the retry
 * no longer applies; it is then closed with the reason (invoice already paid
 * or voided, contract ended or no longer past due). Two sweeps cannot both
 * claim the same retry: the claim and its checks run in one transaction.
 */
export const claimDunningAttempt = internalMutation({
	args: {
		attemptId: v.id("commerce_subscription_dunning_attempts"),
	},
	returns: v.union(
		v.null(),
		v.object({
			invoiceId: v.id("commerce_subscription_invoices"),
			attemptNumber: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		const now = Date.now();
		const attempt = await ctx.db.get(args.attemptId);
		if (!attempt) return null;
		const claimable =
			attempt.status === "scheduled"
				? attempt.scheduledAt <= now
				: attempt.status === "processing" && (attempt.processedAt ?? attempt.updatedAt) <= now - CLAIM_STALE_AFTER_MS;
		if (!claimable) return null;

		const close = async (reason: string) => {
			await ctx.db.patch("commerce_subscription_dunning_attempts", attempt._id, {
				status: "aborted",
				processedAt: now,
				errorMessage: reason,
				updatedAt: now,
			});
			return null;
		};

		const invoice = attempt.invoiceId ? await ctx.db.get(attempt.invoiceId) : null;
		if (!invoice) return await close("invoice_not_found");
		if (invoice.status === "paid") return await close("invoice_paid");
		if (invoice.status === "void") return await close("invoice_void");
		const subscription = await ctx.db.get(attempt.subscriptionId);
		if (!subscription) return await close("subscription_not_found");
		if (subscription.status !== "past_due") return await close(`subscription_${subscription.status}`);

		await ctx.db.patch("commerce_subscription_dunning_attempts", attempt._id, {
			status: "processing",
			processedAt: now,
			updatedAt: now,
		});
		return { invoiceId: invoice._id, attemptNumber: attempt.attemptNumber };
	},
});

/**
 * The `commerce.payments` values the subscription charging paths need, read
 * with defaults merged. Actions cannot read the database directly.
 */
export const getPaymentChargingSettings = internalQuery({
	args: {},
	returns: v.object({
		subscriptionChargingEnabled: v.boolean(),
		stripeSecretKey: v.optional(v.string()),
	}),
	handler: async (ctx) => {
		const values = await readMergedSettingsSection(ctx, "commerce.payments");
		const stripeSecretKey = values.stripeSecretKey;
		return {
			subscriptionChargingEnabled: values.subscriptionChargingEnabled === true,
			stripeSecretKey: typeof stripeSecretKey === "string" ? stripeSecretKey : undefined,
		};
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// CHARGING SUPPORT — INVOICE FETCH FOR ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The fields the charging action needs, and whether the invoice can be charged
 * at all: it must be unpaid and not voided, and its contract must not have
 * ended. Actions cannot read the database directly.
 */
export const getInvoiceForRenewal = internalQuery({
	args: {
		invoiceId: v.id("commerce_subscription_invoices"),
	},
	returns: v.union(
		v.null(),
		v.object({
			_id: v.id("commerce_subscription_invoices"),
			status: commerceSubscriptionInvoiceStatusValidator,
			payable: v.boolean(),
			totalAmount: v.number(),
			currencyCode: v.string(),
			savedPaymentMethodId: v.optional(v.string()),
			stripeCustomerId: v.optional(v.string()),
			subscriptionId: v.id("commerce_subscriptions"),
			manualBilling: v.optional(v.boolean()),
			email: v.optional(v.string()),
		}),
	),
	handler: async (ctx, args) => {
		const invoice = await ctx.db.get(args.invoiceId);
		if (!invoice) return null;
		const subscription = await ctx.db.get(invoice.subscriptionId);
		const user = subscription?.userId ? await ctx.db.get(subscription.userId) : null;
		const payable =
			(invoice.status === "open" || invoice.status === "failed") &&
			subscription !== null &&
			!isEnded(subscription.status);
		return {
			_id: invoice._id,
			status: invoice.status,
			payable,
			totalAmount: invoice.totalAmount,
			currencyCode: invoice.currencyCode,
			savedPaymentMethodId: subscription?.defaultPaymentMethodId ?? invoice.savedPaymentMethodId,
			stripeCustomerId: subscription?.stripeCustomerId,
			subscriptionId: invoice.subscriptionId,
			manualBilling: invoice.manualBilling,
			email: user?.email,
		};
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL QUERIES — CHECKOUT INTENT LOOKUP FOR CHARGING (Wave 9.1)
// ═══════════════════════════════════════════════════════════════════════════

export const getCheckoutIntentForCharge = internalQuery({
	args: {
		checkoutIntentId: v.id("commerce_subscription_checkout_intents"),
	},
	returns: v.union(v.null(), v.object({
   _id: v.id("commerce_subscription_checkout_intents"),
   email: v.optional(v.string()),
   initialAmount: v.number(),
   recurringAmount: v.number(),
   currencyCode: v.string(),
   userId: v.optional(v.id("users")),
   status: v.union(v.literal("draft"), v.literal("failed"), v.literal("expired"), v.literal("payment_pending"), v.literal("approval_pending"), v.literal("activated"), v.literal("payment_succeeded")),
 })),
	handler: async (ctx, args) => {
		const intent = await ctx.db.get(args.checkoutIntentId);
		if (!intent) return null;
		// Re-checked before the card is charged: the customer may have bought the
		// same access since this checkout started.
		const offerId = intent.selectedOfferIds?.[0];
		const offer = offerId ? await ctx.db.get(offerId) : null;
		if (offer && (intent.status === "payment_pending" || intent.status === "draft")) {
			await assertNotAlreadySubscribed(ctx, offer, { userId: intent.userId, email: intent.userId ? undefined : intent.email });
		}
		return {
			_id: intent._id,
			email: intent.email,
			initialAmount: intent.initialAmount,
			recurringAmount: intent.recurringAmount,
			currencyCode: intent.currencyCode,
			userId: intent.userId,
			status: intent.status,
		};
	},
});

export const getCheckoutIntentByPaymentIntent: RegisteredQuery<"internal", { paymentIntentId: string }, Doc<"commerce_subscription_checkout_intents"> | null> = internalQuery({
	args: {
		paymentIntentId: v.string(),
	},
	returns: v.union(v.null(), commerceSubscriptionsDocs.commerce_subscription_checkout_intents),
	handler: async (ctx, args) => {
		const intent = await ctx.db
			.query("commerce_subscription_checkout_intents")
			.filter((q) =>
				q.eq(q.field("paymentTransactionId"), args.paymentIntentId),
			)
			.first();
		return intent;
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS — FIRST-CHARGE INTENT RECORDING (Wave 9.1)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Record the Stripe Customer + PaymentIntent IDs created during signup on
 * the checkout intent row so the webhook can match and activate later.
 */
export const recordFirstChargeIntent = internalMutation({
	args: {
		checkoutIntentId: v.id("commerce_subscription_checkout_intents"),
		stripeCustomerId: v.string(),
		paymentIntentId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch("commerce_subscription_checkout_intents", args.checkoutIntentId, {
			stripeCustomerId: args.stripeCustomerId,
			paymentProvider: "stripe",
			paymentTransactionId: args.paymentIntentId,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Resolve the checkout intent a Stripe object names in its metadata. The id
 * arrives as text from Stripe, so it is normalized rather than cast; a
 * signed event naming no intent of ours is a reconciliation failure the
 * webhook must surface, not swallow.
 */
function requireCheckoutIntentRef(
	ctx: MutationCtx,
	checkoutIntentRef: string,
): Id<"commerce_subscription_checkout_intents"> {
	const intentId = ctx.db.normalizeId(
		"commerce_subscription_checkout_intents",
		checkoutIntentRef,
	);
	if (!intentId) {
		throw new ConvexError({
			code: "NOT_FOUND",
			message: `Stripe metadata names unknown checkout intent "${checkoutIntentRef}".`,
		});
	}
	return intentId;
}

/**
 * Activate a checkout intent from a Stripe PaymentIntent (metadata.kind
 * `subscription_first_charge`) the server has verified: a signature-verified
 * `payment_intent.succeeded` webhook event, or a PaymentIntent
 * `publicCharge.confirmFirstCharge` retrieved from Stripe. Both callers use
 * this one path. Passes the PaymentIntent's own status, amount, currency and
 * metadata to the internal activation, which checks them against the
 * server-computed intent; an activated intent returns its existing contract.
 */
export const activateCheckoutIntentFromStripe = internalMutation({
	args: {
		checkoutIntentRef: v.string(),
		paymentIntentId: v.string(),
		paymentIntentStatus: v.string(),
		amountReceived: v.number(),
		currency: v.string(),
		paymentMethodId: v.optional(v.string()),
		stripeCustomerId: v.optional(v.string()),
	},
	returns: activationResultValidator,
	handler: async (ctx, args): Promise<ActivationResult> => {
		const intentId = requireCheckoutIntentRef(ctx, args.checkoutIntentRef);
		if (args.paymentIntentStatus !== "succeeded") {
			throw new ConvexError({
				code: "PAYMENT_MISMATCH",
				message: `PaymentIntent ${args.paymentIntentId} is "${args.paymentIntentStatus}", not succeeded.`,
			});
		}
		return await ctx.runMutation(internal.commerceSubscriptions.checkout.activateFromIntent, {
			intentId,
			settlement: {
				kind: "payment_intent",
				paymentIntentId: args.paymentIntentId,
				status: "succeeded",
				amountReceived: args.amountReceived,
				currency: args.currency,
				checkoutIntentRef: args.checkoutIntentRef,
				paymentMethodId: args.paymentMethodId,
				stripeCustomerId: args.stripeCustomerId,
			},
		});
	},
});

/**
 * Activate a paid-recurring, zero-initial checkout from a verified Stripe
 * SetupIntent (metadata.kind `subscription_setup`): a signature-verified
 * `setup_intent.succeeded` event, or a SetupIntent `confirmFirstCharge`
 * retrieved from Stripe (both via `stripeCharge.saveSetupIntentResult`).
 * This covers trials and $0 initial invoices where there is no first charge,
 * but a reusable payment method is still required for renewal. The internal
 * activation refuses a SetupIntent for an intent that charges now.
 */
export const activateCheckoutIntentFromStripeSetup = internalMutation({
	args: {
		checkoutIntentRef: v.string(),
		setupIntentId: v.string(),
		paymentMethodId: v.string(),
		stripeCustomerId: v.string(),
	},
	returns: activationResultValidator,
	handler: async (ctx, args): Promise<ActivationResult> => {
		const intentId = requireCheckoutIntentRef(ctx, args.checkoutIntentRef);
		return await ctx.runMutation(internal.commerceSubscriptions.checkout.activateFromIntent, {
			intentId,
			settlement: {
				kind: "setup_intent",
				setupIntentId: args.setupIntentId,
				status: "succeeded",
				checkoutIntentRef: args.checkoutIntentRef,
				paymentMethodId: args.paymentMethodId,
				stripeCustomerId: args.stripeCustomerId,
			},
		});
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS — SAVED PAYMENT METHOD PERSISTENCE (Wave 9)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Attach a Stripe Customer + PaymentMethod pair to a checkout intent.
 * Called from the `setup_intent.succeeded` webhook path. Idempotent:
 * running twice with the same payload leaves the intent in the same state.
 */
export const recordSavedPaymentMethod = internalMutation({
	args: {
		checkoutIntentRef: v.string(),
		stripeCustomerId: v.string(),
		paymentMethodId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const intentId = ctx.db.normalizeId(
			"commerce_subscription_checkout_intents",
			args.checkoutIntentRef,
		);
		const intent = intentId ? await ctx.db.get(intentId) : null;
		if (!intent) return null;
		await ctx.db.patch("commerce_subscription_checkout_intents", intent._id, {
			savedPaymentMethodId: args.paymentMethodId,
			stripeCustomerId: args.stripeCustomerId,
			paymentProvider: "stripe",
			updatedAt: Date.now(),
		});
		// If the intent has already been activated into a subscription, also
		// persist the Stripe IDs on the contract so renewals can charge.
		if (intent.subscriptionId) {
			const sub = await ctx.db.get(intent.subscriptionId);
			if (sub) {
				await ctx.db.patch("commerce_subscriptions", intent.subscriptionId, {
					defaultPaymentMethodId:
						sub.defaultPaymentMethodId ?? args.paymentMethodId,
					stripeCustomerId: sub.stripeCustomerId ?? args.stripeCustomerId,
					paymentProvider: "stripe",
					updatedAt: Date.now(),
				});
			}
		}
		return null;
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULED OFFER CHANGES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply scheduled offer changes (downgrades) whose `effectiveAt` has passed,
 * before the renewal invoice for the new period is created, so that invoice
 * bills the new offer.
 */
async function applyDueOfferChanges(ctx: MutationCtx): Promise<{ applied: number }> {
	const now = Date.now();
	let applied = 0;
	for (const status of RENEWABLE) {
		const rows = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_status", (q) => q.eq("status", status))
			.collect();
		for (const subscription of rows) {
			const change = subscription.scheduledOfferChange;
			if (!change || change.effectiveAt > now) continue;
			const toOffer = await ctx.db.get(change.toOfferId);
			if (!toOffer) {
				await ctx.db.patch("commerce_subscriptions", subscription._id, { scheduledOfferChange: undefined, updatedAt: now });
				await writeHistory(ctx, {
					subscriptionId: subscription._id,
					eventType: "subscription.scheduled_offer_change_dropped",
					reason: "offer_missing",
					data: { toOfferId: change.toOfferId },
				});
				continue;
			}
			const entitlements = await swapToOffer(ctx, subscription, toOffer, "scheduled_downgrade_applied", now);
			await writeHistory(ctx, {
				subscriptionId: subscription._id,
				eventType: "subscription.scheduled_offer_change_applied",
				fromStatus: subscription.status,
				toStatus: subscription.status,
				data: { toOfferId: toOffer._id, scheduledEffectiveAt: change.effectiveAt, appliedAt: now, ...entitlements },
			});
			applied++;
		}
	}
	return { applied };
}

export const applyDueScheduledOfferChanges = internalMutation({
  args: {},
  returns: v.object({ applied: v.number() }),
  handler: applyDueOfferChanges,
});

// ═══════════════════════════════════════════════════════════════════════════
// PORTAL SUPPORT — INVOICE PDF DATA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch the data needed to render a customer-facing invoice document.
 *
 * Used by `portal.getInvoicePdf` (an action — actions can't read the DB
 * directly, so this internal query gathers every row the renderer needs and
 * returns them in a single payload).
 *
 * Enforces the SAME ownership check as the public portal surface: the
 * caller's Convex auth identity is resolved to a users row, and that user
 * must own the invoice's subscription. Returns `null` for any failure — the
 * action surfaces a NOT_FOUND to the customer.
 *
 * Admin fetches should use the admin `queries.getInvoice` path instead — this
 * is strictly for customer self-serve downloads.
 */
export const getMyInvoiceForPdf = internalQuery({
	args: {
		invoiceId: v.id("commerce_subscription_invoices"),
	},
	returns: v.union(v.null(), v.object({
   invoice: commerceSubscriptionsDocs.commerce_subscription_invoices,
   items: v.array(commerceSubscriptionsDocs.commerce_subscription_invoice_items),
   subscription: v.object({
     _id: v.id("commerce_subscriptions"),
     status: v.union(v.literal("draft"), v.literal("active"), v.literal("cancelled"), v.literal("expired"), v.literal("paused"), v.literal("trialing"), v.literal("past_due"), v.literal("pending_cancel")),
   }),
   offerTitle: v.optional(v.string()),
   siteTitle: v.string(),
   customerEmail: v.optional(v.string()),
 })),
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;

		// Resolve the caller exactly like the portal (issuer rules included).
		// Never match a token subject or email claim against users directly:
		// another trusted issuer could present the same subject or email.
		const user = await getCurrentUser(ctx);
		if (!user || user.status !== "active") return null;

		const invoice = await ctx.db.get(args.invoiceId);
		if (!invoice) return null;

		const subscription = await ctx.db.get(invoice.subscriptionId);
		if (!subscription) return null;
		if (subscription.userId !== user._id) return null;

		const items = await ctx.db
			.query("commerce_subscription_invoice_items")
			.withIndex("by_invoice", (q) => q.eq("invoiceId", args.invoiceId))
			.collect();

		// Resolve the current offer title (via the active subscription_item) so
		// the "Plan: …" line shows something human-readable.
		let offerTitle: string | undefined;
		const subItems = await ctx.db
			.query("commerce_subscription_items")
			.withIndex("by_subscription", (q) =>
				q.eq("subscriptionId", subscription._id),
			)
			.collect();
		const activeItem =
			subItems.find((it) => it.status === "active") ??
			subItems.find((it) => it.status === "pending_cancel") ??
			subItems[subItems.length - 1];
		if (activeItem?.sourceOfferId) {
			const offer = await ctx.db.get(activeItem.sourceOfferId);
			if (offer) {
				offerTitle = offer.title;
			}
		}

		const general = await readMergedSettingsSection(ctx, "general");
		const siteTitle = typeof general.siteTitle === "string" && general.siteTitle.trim().length > 0 ? general.siteTitle.trim() : "Invoice";

		return {
			invoice,
			items,
			subscription: {
				_id: subscription._id,
				status: subscription.status,
			},
			offerTitle,
			siteTitle,
			customerEmail: user.email,
		};
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// TRIAL ENDING NOTIFIER (Wave 10.2)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Scan for trialing subscriptions whose trial ends in ~3 days and emit
 * `commerce.subscription_trial_ending` once. Idempotent via a marker on
 * the subscription's sourceMetadata (`trialEndingEmailSent`).
 */
export const emitTrialEndingEvents = internalMutation({
	args: {},
	returns: v.object({ emitted: v.number() }),
	handler: async (ctx) => {
		const now = Date.now();
		const threeDays = 3 * 24 * 60 * 60 * 1000;
		const fourDays = 4 * 24 * 60 * 60 * 1000;

		const trialing = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_status", (q) => q.eq("status", "trialing"))
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
			await ctx.db.patch("commerce_subscriptions", sub._id, {
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

// ═══════════════════════════════════════════════════════════════════════════
// RENEWAL NOTICE
// ═══════════════════════════════════════════════════════════════════════════

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long before a yearly (or longer) plan renews its customer is told.
 * Automatic-renewal laws (California's, for one) ask for notice 15 to 45 days
 * before a term of a year or more renews; 30 days sits inside that. */
export const RENEWAL_NOTICE_DAYS = 30;

/** Whether a billing period is a year or longer. Shorter plans are told at
 * each charge, by its receipt. */
export function billedYearlyOrLonger(
	interval: Doc<"commerce_subscriptions">["billingInterval"],
	count: number | undefined,
): boolean {
	const n = count && count > 0 ? count : 1;
	switch (interval) {
		case "year":
			return true;
		case "month":
			return n >= 12;
		case "week":
			return n >= 52;
		case "day":
			return n >= 365;
		default:
			return false;
	}
}

/**
 * Emit `commerce.subscription_renewal_upcoming` for each active yearly (or
 * longer) contract that renews in about RENEWAL_NOTICE_DAYS, once per renewal.
 * The daily sweep reads a two-day window, so one missed day still sends. The
 * contract records the renewal it was told about
 * (`sourceMetadata.renewalNoticeFor`): a changed renewal date is told again,
 * the same one never twice. A contract set to cancel, paused, or still in its
 * trial (the trial notice covers that) isn't renewing and gets none.
 */
export const emitRenewalUpcomingEvents = internalMutation({
	args: {},
	returns: v.object({ emitted: v.number() }),
	handler: async (ctx) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return { emitted: 0 };
		const now = Date.now();
		const due = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_nextBillingAt", (q) =>
				q.gt("nextBillingAt", now + (RENEWAL_NOTICE_DAYS - 2) * DAY_MS).lte("nextBillingAt", now + RENEWAL_NOTICE_DAYS * DAY_MS),
			)
			.collect();

		let emitted = 0;
		for (const sub of due) {
			if (sub.status !== "active" || sub.cancelAtPeriodEnd || sub.nextBillingAt === undefined) continue;
			if (!billedYearlyOrLonger(sub.billingInterval, sub.billingIntervalCount)) continue;
			if (sub.sourceMetadata?.renewalNoticeFor === sub.nextBillingAt) continue;

			await emitEvent(ctx, SUBSCRIPTION_EVENTS.RENEWAL_UPCOMING, "commerce", {
				subscriptionId: sub._id,
				userId: sub.userId,
				renewsAt: sub.nextBillingAt,
			});
			await ctx.db.patch("commerce_subscriptions", sub._id, {
				sourceMetadata: { ...(sub.sourceMetadata ?? {}), renewalNoticeFor: sub.nextBillingAt },
				updatedAt: now,
			});
			emitted++;
		}
		return { emitted };
	},
});
