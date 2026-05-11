/**
 * Commerce Subscriptions — Internal Functions
 *
 * Ported from VexCart subscriptions.ts internal mutations, adapted to ConvexPress
 * schema (commerce_subscription_* tables).
 *
 * These are NOT client-callable — invoked by actions, schedulers, or other internal functions.
 *
 * Functions:
 *   - createDueInvoices           Generate invoices for subscriptions due for billing
 *   - handleInvoicePaymentResult  Process payment success/failure for an invoice
 *   - expirePendingCancellations  Expire subscriptions that reached their cancel-at date
 *   - processScheduledDunning     Process a single scheduled dunning attempt
 */

import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import { emitEvent } from "../helpers/events";
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";
import { decideBridgeCall } from "./bridgeDecisions";

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS (duplicated for internal module isolation)
// ═══════════════════════════════════════════════════════════════════════════

type BillingInterval = "day" | "week" | "month" | "year";
type SubscriptionStatus =
	| "draft"
	| "trialing"
	| "active"
	| "past_due"
	| "paused"
	| "pending_cancel"
	| "cancelled"
	| "expired";

const STATUS_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
	draft: ["trialing", "active", "cancelled"],
	trialing: [
		"active",
		"past_due",
		"paused",
		"pending_cancel",
		"cancelled",
		"expired",
	],
	active: ["past_due", "paused", "pending_cancel", "cancelled", "expired"],
	past_due: ["active", "paused", "pending_cancel", "cancelled", "expired"],
	paused: ["active", "pending_cancel", "cancelled", "expired"],
	pending_cancel: ["active", "cancelled", "expired"],
	cancelled: [],
	expired: [],
};

const DEFAULT_DUNNING_POLICY = {
	maxAttempts: 3,
	retryIntervalsDays: [1, 3, 7],
	cancelAfterFinalFailure: true,
};

function canTransition(
	from: SubscriptionStatus,
	to: SubscriptionStatus,
): boolean {
	return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

function addDays(timestamp: number, days: number): number {
	return timestamp + days * 24 * 60 * 60 * 1000;
}

function addBillingPeriod(
	timestamp: number,
	interval: BillingInterval,
	intervalCount: number,
): number {
	const date = new Date(timestamp);
	if (interval === "day") {
		date.setDate(date.getDate() + intervalCount);
		return date.getTime();
	}
	if (interval === "week") {
		date.setDate(date.getDate() + 7 * intervalCount);
		return date.getTime();
	}
	if (interval === "month") {
		date.setMonth(date.getMonth() + intervalCount);
		return date.getTime();
	}
	date.setFullYear(date.getFullYear() + intervalCount);
	return date.getTime();
}

function createCorrelationId(): string {
	return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function resolveEffectiveConfig(
	ctx: any,
	product: any,
	templateId?: any,
) {
	const override = await ctx.db
		.query("commerce_product_subscription_overrides")
		.withIndex("by_product", (q: any) => q.eq("productId", product._id))
		.first();

	let template: any = null;
	const configuredTemplateId = templateId ?? override?.templateId ?? undefined;
	if (configuredTemplateId) {
		template = await ctx.db.get(configuredTemplateId);
	}

	return {
		gracePeriodDays:
			override?.overrideGracePeriodDays ?? template?.gracePeriodDays ?? 3,
		dunningPolicy: DEFAULT_DUNNING_POLICY,
	};
}

async function allocateInvoiceNumber(ctx: any): Promise<string> {
	const doc = await ctx.db
		.query("settings")
		.withIndex("by_section", (q: any) =>
			q.eq("section", "commerce.subscriptions.counters"),
		)
		.unique();
	const values = (doc?.values ?? {}) as {
		invoiceCounter?: number;
		invoicePrefix?: string;
	};
	const nextCounter = (values.invoiceCounter ?? 0) + 1;
	const prefix = values.invoicePrefix ?? "INV-";
	const formatted = `${prefix}${String(nextCounter).padStart(6, "0")}`;

	const now = Date.now();
	if (doc) {
		await ctx.db.patch(doc._id, {
			values: { ...values, invoiceCounter: nextCounter },
			updatedAt: now,
		});
	}
	// Note: if the settings row doesn't exist yet, we skip creation here —
	// it gets created lazily on the first successful settings.update_* mutation
	// via the standard defaults-first merge. Returning the counter without a
	// persisted row would drift; in practice the admin configures this once.
	return formatted;
}

async function writeHistory(ctx: any, args: any) {
	await ctx.db.insert("commerce_subscription_history", {
		subscriptionId: args.subscriptionId,
		eventType: args.eventType,
		message: args.message ?? args.eventType,
		actorUserId: args.actorUserId,
		metadata: {
			fromStatus: args.fromStatus,
			toStatus: args.toStatus,
			reason: args.reason,
			data: args.data,
			correlationId: args.correlationId,
		},
		createdAt: Date.now(),
	});
}

/**
 * Returns true iff both the commerce-subscriptions and membership plugins are
 * enabled AND `membership.acceptSubscriptionGrants` is not explicitly false.
 *
 * This gates the subscription → membership bridge call in
 * `syncEntitlementsForStatus`. When this returns false, status transitions
 * proceed normally but do NOT propagate to membership grants.
 */
async function isBridgeEnabled(ctx: any): Promise<boolean> {
	const commerceOn = await isPluginEnabled(ctx, "commerceSubscriptions");
	if (!commerceOn) return false;
	const membershipOn = await isPluginEnabled(ctx, "membership");
	if (!membershipOn) return false;

	// Check membership.acceptSubscriptionGrants — defaults to true if unset.
	// If the admin explicitly disabled the auto-grant flow, we silently skip.
	try {
		const settingsRow = await ctx.db
			.query("settings")
			.withIndex("by_section", (q: any) =>
				q.eq("section", "membership.general"),
			)
			.unique();
		const values = (settingsRow?.values ?? {}) as Record<string, unknown>;
		if (values.acceptSubscriptionGrants === false) return false;
	} catch {
		// Settings read failure should not block bridge; fall through to enabled.
	}
	return true;
}

async function syncEntitlementsForStatus(
	ctx: any,
	subscription: any,
	now: number,
	gracePeriodDays = 3,
) {
	const entitlements = await ctx.db
		.query("commerce_subscription_entitlements")
		.withIndex("by_subscription", (q: any) =>
			q.eq("subscriptionId", subscription._id),
		)
		.collect();

	for (const entitlement of entitlements) {
		if (
			subscription.status === "active" ||
			subscription.status === "trialing"
		) {
			await ctx.db.patch(entitlement._id, {
				status: "active",
				endsAt: undefined,
				updatedAt: now,
			});
		} else if (
			subscription.status === "past_due" ||
			subscription.status === "paused"
		) {
			await ctx.db.patch(entitlement._id, {
				status: "grace",
				graceEndsAt: addDays(now, gracePeriodDays),
				updatedAt: now,
			});
		} else if (
			subscription.status === "cancelled" ||
			subscription.status === "expired"
		) {
			await ctx.db.patch(entitlement._id, {
				status: "revoked",
				endsAt: now,
				updatedAt: now,
			});
		}
	}

	// ── Bridge: propagate status to membership grants ─────────────────────────
	// Soft-gated by `isBridgeEnabled` — plugin flags + acceptSubscriptionGrants.
	// Each entitlement's bridge call is isolated: one failure MUST NOT block the
	// rest of the loop or the status transition itself.
	const bridgeEnabled = await isBridgeEnabled(ctx);
	if (!bridgeEnabled) return;

	for (const entitlement of entitlements) {
		const decision = decideBridgeCall({
			subscription,
			entitlement,
			gracePeriodDays,
		});
		if (decision.action === "noop") continue;

		try {
			if (decision.action === "grant") {
				await ctx.runMutation(
					internal.membership.internals.grantFromSubscription,
					decision.args,
				);
			} else if (decision.action === "moveToGrace") {
				await ctx.runMutation(
					internal.membership.internals.moveGrantToGrace,
					decision.args,
				);
			} else if (decision.action === "revoke") {
				await ctx.runMutation(
					internal.membership.internals.revokeFromSubscription,
					decision.args,
				);
			}
		} catch (err) {
			const subscriptionId = String(subscription._id);
			const code = entitlement.entitlementCode ?? "(no-code)";
			console.error(
				`[bridge] membership propagation failed for subscription ${subscriptionId}, ` +
					`entitlement ${code}: ${err instanceof Error ? err.message : String(err)}`,
			);
			// Record to subscription history so the failure is auditable without
			// re-throwing. `writeHistory` does not throw.
			try {
				await writeHistory(ctx, {
					subscriptionId: subscription._id,
					eventType: "subscription.bridge_failed",
					message: `Membership bridge call failed for entitlement ${code}`,
					fromStatus: subscription.status,
					toStatus: subscription.status,
					reason: "bridge_error",
					data: {
						entitlementCode: code,
						action: decision.action,
						error: err instanceof Error ? err.message : String(err),
					},
				});
			} catch {
				// history write failure is non-fatal
			}
			// Continue loop — one entitlement's failure must not block others.
		}
	}
}

async function transitionSubscription(ctx: any, args: any) {
	const now = Date.now();
	if (args.subscription.status === args.toStatus) return args.subscription;

	if (!canTransition(args.subscription.status, args.toStatus)) {
		throw new Error(
			`Invalid status transition: ${args.subscription.status} -> ${args.toStatus}`,
		);
	}

	const patch: Record<string, unknown> = {
		status: args.toStatus,
		updatedAt: now,
		...args.patch,
	};

	if (args.toStatus === "cancelled" || args.toStatus === "expired") {
		patch.cancelledAt = now;
	}

	await ctx.db.patch(args.subscription._id, patch);
	const updated = await ctx.db.get(args.subscription._id);
	if (!updated) throw new Error("Subscription not found after transition");

	await writeHistory(ctx, {
		subscriptionId: updated._id,
		eventType: "subscription.status_changed",
		actorUserId: args.actorUserId,
		fromStatus: args.subscription.status,
		toStatus: args.toStatus,
		reason: args.reason,
		data: { patch },
		correlationId: args.correlationId,
	});

	const product = updated.productId
		? await ctx.db.get(updated.productId)
		: null;
	if (product) {
		const config = await resolveEffectiveConfig(
			ctx,
			product,
			updated.templateId,
		);
		await syncEntitlementsForStatus(
			ctx,
			updated,
			now,
			config.gracePeriodDays ?? 3,
		);
	}

	// Wave 10.2: emit lifecycle events for email subscribers.
	if (args.toStatus === "paused") {
		await emitEvent(ctx, "commerce.subscription_paused", "commerce", {
			subscriptionId: updated._id,
			userId: updated.userId,
		});
	} else if (args.toStatus === "cancelled") {
		await emitEvent(ctx, "commerce.subscription_cancelled", "commerce", {
			subscriptionId: updated._id,
			userId: updated.userId,
			reason: args.reason,
		});
	}

	return updated;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get subscriptions due for billing (used by renewal action).
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const getDueSubscriptions = internalQuery({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		limit: v.optional(v.number()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];
		const now = Date.now();
		const limit = args.limit ?? 50;

		const active = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_status", (q: any) => q.eq("status", "active"))
			.collect();
		const trialing = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_status", (q: any) => q.eq("status", "trialing"))
			.collect();

		return [...active, ...trialing]
			.filter(
				(sub: any) => (sub.nextBillingAt ?? Number.MAX_SAFE_INTEGER) <= now,
			)
			.slice(0, limit);
	},
});

/**
 * Get failed invoices due for retry (used by dunning action).
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const getRetryableInvoices = internalQuery({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		limit: v.optional(v.number()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;
		const now = Date.now();
		const limit = args.limit ?? 100;

		const failedInvoices = await ctx.db
			.query("commerce_subscription_invoices")
			.withIndex("by_status", (q: any) => q.eq("status", "failed"))
			.collect();

		return failedInvoices
			.filter((inv: any) => inv.dueAt !== undefined && inv.dueAt <= now)
			.slice(0, limit);
	},
});

// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const checkEntitlementForUser = internalQuery({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		userId: v.id("users"),
		entitlementCode: v.string(),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) {
			return { hasEntitlement: false, entitlement: null };
		}

		const activeEntitlements = await ctx.db
			.query("commerce_subscription_entitlements")
			.withIndex("by_user_status", (q: any) =>
				q.eq("userId", args.userId).eq("status", "active"),
			)
			.collect();

		const active = activeEntitlements.find(
			(e: any) => e.entitlementCode === args.entitlementCode,
		);
		if (active) {
			return { hasEntitlement: true, entitlement: active };
		}

		const graceEntitlements = await ctx.db
			.query("commerce_subscription_entitlements")
			.withIndex("by_user_status", (q: any) =>
				q.eq("userId", args.userId).eq("status", "grace"),
			)
			.collect();

		const grace = graceEntitlements.find(
			(e: any) => e.entitlementCode === args.entitlementCode,
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
// INTERNAL MUTATIONS — INVOICE GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create invoices for subscriptions that are due for billing.
 * Called by the renewal action on a schedule.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const createDueInvoices = internalMutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		limit: v.optional(v.number()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		const now = Date.now();
		const limit = args.limit ?? 50;

		const active = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_status", (q: any) => q.eq("status", "active"))
			.collect();
		const trialing = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_status", (q: any) => q.eq("status", "trialing"))
			.collect();

		const dueSubscriptions = [...active, ...trialing]
			.filter(
				(sub: any) => (sub.nextBillingAt ?? Number.MAX_SAFE_INTEGER) <= now,
			)
			.slice(0, limit);

		const createdInvoiceIds: any[] = [];

		for (const subscription of dueSubscriptions) {
			// Skip if there's already an open/draft invoice
			const existingInvoices = await ctx.db
				.query("commerce_subscription_invoices")
				.withIndex("by_subscription", (q: any) =>
					q.eq("subscriptionId", subscription._id),
				)
				.collect();
			const hasOpen = existingInvoices.some(
				(inv: any) => inv.status === "open" || inv.status === "draft",
			);
			if (hasOpen) continue;

			const subtotalAmount = subscription.recurringAmount ?? 0;
			const taxAmount = 0;
			const totalAmount = subtotalAmount + taxAmount;

			const invoiceNumber = await allocateInvoiceNumber(ctx);

			const invoiceId = await ctx.db.insert("commerce_subscription_invoices", {
				subscriptionId: subscription._id,
				checkoutIntentId: subscription.sourceCheckoutIntentId,
				sourceChannel: subscription.sourceChannel,
				status: "open",
				invoiceNumber,
				currencyCode: subscription.currencyCode,
				subtotalAmount,
				taxAmount,
				totalAmount,
				paymentProvider: subscription.paymentProvider,
				paymentTransactionId: undefined,
				savedPaymentMethodId: subscription.defaultPaymentMethodId,
				manualBilling: subscription.manualBilling,
				dueAt: now,
				paidAt: undefined,
				createdAt: now,
				updatedAt: now,
			});

			// Create invoice line items from subscription items
			const items = await ctx.db
				.query("commerce_subscription_items")
				.withIndex("by_subscription", (q: any) =>
					q.eq("subscriptionId", subscription._id),
				)
				.collect();

			for (const item of items) {
				await ctx.db.insert("commerce_subscription_invoice_items", {
					invoiceId,
					subscriptionItemId: item._id,
					description: "Recurring subscription charge",
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

			createdInvoiceIds.push(invoiceId);
		}

		return {
			createdCount: createdInvoiceIds.length,
			invoiceIds: createdInvoiceIds,
		};
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// PRORATION ITEM-SWAP HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply the deferred item swap for a successful proration invoice. Called
 * from `handleInvoicePaymentResult` when the invoice has a prorationEventId
 * and the payment succeeded. Mirrors the synchronous swap that the stub
 * path performs inside `applyUpgradeProration`.
 */
async function applyProrationItemSwap(
	ctx: any,
	invoice: any,
	subscription: any,
	paymentTransactionId: string | undefined,
	correlationId: string,
): Promise<void> {
	const now = Date.now();

	const prorationEvent = invoice.prorationEventId
		? await ctx.db.get(invoice.prorationEventId)
		: null;
	if (!prorationEvent) {
		// Event was deleted; just mark invoice paid and exit.
		await ctx.db.patch(invoice._id, {
			status: "paid",
			paidAt: now,
			paymentTransactionId,
			updatedAt: now,
		});
		return;
	}

	const toOffer = await ctx.db.get(prorationEvent.toOfferId);
	const fromOffer = await ctx.db.get(prorationEvent.fromOfferId);
	if (!toOffer || !fromOffer) {
		await ctx.db.patch(invoice._id, {
			status: "paid",
			paidAt: now,
			paymentTransactionId,
			updatedAt: now,
		});
		return;
	}

	// Mark invoice paid.
	await ctx.db.patch(invoice._id, {
		status: "paid",
		paidAt: now,
		paymentTransactionId,
		updatedAt: now,
	});

	// Find the active item to cancel.
	const items = await ctx.db
		.query("commerce_subscription_items")
		.withIndex("by_subscription", (q: any) =>
			q.eq("subscriptionId", subscription._id),
		)
		.collect();
	const activeItem = items.find((i: any) => i.status === "active");
	if (activeItem) {
		await ctx.db.patch(activeItem._id, {
			status: "cancelled",
			cancelledAt: now,
			updatedAt: now,
		});
	}

	// Resolve billing interval (template first, contract fallback).
	let billingInterval: BillingInterval = "month";
	let billingIntervalCount = 1;
	if (subscription.templateId) {
		const template = await ctx.db.get(subscription.templateId);
		if (template) {
			billingInterval = template.billingInterval as BillingInterval;
			billingIntervalCount = template.billingIntervalCount;
		}
	}
	if (subscription.billingInterval) {
		billingInterval = subscription.billingInterval as BillingInterval;
	}
	if (subscription.billingIntervalCount) {
		billingIntervalCount = subscription.billingIntervalCount;
	}

	const newCycleStart = now;
	const newCycleEnd = addBillingPeriod(
		newCycleStart,
		billingInterval,
		billingIntervalCount,
	);
	const currencyCode =
		invoice.currencyCode ?? subscription.currencyCode ?? "USD";

	// Insert new active item for the target offer.
	await ctx.db.insert("commerce_subscription_items", {
		subscriptionId: subscription._id,
		sourceOfferId: toOffer._id,
		productId: toOffer.productId,
		variantId: toOffer.variantId,
		bundleId: toOffer.bundleId,
		titleSnapshot: toOffer.title,
		quantity: 1,
		unitAmount: toOffer.recurringAmount ?? 0,
		unitRecurringAmount: toOffer.recurringAmount ?? 0,
		unitSetupFeeAmount: toOffer.setupFeeAmount ?? 0,
		currencyCode,
		status: "active",
		startsAt: now,
		currentPeriodEndAt: newCycleEnd,
		cancelAtPeriodEnd: false,
		entitlementCodes: toOffer.entitlementCodes,
		priceSnapshot: {
			offerId: toOffer._id,
			offerSlug: toOffer.slug,
			recurringAmount: toOffer.recurringAmount,
			currencyCode,
		},
		metadata: { fromPlanChange: true, fromOfferId: fromOffer._id },
		createdAt: now,
		updatedAt: now,
	});

	const existingHistory = subscription.offerHistory ?? [];
	await ctx.db.patch(subscription._id, {
		recurringAmount: toOffer.recurringAmount ?? subscription.recurringAmount,
		currencyCode,
		currentPeriodStartAt: newCycleStart,
		currentPeriodEndAt: newCycleEnd,
		nextBillingAt: newCycleEnd,
		lastInvoiceId: invoice._id,
		scheduledOfferChange: undefined,
		offerHistory: [
			...existingHistory,
			{
				offerId: toOffer._id,
				effectiveAt: now,
				reason: "upgrade_proration",
			},
		],
		updatedAt: now,
	});

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
// INTERNAL MUTATIONS — PAYMENT RESULT HANDLING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle the result of a subscription invoice payment attempt.
 * Called by the renewal action after attempting payment.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const handleInvoicePaymentResult = internalMutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		invoiceId: v.id("commerce_subscription_invoices"),
		succeeded: v.boolean(),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		paymentTransactionId: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		failureCode: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		failureReason: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		correlationId: v.optional(v.string()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		const now = Date.now();
		const correlationId = args.correlationId ?? createCorrelationId();

		const invoice = await ctx.db.get(args.invoiceId);
		if (!invoice) throw new Error("Invoice not found");

		const subscription = await ctx.db.get(invoice.subscriptionId);
		if (!subscription) throw new Error("Subscription not found");

		// Proration invoices (upgrades) flow through a different result path:
		// on success, apply the item swap from the proration event; on failure,
		// mark the invoice failed but do NOT enter dunning (proration is a
		// customer-initiated portal action, not a recurring-billing failure).
		if (invoice.prorationEventId) {
			if (args.succeeded) {
				await applyProrationItemSwap(
					ctx,
					invoice,
					subscription,
					args.paymentTransactionId,
					correlationId,
				);
			} else {
				await ctx.db.patch(invoice._id, {
					status: "failed",
					updatedAt: now,
				});
				await writeHistory(ctx, {
					subscriptionId: subscription._id,
					eventType: "subscription.proration_charge_failed",
					fromStatus: subscription.status,
					toStatus: subscription.status,
					data: {
						invoiceId: invoice._id,
						prorationEventId: invoice.prorationEventId,
						failureReason: args.failureReason,
					},
					correlationId,
				});
			}
			return;
		}

		if (args.succeeded) {
			// === SUCCESS PATH ===
			const currentPeriodEndAt = subscription.currentPeriodEndAt ?? now;
			const nextPeriodStartAt = currentPeriodEndAt;

			// Use a default interval if not stored on subscription
			const billingInterval: BillingInterval = "month";
			const billingIntervalCount = 1;

			// Try to get interval from template
			let template: any = null;
			if (subscription.templateId) {
				template = await ctx.db.get(subscription.templateId);
			}
			const effectiveInterval = template?.billingInterval ?? billingInterval;
			const effectiveCount =
				template?.billingIntervalCount ?? billingIntervalCount;

			const nextPeriodEndAt = addBillingPeriod(
				nextPeriodStartAt,
				effectiveInterval as BillingInterval,
				effectiveCount,
			);

			// Mark invoice as paid
			await ctx.db.patch(invoice._id, {
				status: "paid",
				paidAt: now,
				updatedAt: now,
			});

			// Advance subscription billing period
			await ctx.db.patch(subscription._id, {
				status: "active",
				currentPeriodStartAt: nextPeriodStartAt,
				currentPeriodEndAt: nextPeriodEndAt,
				nextBillingAt: nextPeriodEndAt,
				updatedAt: now,
			});

			// Sync entitlements to active
			const updated = await ctx.db.get(subscription._id);
			if (updated) {
				const product = updated.productId
					? await ctx.db.get(updated.productId)
					: null;
				if (product) {
					const config = await resolveEffectiveConfig(
						ctx,
						product,
						updated.templateId,
					);
					await syncEntitlementsForStatus(
						ctx,
						updated,
						now,
						config.gracePeriodDays ?? 3,
					);
				}
			}

			await writeHistory(ctx, {
				subscriptionId: subscription._id,
				eventType: "subscription.renewed",
				fromStatus: subscription.status,
				toStatus: "active",
				data: {
					invoiceId: invoice._id,
					paymentTransactionId: args.paymentTransactionId,
					nextPeriodEndAt,
				},
				correlationId,
			});

			// Wave 10.2: emit for email subscribers.
			await emitEvent(ctx, "commerce.subscription_renewed", "commerce", {
				subscriptionId: subscription._id,
				userId: subscription.userId,
				invoiceId: invoice._id,
			});
		} else {
			// === FAILURE PATH ===
			const product = subscription.productId
				? await ctx.db.get(subscription.productId)
				: null;
			const config = product
				? await resolveEffectiveConfig(ctx, product, subscription.templateId)
				: { gracePeriodDays: 3, dunningPolicy: DEFAULT_DUNNING_POLICY };

			// Count existing dunning attempts for this subscription
			const existingAttempts = await ctx.db
				.query("commerce_subscription_dunning_attempts")
				.withIndex("by_subscription", (q: any) =>
					q.eq("subscriptionId", subscription._id),
				)
				.collect();
			const attemptNumber = existingAttempts.length + 1;

			const retryDays =
				config.dunningPolicy.retryIntervalsDays[attemptNumber - 1];
			const nextRetryAt =
				retryDays !== undefined ? addDays(now, retryDays) : undefined;

			// Mark invoice as failed
			await ctx.db.patch(invoice._id, {
				status: "failed",
				dueAt: nextRetryAt,
				updatedAt: now,
			});

			// Move subscription to past_due
			if (subscription.status !== "past_due") {
				await ctx.db.patch(subscription._id, {
					status: "past_due",
					updatedAt: now,
				});
			}

			// Record dunning attempt
			await ctx.db.insert("commerce_subscription_dunning_attempts", {
				subscriptionId: subscription._id,
				invoiceId: invoice._id,
				attemptNumber,
				status: "failed",
				scheduledAt: now,
				processedAt: now,
				errorMessage: args.failureReason,
				createdAt: now,
				updatedAt: now,
			});

			// Sync entitlements to grace
			const updated = await ctx.db.get(subscription._id);
			if (updated) {
				await syncEntitlementsForStatus(
					ctx,
					updated,
					now,
					config.gracePeriodDays ?? 3,
				);
			}

			// Wave 10.2: emit past_due so email subscribers can notify the customer.
			await emitEvent(ctx, "commerce.subscription_past_due", "commerce", {
				subscriptionId: subscription._id,
				userId: subscription.userId,
				attemptNumber,
				maxAttempts: config.dunningPolicy.maxAttempts,
			});

			// Check if dunning is exhausted
			if (
				config.dunningPolicy.cancelAfterFinalFailure &&
				attemptNumber >= config.dunningPolicy.maxAttempts
			) {
				const current = await ctx.db.get(subscription._id);
				if (current) {
					await transitionSubscription(ctx, {
						subscription: current,
						toStatus: "cancelled",
						reason: "dunning_exhausted",
						correlationId,
						patch: {},
					});
				}
			}

			await writeHistory(ctx, {
				subscriptionId: subscription._id,
				eventType: "subscription.payment_failed",
				fromStatus: subscription.status,
				toStatus: "past_due",
				reason: args.failureReason,
				data: {
					invoiceId: invoice._id,
					failureCode: args.failureCode,
					attemptNumber,
					nextRetryAt,
				},
				correlationId,
			});
		}

		return { success: true };
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS — EXPIRATION SWEEP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Expire subscriptions that have reached their scheduled cancel date.
 * Transitions pending_cancel -> cancelled when currentPeriodEndAt has passed.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const expirePendingCancellations = internalMutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		limit: v.optional(v.number()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		const now = Date.now();
		const limit = args.limit ?? 100;

		const pendingCancel = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_status", (q: any) => q.eq("status", "pending_cancel"))
			.collect();

		const dueForCancellation = pendingCancel
			.filter(
				(sub: any) =>
					sub.currentPeriodEndAt !== undefined && sub.currentPeriodEndAt <= now,
			)
			.slice(0, limit);

		let cancelledCount = 0;

		for (const subscription of dueForCancellation) {
			await transitionSubscription(ctx, {
				subscription,
				toStatus: "cancelled",
				reason: "period_end_reached",
				correlationId: createCorrelationId(),
				patch: {},
			});
			cancelledCount++;
		}

		return { cancelledCount };
	},
});

/**
 * Process a single scheduled dunning attempt.
 * Marks the attempt as processing, then schedules the actual payment action.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const processScheduledDunning = internalMutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		dunningAttemptId: v.id("commerce_subscription_dunning_attempts"),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requirePluginEnabled(ctx, "commerceSubscriptions");
		const now = Date.now();
		const attempt = await ctx.db.get(args.dunningAttemptId);
		if (!attempt || attempt.status !== "scheduled") {
			return { skipped: true };
		}

		await ctx.db.patch(args.dunningAttemptId, {
			status: "processing",
			processedAt: now,
			updatedAt: now,
		});

		// The action layer will pick up processing attempts and actually charge
		// For now, mark ready for the action to handle
		return {
			subscriptionId: attempt.subscriptionId,
			invoiceId: attempt.invoiceId,
			attemptNumber: attempt.attemptNumber,
		};
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// DUNNING SUPPORT — RETRYABLE ATTEMPTS + OUTCOME RECORDING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Query retryable dunning attempts: `commerce_subscription_dunning_attempts`
 * rows with `status === "scheduled"` whose associated invoice is still
 * `failed` and the subscription is `past_due`.
 *
 * Called by the dunning action (actions cannot read DB directly).
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const getRetryableDunningAttempts = internalQuery({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		limit: v.optional(v.number()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return [];
		const now = Date.now();
		const limit = args.limit ?? 100;

		const scheduled = await ctx.db
			.query("commerce_subscription_dunning_attempts")
			.withIndex("by_status", (q: any) => q.eq("status", "scheduled"))
			.collect();

		const due = scheduled
			.filter((a: any) => a.scheduledAt !== undefined && a.scheduledAt <= now)
			.slice(0, limit);

		return due.map((a: any) => ({
			attemptId: a._id,
			subscriptionId: a.subscriptionId,
			invoiceId: a.invoiceId,
			attemptNumber: a.attemptNumber,
		}));
	},
});

/**
 * Mark a dunning attempt as aborted (invoice gone or unrecoverable).
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const abortDunningAttempt = internalMutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		attemptId: v.id("commerce_subscription_dunning_attempts"),
		reason: v.string(),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		const now = Date.now();
		await ctx.db.patch(args.attemptId, {
			status: "aborted",
			processedAt: now,
			errorMessage: args.reason,
			updatedAt: now,
		});
	},
});

/**
 * Mark a dunning attempt as succeeded.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const completeDunningAttempt = internalMutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		attemptId: v.id("commerce_subscription_dunning_attempts"),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		outcome: v.literal("success"),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		const now = Date.now();
		await ctx.db.patch(args.attemptId, {
			status: "succeeded",
			processedAt: now,
			updatedAt: now,
		});
	},
});

/**
 * Record a dunning charge failure. Updates the attempt row, schedules the
 * next retry (or cancels the subscription if max attempts is reached).
 *
 * Returns `{ cancelled: boolean, nextRetryAt? }`.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const recordDunningFailure = internalMutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		attemptId: v.id("commerce_subscription_dunning_attempts"),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		subscriptionId: v.id("commerce_subscriptions"),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		invoiceId: v.id("commerce_subscription_invoices"),
		attemptNumber: v.number(),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		failureReason: v.optional(v.string()),
		maxAttempts: v.number(),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		retryDays: v.array(v.number()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		const now = Date.now();
		const correlationId = createCorrelationId();

		// Mark this attempt as failed.
		await ctx.db.patch(args.attemptId, {
			status: "failed",
			processedAt: now,
			errorMessage: args.failureReason,
			updatedAt: now,
		});

		// Mark the invoice as failed too (update dueAt to the next retry time).
		const nextRetryDays = args.retryDays[args.attemptNumber]; // 0-indexed next attempt
		const nextRetryAt =
			nextRetryDays !== undefined ? addDays(now, nextRetryDays) : undefined;

		await ctx.db.patch(args.invoiceId, {
			status: "failed",
			dueAt: nextRetryAt,
			updatedAt: now,
		});

		const subscription = await ctx.db.get(args.subscriptionId);
		if (!subscription) return { cancelled: false };

		// Check if dunning is exhausted.
		if (args.attemptNumber >= args.maxAttempts) {
			// Cancel the subscription.
			await transitionSubscription(ctx, {
				subscription,
				toStatus: "cancelled",
				reason: "dunning_exhausted",
				correlationId,
				patch: {},
			});

			await writeHistory(ctx, {
				subscriptionId: args.subscriptionId,
				eventType: "subscription.dunning_exhausted",
				fromStatus: subscription.status,
				toStatus: "cancelled",
				reason: "dunning_exhausted",
				data: {
					invoiceId: args.invoiceId,
					attemptNumber: args.attemptNumber,
					failureReason: args.failureReason,
				},
				correlationId,
			});

			return { cancelled: true };
		}

		// Schedule the next dunning attempt.
		if (nextRetryAt !== undefined) {
			await ctx.db.insert("commerce_subscription_dunning_attempts", {
				subscriptionId: args.subscriptionId,
				invoiceId: args.invoiceId,
				attemptNumber: args.attemptNumber + 1,
				status: "scheduled",
				scheduledAt: nextRetryAt,
				processedAt: undefined,
				errorMessage: undefined,
				createdAt: now,
				updatedAt: now,
			});
		}

		await writeHistory(ctx, {
			subscriptionId: args.subscriptionId,
			eventType: "subscription.payment_failed",
			fromStatus: subscription.status,
			toStatus: subscription.status,
			reason: args.failureReason,
			data: {
				invoiceId: args.invoiceId,
				attemptNumber: args.attemptNumber,
				nextRetryAt,
			},
			correlationId,
		});

		return { cancelled: false, nextRetryAt };
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// RENEWAL SUPPORT — INVOICE FETCH FOR ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch a single invoice for the renewal action (actions cannot read DB
 * directly). Returns only the fields the action needs to decide how to
 * charge.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const getInvoiceForRenewal = internalQuery({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		invoiceId: v.id("commerce_subscription_invoices"),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		const invoice = await ctx.db.get(args.invoiceId);
		if (!invoice) return null;
		const subscription = await ctx.db.get(invoice.subscriptionId);
		let email: string | undefined;
		if (subscription?.userId) {
			const user = await ctx.db.get(subscription.userId);
			email = user?.email;
		}
		return {
			_id: invoice._id,
			totalAmount: invoice.totalAmount,
			currencyCode: invoice.currencyCode,
			savedPaymentMethodId:
				invoice.savedPaymentMethodId ?? subscription?.defaultPaymentMethodId,
			stripeCustomerId: subscription?.stripeCustomerId,
			subscriptionId: invoice.subscriptionId,
			manualBilling: invoice.manualBilling,
			email,
		};
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL QUERIES — CHECKOUT INTENT LOOKUP FOR CHARGING (Wave 9.1)
// ═══════════════════════════════════════════════════════════════════════════

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getCheckoutIntentForCharge = internalQuery({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		checkoutIntentId: v.id("commerce_subscription_checkout_intents"),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		const intent = await ctx.db.get(args.checkoutIntentId);
		if (!intent) return null;
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getCheckoutIntentByPaymentIntent = internalQuery({
	args: {
		paymentIntentId: v.string(),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		const intent = await ctx.db
			.query("commerce_subscription_checkout_intents")
			.filter((q: any) =>
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const recordFirstChargeIntent = internalMutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		checkoutIntentId: v.id("commerce_subscription_checkout_intents"),
		stripeCustomerId: v.string(),
		paymentIntentId: v.string(),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await ctx.db.patch(args.checkoutIntentId, {
			stripeCustomerId: args.stripeCustomerId,
			paymentProvider: "stripe",
			paymentTransactionId: args.paymentIntentId,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Activate a checkout intent from a successful Stripe first-charge webhook.
 * Records the Stripe IDs on the intent and then delegates to the canonical
 * activation mutation so webhook-driven signups create the real subscription
 * contract and initial membership bridge in the same way as other flows.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const activateCheckoutIntentFromStripe = internalMutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		checkoutIntentId: v.id("commerce_subscription_checkout_intents"),
		paymentIntentId: v.string(),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		paymentMethodId: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		stripeCustomerId: v.optional(v.string()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		const intent = await ctx.db.get(args.checkoutIntentId);
		if (!intent) return;

		await ctx.db.patch(args.checkoutIntentId, {
			savedPaymentMethodId: intent.savedPaymentMethodId ?? args.paymentMethodId,
			stripeCustomerId: intent.stripeCustomerId ?? args.stripeCustomerId,
			paymentTransactionId: args.paymentIntentId,
			paymentProvider: "stripe",
			updatedAt: Date.now(),
		});

		if (intent.status !== "payment_pending" && intent.status !== "draft") {
			return;
		}

		await ctx.runMutation(
			api.commerceSubscriptions.checkout.activateFromIntent,
			{
				intentId: args.checkoutIntentId,
				paymentResult: {
					provider: "stripe",
					providerTransactionId: args.paymentIntentId,
					status: "succeeded",
					paymentMethodId: args.paymentMethodId ?? intent.savedPaymentMethodId,
					stripeCustomerId: args.stripeCustomerId ?? intent.stripeCustomerId,
				},
			},
		);
	},
});

/**
 * Activate a paid-recurring, zero-initial checkout from a successful Stripe
 * SetupIntent. This covers trials and $0 initial invoices where there is no
 * first charge, but a reusable payment method is still required for renewal.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const activateCheckoutIntentFromStripeSetup = internalMutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		checkoutIntentId: v.id("commerce_subscription_checkout_intents"),
		setupIntentId: v.string(),
		paymentMethodId: v.string(),
		stripeCustomerId: v.string(),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		const intent = await ctx.db.get(args.checkoutIntentId);
		if (!intent) return;

		await ctx.db.patch(args.checkoutIntentId, {
			savedPaymentMethodId: args.paymentMethodId,
			stripeCustomerId: args.stripeCustomerId,
			paymentTransactionId: args.setupIntentId,
			paymentProvider: "stripe",
			updatedAt: Date.now(),
		});

		if (intent.status !== "payment_pending" && intent.status !== "draft") {
			return;
		}

		await ctx.runMutation(
			api.commerceSubscriptions.checkout.activateFromIntent,
			{
				intentId: args.checkoutIntentId,
				paymentResult: {
					provider: "stripe",
					providerTransactionId: args.setupIntentId,
					status: "succeeded",
					paymentMethodId: args.paymentMethodId,
					stripeCustomerId: args.stripeCustomerId,
				},
			},
		);
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const recordSavedPaymentMethod = internalMutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		checkoutIntentId: v.id("commerce_subscription_checkout_intents"),
		stripeCustomerId: v.string(),
		paymentMethodId: v.string(),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		const intent = await ctx.db.get(args.checkoutIntentId);
		if (!intent) return;
		await ctx.db.patch(args.checkoutIntentId, {
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
				await ctx.db.patch(intent.subscriptionId, {
					defaultPaymentMethodId:
						sub.defaultPaymentMethodId ?? args.paymentMethodId,
					stripeCustomerId: sub.stripeCustomerId ?? args.stripeCustomerId,
					paymentProvider: "stripe",
					updatedAt: Date.now(),
				});
			}
		}
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULED OFFER CHANGE APPLICATION (Step 1.e)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply any scheduled offer changes whose `effectiveAt` has passed.
 * Called by the renewal action after billing completes so the new price
 * takes effect on the next cycle.
 *
 * Per contract: updates the active subscription_item to point to the new
 * offer, clears `scheduledOfferChange`, and appends to `offerHistory`.
 */
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const applyDueScheduledOfferChanges = internalMutation({
	args: {},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx) => {
		const now = Date.now();

		// Collect contracts that have a scheduled offer change due.
		const active = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_status", (q: any) => q.eq("status", "active"))
			.collect();

		let applied = 0;

		for (const subscription of active) {
			const change = subscription.scheduledOfferChange;
			if (!change) continue;
			if (change.effectiveAt > now) continue;

			const toOffer = await ctx.db.get(change.toOfferId);
			if (!toOffer) {
				// Offer was deleted — clear the stale scheduled change.
				await ctx.db.patch(subscription._id, {
					scheduledOfferChange: undefined,
					updatedAt: now,
				});
				continue;
			}

			// Update the active subscription item to the new offer.
			const items = await ctx.db
				.query("commerce_subscription_items")
				.withIndex("by_subscription", (q: any) =>
					q.eq("subscriptionId", subscription._id),
				)
				.collect();
			const activeItem =
				items.find((it: any) => it.status === "active") ??
				items.find((it: any) => it.status === "pending_cancel") ??
				items[0];

			if (activeItem) {
				// Cancel the old item.
				await ctx.db.patch(activeItem._id, {
					status: "cancelled",
					cancelledAt: now,
					updatedAt: now,
				});

				// Insert a new item for the new offer.
				await ctx.db.insert("commerce_subscription_items", {
					subscriptionId: subscription._id,
					sourceOfferId: toOffer._id,
					sourceOfferItemId: undefined,
					productId: toOffer.productId,
					variantId: toOffer.variantId,
					bundleId: toOffer.bundleId,
					titleSnapshot: toOffer.title,
					quantity: 1,
					unitAmount: toOffer.recurringAmount ?? 0,
					unitRecurringAmount: toOffer.recurringAmount ?? 0,
					unitSetupFeeAmount: toOffer.setupFeeAmount ?? 0,
					currencyCode: toOffer.currencyCode ?? subscription.currencyCode,
					status: "active",
					startsAt: now,
					currentPeriodEndAt: subscription.currentPeriodEndAt,
					cancelAtPeriodEnd: false,
					cancelledAt: undefined,
					entitlementCodes: toOffer.entitlementCodes,
					priceSnapshot: {
						offerId: toOffer._id,
						offerSlug: toOffer.slug,
						recurringAmount: toOffer.recurringAmount,
						currencyCode: toOffer.currencyCode ?? subscription.currencyCode,
					},
					createdAt: now,
					updatedAt: now,
				});
			}

			// Patch contract: apply the new recurring amount, clear scheduled change,
			// append to offerHistory.
			const existingHistory = subscription.offerHistory ?? [];
			await ctx.db.patch(subscription._id, {
				recurringAmount:
					toOffer.recurringAmount ?? subscription.recurringAmount,
				scheduledOfferChange: undefined,
				offerHistory: [
					...existingHistory,
					{
						offerId: toOffer._id,
						effectiveAt: now,
						reason: "scheduled_downgrade_applied",
					},
				],
				updatedAt: now,
			});

			await writeHistory(ctx, {
				subscriptionId: subscription._id,
				eventType: "subscription.scheduled_offer_change_applied",
				fromStatus: subscription.status,
				toStatus: subscription.status,
				data: {
					fromItemId: activeItem?._id,
					toOfferId: toOffer._id,
					scheduledEffectiveAt: change.effectiveAt,
					appliedAt: now,
				},
			});

			applied++;
		}

		return { applied };
	},
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
// @ts-expect-error TS2589: Convex union-schema types exceed TypeScript's type instantiation depth limit in strict mode.
export const getMyInvoiceForPdf = internalQuery({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		invoiceId: v.id("commerce_subscription_invoices"),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		if (!(await isPluginEnabled(ctx, "commerceSubscriptions"))) return null;

		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;
		// Admin-side Convex Auth uses `identity.subject` as the user id ref;
		// website-side Clerk auth produces a subject == clerkUserId. We try
		// clerkUserId first (the website path) then fall back to email.
		let user: any = await ctx.db
			.query("users")
			.withIndex("by_clerkUserId", (q: any) =>
				q.eq("clerkUserId", identity.subject),
			)
			.unique();
		if (!user && typeof identity.email === "string") {
			const email = identity.email; // narrowed to string
			user = await ctx.db
				.query("users")
				.withIndex("by_email", (q: any) => q.eq("email", email.toLowerCase()))
				.first();
		}
		if (!user) return null;

		const invoice = await ctx.db.get(args.invoiceId);
		if (!invoice) return null;

		const subscription = await ctx.db.get(invoice.subscriptionId);
		if (!subscription) return null;
		if (subscription.userId !== user._id) return null;

		const items = await ctx.db
			.query("commerce_subscription_invoice_items")
			.withIndex("by_invoice", (q: any) => q.eq("invoiceId", args.invoiceId))
			.collect();

		// Resolve the current offer title (via the active subscription_item) so
		// the "Plan: …" line shows something human-readable.
		let offerTitle: string | undefined;
		const subItems = await ctx.db
			.query("commerce_subscription_items")
			.withIndex("by_subscription", (q: any) =>
				q.eq("subscriptionId", subscription._id),
			)
			.collect();
		const activeItem =
			subItems.find((it: any) => it.status === "active") ??
			subItems.find((it: any) => it.status === "pending_cancel") ??
			subItems[0];
		if (activeItem?.sourceOfferId) {
			const offer = await ctx.db.get(activeItem.sourceOfferId);
			if (offer) {
				offerTitle = offer.title;
			}
		}

		return {
			invoice,
			items,
			subscription: {
				_id: subscription._id,
				status: subscription.status,
			},
			offerTitle,
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const emitTrialEndingEvents = internalMutation({
	args: {},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx) => {
		const now = Date.now();
		const threeDays = 3 * 24 * 60 * 60 * 1000;
		const fourDays = 4 * 24 * 60 * 60 * 1000;

		const trialing = await ctx.db
			.query("commerce_subscriptions")
			.withIndex("by_status", (q: any) => q.eq("status", "trialing"))
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
			await ctx.db.patch(sub._id, {
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
